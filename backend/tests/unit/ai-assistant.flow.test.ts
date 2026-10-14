/**
 * Integration-style tests for the AI assistant orchestration: the tool loop's
 * guards (dedup, repeat, circuit breaker, argument validation), the write-
 * approval pause, and the approve/reject resume flow — with the LLM, database,
 * tool executor and tool selection mocked at their module boundaries.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// Test-controlled hooks the hoisted jest.mock factories delegate to.
const hooks = globalThis as unknown as {
  __query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount?: number }>;
  __llm: (opts: unknown) => Promise<{ content: string; toolCalls: unknown[]; finishReason: string | null }>;
  __exec: (
    name: string,
    args: Record<string, unknown>,
    signal?: AbortSignal
  ) => Promise<{ status: number; data?: unknown; error?: string }>;
  __validate: (name: string, args: Record<string, unknown>) => { ok: true } | { ok: false; errors: string[] };
  __customTools: Record<string, unknown>;
  __operations: Record<string, { method: string; pathTemplate: string }>;
};

jest.mock('../../src/utils/database', () => ({
  pool: () => ({ query: (sql: string, params?: unknown[]) => hooks.__query(sql, params) }),
}));
jest.mock('../../src/services/ai/llm-stream.service', () => ({
  // Keep the real error classes/helpers (LLMError, isAbortError, …); stub the network call.
  ...jest.requireActual('../../src/services/ai/llm-stream.service'),
  streamChatCompletion: (opts: unknown) => hooks.__llm(opts),
}));
jest.mock('../../src/services/ai/tool-selection.service', () => ({
  selectTools: async () => [],
  isToolAllowedForRoles: () => true,
}));
jest.mock('../../src/services/ai/tool-executor.service', () => ({
  executeToolCall: (
    name: string,
    args: Record<string, unknown>,
    _token: string,
    _roles: string[],
    signal?: AbortSignal
  ) => hooks.__exec(name, args, signal),
  isWriteTool: (name: string) => /^(post|put|patch|delete)_/.test(name) || name === 'log_time_entry',
}));
jest.mock('../../src/services/ai/ai-tool-registry.service', () => ({
  getCustomToolByName: (name: string) => hooks.__customTools[name],
}));
jest.mock('../../src/services/ai/openapi-tool-builder.service', () => ({
  validateToolArguments: (name: string, args: Record<string, unknown>) => hooks.__validate(name, args),
  getOperationByName: (name: string) => hooks.__operations[name],
}));
jest.mock('../../src/services/ai/system-prompt.builder', () => ({
  buildSystemPrompt: () => 'SYS',
}));
jest.mock('../../src/services/ai/conversation-history.service', () => ({
  loadHistory: async () => [],
}));

import { AIAssistantService, ToolApprovalDecision } from '../../src/services/ai/ai-assistant.service';
import { LLMError } from '../../src/services/ai/llm-stream.service';
import { isRunActive, runLockKey } from '../../src/services/ai/run-lock';

const CONV = '123e4567-e89b-12d3-a456-426614174999';

interface Recorded {
  sql: string;
  params: unknown[];
}

function makeCall(id: string, name: string, args: Record<string, unknown> | string) {
  return {
    id,
    type: 'function',
    function: { name, arguments: typeof args === 'string' ? args : JSON.stringify(args) },
  };
}

describe('AIAssistantService orchestration', () => {
  let queries: Recorded[];
  let events: Array<Record<string, unknown>>;
  let llmRounds: Array<{ content: string; toolCalls: any[]; finishReason: string | null }>;
  let llmCallCount: number;
  let execCalls: Array<{ name: string; args: Record<string, unknown> }>;
  let execSignals: Array<AbortSignal | undefined>;
  let execResult: (name: string) => { status: number; data?: unknown; error?: string };
  let claimRows: unknown[];
  /** What the conversation lookup returns: which token started it, with that token's permissions. */
  let conversationRows: unknown[];

  const emit = (e: Record<string, unknown>) => events.push(e);

  beforeEach(() => {
    queries = [];
    events = [];
    llmRounds = [];
    llmCallCount = 0;
    execCalls = [];
    execSignals = [];
    execResult = () => ({ status: 200, data: { ok: true } });
    claimRows = [];
    conversationRows = [{ api_token_id: null, permissions: null }];
    hooks.__customTools = {};
    hooks.__operations = {};

    hooks.__query = async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params: params ?? [] });
      if (sql.includes('FROM settings')) {
        return {
          rows: [{ ai_enabled: true, ai_provider: 'lm_studio', ai_api_url: 'http://x/v1', ai_api_key: 'k', ai_model: 'm' }],
        };
      }
      if (sql.includes('INSERT INTO ai_conversations')) return { rows: [{ id: CONV }] };
      if (sql.includes('FROM ai_conversations c')) return { rows: conversationRows };
      if (sql.includes('RETURNING id, metadata')) {
        // Mirrors the claim's "($2::uuid IS NULL OR id = $2::uuid)" batch filter.
        const batch = params?.[1];
        return { rows: claimRows.filter((r: any) => batch == null || r.id === batch) };
      }
      if (sql.includes('RETURNING id')) return { rows: [{ id: `amsg-${queries.length}` }] };
      return { rows: [] };
    };
    hooks.__llm = async () => {
      const round = llmRounds[Math.min(llmCallCount, llmRounds.length - 1)];
      llmCallCount++;
      return round ?? { content: 'done', toolCalls: [], finishReason: 'stop' };
    };
    hooks.__exec = async (name, args, signal) => {
      execCalls.push({ name, args });
      execSignals.push(signal);
      return execResult(name);
    };
    hooks.__validate = () => ({ ok: true });
  });

  async function run(): Promise<AIAssistantService> {
    const svc = new AIAssistantService();
    await svc.initialize('user-1');
    await svc.runStream('user-1', CONV, 'hello', 'User', 'u@x', 'en', 'Bearer t', [], emit);
    return svc;
  }

  it('executes read tools and finishes with a final answer', async () => {
    llmRounds = [
      { content: '', toolCalls: [makeCall('t1', 'get_projects', {})], finishReason: 'tool_calls' },
      { content: 'All done.', toolCalls: [], finishReason: 'stop' },
    ];
    await run();

    expect(execCalls).toEqual([{ name: 'get_projects', args: {} }]);
    expect(events.some((e) => e.type === 'TOOL_CALL_RESULT' && e.toolCallId === 't1')).toBe(true);
    expect(events.some((e) => e.type === 'RUN_FINISHED')).toBe(true);
    expect(events.some((e) => e.type === 'TOOL_APPROVAL_REQUIRED')).toBe(false);
    const finalInsert = queries.find((q) => q.sql.includes("INSERT INTO ai_messages") && q.params[1] === 'All done.');
    expect(finalInsert).toBeDefined();
  });

  it('pauses for approval on write tools without executing them', async () => {
    llmRounds = [
      {
        content: 'Here is my plan.',
        toolCalls: [makeCall('w1', 'post_time_entries', { a: 1 }), makeCall('w2', 'post_time_entries', { a: 2 })],
        finishReason: 'tool_calls',
      },
    ];
    await run();

    expect(execCalls).toHaveLength(0); // nothing executed
    expect(llmCallCount).toBe(1); // loop paused, no further rounds
    const approval = events.find((e) => e.type === 'TOOL_APPROVAL_REQUIRED') as any;
    expect(approval).toBeDefined();
    expect(approval.planText).toBe('Here is my plan.');
    expect(approval.actions).toHaveLength(2);
    const metaUpdate = queries.find(
      (q) => q.sql.includes('SET metadata') && String(q.params[0]).includes('awaiting_approval')
    );
    expect(metaUpdate).toBeDefined();
    expect(events.some((e) => e.type === 'RUN_FINISHED')).toBe(true);
  });

  it('resume executes approved writes and records declined ones without executing', async () => {
    const pending = [makeCall('w1', 'post_time_entries', { a: 1 }), makeCall('w2', 'post_time_entries', { a: 2 })];
    claimRows = [{ id: 'amsg-1', metadata: { status: 'resolved', pending } }];
    llmRounds = [{ content: 'Created.', toolCalls: [], finishReason: 'stop' }];

    const svc = new AIAssistantService();
    await svc.initialize('user-1');
    const approvals: ToolApprovalDecision[] = [
      { toolCallId: 'w1', decision: 'approve' },
      { toolCallId: 'w2', decision: 'reject' },
    ];
    await svc.resumeRun('user-1', CONV, approvals, 'User', 'u@x', 'en', 'Bearer t', [], emit);

    expect(execCalls).toEqual([{ name: 'post_time_entries', args: { a: 1 } }]);
    const declinedInsert = queries.find(
      (q) => q.sql.includes("'tool'") && String(q.params[1]).includes('declined') && q.params[2] === 'w2'
    );
    expect(declinedInsert).toBeDefined();
    expect(events.some((e) => e.type === 'RUN_FINISHED')).toBe(true);
  });

  it('resume executes user-EDITED arguments and records the edit truthfully', async () => {
    const pending = [makeCall('w1', 'post_time_entries', { hours: 3 })];
    claimRows = [{ id: 'amsg-1', metadata: { status: 'resolved', pending } }];
    llmRounds = [{ content: 'Done.', toolCalls: [], finishReason: 'stop' }];

    const svc = new AIAssistantService();
    await svc.initialize('user-1');
    await svc.resumeRun(
      'user-1',
      CONV,
      [{ toolCallId: 'w1', decision: 'approve', editedArguments: { hours: 2 } }],
      'User',
      'u@x',
      'en',
      'Bearer t',
      [],
      emit
    );

    expect(execCalls).toEqual([{ name: 'post_time_entries', args: { hours: 2 } }]); // edited value executed
    const recorded = queries.find((q) => q.sql.includes("'tool'") && q.params[2] === 'w1');
    expect(String(recorded?.params[1])).toContain('edited_by_user');
    expect(events.some((e) => e.type === 'RUN_FINISHED')).toBe(true);
  });

  it('at-most-once: an executed write whose result-record fails is NOT re-armed (no double execution)', async () => {
    // w1 approved: its tool executes, but recording the result throws (DB blip).
    // w2 is never reached. The re-arm must exclude w1 (already executed) and
    // include only w2 (never started).
    const pending = [makeCall('w1', 'post_time_entries', { a: 1 }), makeCall('w2', 'post_time_entries', { a: 2 })];
    claimRows = [{ id: 'amsg-1', metadata: { status: 'resolved', pending } }];

    const baseQuery = hooks.__query;
    hooks.__query = async (sql: string, params?: unknown[]) => {
      // Fail the INSERT of w1's tool result, AFTER its executeToolCall side effect.
      if (sql.includes("'tool'") && params?.[2] === 'w1') {
        queries.push({ sql, params: params ?? [] });
        throw new Error('simulated DB failure while recording w1 result');
      }
      return baseQuery(sql, params);
    };

    const svc = new AIAssistantService();
    await svc.initialize('user-1');
    await svc.resumeRun(
      'user-1',
      CONV,
      [
        { toolCallId: 'w1', decision: 'approve' },
        { toolCallId: 'w2', decision: 'approve' },
      ],
      'User',
      'u@x',
      'en',
      'Bearer t',
      [],
      emit
    );

    // w1 executed exactly once; w2 never executed (loop threw before reaching it).
    expect(execCalls).toEqual([{ name: 'post_time_entries', args: { a: 1 } }]);
    // Re-arm UPDATE must carry only w2 — w1 is excluded so a retry cannot re-run it.
    const rearm = queries.find(
      (q) => q.sql.includes('SET metadata') && String(q.params[0]).includes('awaiting_approval')
    );
    expect(rearm).toBeDefined();
    const rearmed = JSON.parse(String(rearm!.params[0])) as { pending: Array<{ id: string }> };
    expect(rearmed.pending.map((t) => t.id)).toEqual(['w2']);
    expect(events.some((e) => e.type === 'RUN_ERROR')).toBe(true);
  });

  it('resume with no pending approval (double click) reports NO_PENDING and executes nothing', async () => {
    claimRows = []; // atomic claim finds nothing — already claimed
    const svc = new AIAssistantService();
    await svc.initialize('user-1');
    await svc.resumeRun('user-1', CONV, [{ toolCallId: 'w1', decision: 'approve' }], 'User', 'u@x', 'en', 'B', [], emit);

    expect(execCalls).toHaveLength(0);
    expect(events.some((e) => e.type === 'RUN_ERROR' && e.code === 'NO_PENDING')).toBe(true);
    // AG-UI: an errored run ends with RUN_ERROR — nothing after it.
    expect(events[events.length - 1]).toMatchObject({ type: 'RUN_ERROR', code: 'NO_PENDING' });
    expect(events.some((e) => e.type === 'RUN_FINISHED')).toBe(false);
  });

  describe('approval batches (batchId)', () => {
    const BATCH = '0f8fad5b-d9cb-469f-a165-70867728950e';
    const OTHER = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

    it('emits batchId = id of the assistant message holding the pending actions', async () => {
      llmRounds = [
        { content: 'Plan.', toolCalls: [makeCall('w1', 'post_time_entries', { a: 1 })], finishReason: 'tool_calls' },
      ];
      await run();

      const approval = events.find((e) => e.type === 'TOOL_APPROVAL_REQUIRED') as any;
      const assistantInsert = queries.find((q) => q.sql.includes("'assistant'") && q.sql.includes('RETURNING id'));
      const metaUpdate = queries.find(
        (q) => q.sql.includes('SET metadata') && String(q.params[0]).includes('awaiting_approval')
      );
      expect(approval.batchId).toBeDefined();
      expect(metaUpdate!.params[1]).toBe(approval.batchId); // same row as the pending list
      expect(assistantInsert).toBeDefined();
    });

    it('executes when batchId matches the current awaiting batch', async () => {
      claimRows = [{ id: BATCH, metadata: { status: 'resolved', pending: [makeCall('w1', 'post_time_entries', { a: 1 })] } }];
      llmRounds = [{ content: 'Created.', toolCalls: [], finishReason: 'stop' }];
      const svc = new AIAssistantService();
      await svc.initialize('user-1');
      await svc.resumeRun('user-1', CONV, [{ toolCallId: 'w1', decision: 'approve' }], 'U', 'u@x', 'en', 'B', [], emit, undefined, BATCH);

      expect(execCalls).toHaveLength(1);
      const claim = queries.find((q) => q.sql.includes('RETURNING id, metadata'));
      expect(claim!.params[1]).toBe(BATCH);
      expect(events.some((e) => e.type === 'RUN_FINISHED')).toBe(true);
    });

    it('refuses a stale batchId with STALE_APPROVAL — nothing executed or declined', async () => {
      claimRows = [{ id: BATCH, metadata: { status: 'resolved', pending: [makeCall('w1', 'post_time_entries', { a: 1 })] } }];
      const svc = new AIAssistantService();
      await svc.initialize('user-1');
      await svc.resumeRun('user-1', CONV, [{ toolCallId: 'w1', decision: 'approve' }], 'U', 'u@x', 'en', 'B', [], emit, undefined, OTHER);

      expect(execCalls).toHaveLength(0);
      expect(queries.some((q) => q.sql.includes("'tool'"))).toBe(false); // no declined results either
      expect(events[events.length - 1]).toMatchObject({ type: 'RUN_ERROR', code: 'STALE_APPROVAL' });
      expect(events.some((e) => e.type === 'RUN_FINISHED')).toBe(false);
    });

    it('treats a malformed batchId as stale without querying', async () => {
      const svc = new AIAssistantService();
      await svc.initialize('user-1');
      await svc.resumeRun('user-1', CONV, [{ toolCallId: 'w1', decision: 'approve' }], 'U', 'u@x', 'en', 'B', [], emit, undefined, 'not-a-uuid');

      expect(queries.some((q) => q.sql.includes('RETURNING id, metadata'))).toBe(false);
      expect(events.some((e) => e.type === 'RUN_ERROR' && e.code === 'STALE_APPROVAL')).toBe(true);
    });

    it('without batchId keeps the legacy behaviour (claims the newest awaiting batch)', async () => {
      claimRows = [{ id: BATCH, metadata: { status: 'resolved', pending: [makeCall('w1', 'post_time_entries', { a: 1 })] } }];
      llmRounds = [{ content: 'ok', toolCalls: [], finishReason: 'stop' }];
      const svc = new AIAssistantService();
      await svc.initialize('user-1');
      await svc.resumeRun('user-1', CONV, [{ toolCallId: 'w1', decision: 'approve' }], 'U', 'u@x', 'en', 'B', [], emit);

      const claim = queries.find((q) => q.sql.includes('RETURNING id, metadata'));
      expect(claim!.params[1]).toBeNull();
      expect(execCalls).toHaveLength(1);
    });
  });

  describe('client disconnect (abort)', () => {
    it('does not abort an approved write in flight, and re-arms the untouched rest', async () => {
      const pending = [makeCall('w1', 'post_time_entries', { a: 1 }), makeCall('w2', 'post_time_entries', { a: 2 })];
      claimRows = [{ id: 'amsg-1', metadata: { status: 'resolved', pending } }];
      const abort = new AbortController();
      // The client disconnects while w1 is executing.
      hooks.__exec = async (name, args, signal) => {
        execCalls.push({ name, args });
        execSignals.push(signal);
        abort.abort();
        return { status: 201, data: { id: 'created' } };
      };

      const svc = new AIAssistantService();
      await svc.initialize('user-1');
      await svc.resumeRun(
        'user-1',
        CONV,
        [
          { toolCallId: 'w1', decision: 'approve' },
          { toolCallId: 'w2', decision: 'approve' },
        ],
        'U',
        'u@x',
        'en',
        'B',
        [],
        emit,
        abort.signal
      );

      // w1 ran WITHOUT the abort signal and its success was recorded as such…
      expect(execCalls).toEqual([{ name: 'post_time_entries', args: { a: 1 } }]);
      expect(execSignals[0]).toBeUndefined();
      const w1Result = queries.find((q) => q.sql.includes("'tool'") && q.params[2] === 'w1');
      expect(String(w1Result!.params[1])).toContain('created');
      // …w2 was never started and is re-armed for a later decision…
      const rearm = queries.find(
        (q) => q.sql.includes('SET metadata') && String(q.params[0]).includes('awaiting_approval')
      );
      expect(JSON.parse(String(rearm!.params[0])).pending.map((t: any) => t.id)).toEqual(['w2']);
      // …and the run stops quietly: no further LLM round, no RUN_ERROR to a closed socket.
      expect(llmCallCount).toBe(0);
      expect(events.some((e) => e.type === 'RUN_ERROR')).toBe(false);
    });

    it('passes the abort signal to read tools and stops the loop once aborted', async () => {
      const abort = new AbortController();
      llmRounds = [
        { content: '', toolCalls: [makeCall('t1', 'get_projects', {})], finishReason: 'tool_calls' },
        { content: 'never', toolCalls: [], finishReason: 'stop' },
      ];
      hooks.__exec = async (name, args, signal) => {
        execCalls.push({ name, args });
        execSignals.push(signal);
        abort.abort(); // client goes away during the read
        return { status: 200, data: [] };
      };
      const svc = new AIAssistantService();
      await svc.initialize('user-1');
      await svc.runStream('user-1', CONV, 'hello', 'User', 'u@x', 'en', 'Bearer t', [], emit, abort.signal);

      expect(execSignals[0]).toBe(abort.signal);
      expect(llmCallCount).toBe(1); // no second round after the abort
      expect(events.some((e) => e.type === 'RUN_ERROR')).toBe(false);
    });
  });

  describe('RUN_ERROR classification', () => {
    it('forwards LLM failures with their code and a generic message', async () => {
      hooks.__llm = async () => {
        throw new LLMError('LLM_UNREACHABLE', 'connect ECONNREFUSED 10.0.0.5:1234');
      };
      await run();
      const err = events.find((e) => e.type === 'RUN_ERROR') as any;
      expect(err.code).toBe('LLM_UNREACHABLE');
      expect(err.message).not.toContain('10.0.0.5');
    });

    it('maps unexpected errors to INTERNAL without leaking their text', async () => {
      hooks.__llm = async () => {
        throw new Error('relation "ai_messages" does not exist at db.internal:5432');
      };
      await run();
      const err = events.find((e) => e.type === 'RUN_ERROR') as any;
      expect(err.code).toBe('INTERNAL');
      expect(err.message).not.toMatch(/relation|db\.internal/);
    });
  });

  describe('tool-call persistence', () => {
    it('persists canonicalized arguments, and {} for unparseable ones', async () => {
      llmRounds = [
        {
          content: '',
          toolCalls: [
            makeCall('c1', 'get_projects', JSON.stringify(JSON.stringify({ b: 2, a: 1 }))), // double-encoded
            makeCall('c2', 'get_clients', '{broken'),
          ],
          finishReason: 'tool_calls',
        },
        { content: 'done', toolCalls: [], finishReason: 'stop' },
      ];
      await run();

      const insert = queries.find((q) => q.sql.includes('tool_calls) VALUES'));
      const stored = JSON.parse(String(insert!.params[2]));
      expect(stored[0].function.arguments).toBe('{"a":1,"b":2}');
      expect(stored[1].function.arguments).toBe('{}');
      // The malformed call still gets a repair message (not executed).
      const repair = events.find((e) => e.type === 'TOOL_CALL_RESULT' && e.toolCallId === 'c2') as any;
      expect(String(repair.content)).toContain('Invalid tool arguments');
      expect(execCalls.map((c) => c.name)).toEqual(['get_projects']);
    });
  });

  describe('run lock for new conversations', () => {
    it('holds the lock on a newly created thread during the run and releases it afterwards', async () => {
      let lockedDuringRun = false;
      hooks.__llm = async () => {
        lockedDuringRun = isRunActive(runLockKey('user-1', CONV));
        return { content: 'hi', toolCalls: [], finishReason: 'stop' };
      };
      const svc = new AIAssistantService();
      await svc.initialize('user-1');
      await svc.runStream('user-1', null, 'hello', 'User', 'u@x', 'en', 'Bearer t', [], emit);

      expect(lockedDuringRun).toBe(true);
      expect(isRunActive(runLockKey('user-1', CONV))).toBe(false);
    });
  });

  describe('pre-approval preparation (log_time_entry)', () => {
    it('shows the resolved project on the approval card and stores it in the pending list', async () => {
      hooks.__customTools = {
        log_time_entry: {
          prepare: async (args: Record<string, unknown>) => ({ ...args, project: 'Acme Website', project_id: 'p-1' }),
        },
      };
      llmRounds = [
        {
          content: 'Logging.',
          toolCalls: [makeCall('l1', 'log_time_entry', { project: 'acme', entry_date: '2026-10-05' })],
          finishReason: 'tool_calls',
        },
      ];
      await run();

      const approval = events.find((e) => e.type === 'TOOL_APPROVAL_REQUIRED') as any;
      expect(approval.actions[0].arguments).toMatchObject({ project: 'Acme Website', project_id: 'p-1' });
      const metaUpdate = queries.find(
        (q) => q.sql.includes('SET metadata') && String(q.params[0]).includes('awaiting_approval')
      );
      expect(String(metaUpdate!.params[0])).toContain('p-1');
    });

    it('refuses an ambiguous project before approval and lets the model ask', async () => {
      hooks.__customTools = {
        log_time_entry: {
          prepare: async () => {
            throw new Error('Project name "acme" is ambiguous — it matches: Acme A, Acme B.');
          },
        },
      };
      llmRounds = [
        { content: '', toolCalls: [makeCall('l1', 'log_time_entry', { project: 'acme' })], finishReason: 'tool_calls' },
        { content: 'Which Acme project?', toolCalls: [], finishReason: 'stop' },
      ];
      await run();

      expect(events.some((e) => e.type === 'TOOL_APPROVAL_REQUIRED')).toBe(false);
      const refused = events.find((e) => e.type === 'TOOL_CALL_RESULT' && e.toolCallId === 'l1') as any;
      expect(String(refused.content)).toContain('ambiguous');
      expect(llmCallCount).toBe(2); // model got the error back and answered
    });
  });

  it('deduplicates byte-identical tool calls within one response', async () => {
    llmRounds = [
      {
        content: '',
        toolCalls: [makeCall('t1', 'get_projects', { q: 'x' }), makeCall('t2', 'get_projects', { q: 'x' })],
        finishReason: 'tool_calls',
      },
      { content: 'done', toolCalls: [], finishReason: 'stop' },
    ];
    await run();

    expect(execCalls).toHaveLength(1);
    const dupResult = events.find((e) => e.type === 'TOOL_CALL_RESULT' && e.toolCallId === 't2') as any;
    expect(String(dupResult.content)).toContain('Duplicate');
  });

  it('blocks the third identical call across the run (repeat guard)', async () => {
    llmRounds = [
      { content: '', toolCalls: [makeCall('a1', 'get_projects', { q: 1 })], finishReason: 'tool_calls' },
      {
        content: '',
        toolCalls: [makeCall('a2', 'get_projects', { q: 1 }), makeCall('b1', 'get_clients', {})],
        finishReason: 'tool_calls',
      },
      {
        content: '',
        toolCalls: [makeCall('a3', 'get_projects', { q: 1 }), makeCall('b2', 'get_clients', { p: 2 })],
        finishReason: 'tool_calls',
      },
      { content: 'done', toolCalls: [], finishReason: 'stop' },
    ];
    await run();

    const projectCalls = execCalls.filter((c) => c.name === 'get_projects');
    expect(projectCalls).toHaveLength(2); // third identical call suppressed
    const blocked = events.find((e) => e.type === 'TOOL_CALL_RESULT' && e.toolCallId === 'a3') as any;
    expect(String(blocked.content)).toContain('result will not change');
  });

  it('circuit-breaks a tool after three consecutive failures', async () => {
    execResult = (name) => (name === 'get_projects' ? { status: 500, error: 'boom' } : { status: 200, data: {} });
    llmRounds = [
      { content: '', toolCalls: [makeCall('f1', 'get_projects', { q: 1 })], finishReason: 'tool_calls' },
      { content: '', toolCalls: [makeCall('f2', 'get_projects', { q: 2 })], finishReason: 'tool_calls' },
      { content: '', toolCalls: [makeCall('f3', 'get_projects', { q: 3 })], finishReason: 'tool_calls' },
      { content: '', toolCalls: [makeCall('f4', 'get_projects', { q: 4 })], finishReason: 'tool_calls' },
      { content: 'done', toolCalls: [], finishReason: 'stop' },
    ];
    await run();

    expect(execCalls).toHaveLength(3); // 4th call never executes
    const disabled = events.find((e) => e.type === 'TOOL_CALL_RESULT' && e.toolCallId === 'f4') as any;
    expect(String(disabled.content)).toContain('disabled');
  });

  it('feeds a repair message back for malformed tool arguments instead of executing', async () => {
    llmRounds = [
      { content: '', toolCalls: [makeCall('m1', 'get_projects', '{invalid json')], finishReason: 'tool_calls' },
      { content: 'done', toolCalls: [], finishReason: 'stop' },
    ];
    await run();

    expect(execCalls).toHaveLength(0);
    const repair = events.find((e) => e.type === 'TOOL_CALL_RESULT' && e.toolCallId === 'm1') as any;
    expect(String(repair.content)).toContain('Invalid tool arguments');
  });

  it('rejects schema-invalid arguments pre-execution with field-level errors', async () => {
    hooks.__validate = () => ({ ok: false, errors: ['missing required parameter "project_id"'] });
    llmRounds = [
      { content: '', toolCalls: [makeCall('v1', 'get_time_pattern', {})], finishReason: 'tool_calls' },
      { content: 'done', toolCalls: [], finishReason: 'stop' },
    ];
    await run();

    expect(execCalls).toHaveLength(0);
    const rejected = events.find((e) => e.type === 'TOOL_CALL_RESULT' && e.toolCallId === 'v1') as any;
    expect(String(rejected.content)).toContain('missing required parameter');
  });

  it('discards tool calls truncated by the output limit and asks for a retry', async () => {
    llmRounds = [
      { content: 'partial', toolCalls: [makeCall('x1', 'get_projects', {})], finishReason: 'length' },
      { content: 'recovered', toolCalls: [], finishReason: 'stop' },
    ];
    await run();

    expect(execCalls).toHaveLength(0); // truncated call never executed
    expect(llmCallCount).toBe(2); // loop continued with a retry instruction
    expect(events.some((e) => e.type === 'RUN_FINISHED')).toBe(true);
  });

  describe('conversations started with an API token', () => {
    const TOKEN_PERMS = { resources: { clients: 'read' }, capabilities: ['assistant'] };
    const access = (tokenId = 'tok-1', approvalMode: 'self' | 'in_app' = 'self') => ({
      tokenId,
      permissions: TOKEN_PERMS as any,
      approvalMode,
    });

    beforeEach(() => {
      hooks.__operations = {
        get_clients: { method: 'GET', pathTemplate: '/api/clients' },
        get_invoices: { method: 'GET', pathTemplate: '/api/invoices' },
        post_clients: { method: 'POST', pathTemplate: '/api/clients' },
      };
    });

    const resultFor = (id: string) =>
      queries.find((q) => q.sql.includes("'tool'") && q.params[2] === id)?.params[1] as string | undefined;

    it('stays within the token permissions even when the web app continues it', async () => {
      conversationRows = [{ api_token_id: 'tok-1', permissions: TOKEN_PERMS }];
      llmRounds = [
        {
          content: '',
          toolCalls: [makeCall('r1', 'get_clients', {}), makeCall('r2', 'get_invoices', {})],
          finishReason: 'tool_calls',
        },
        { content: 'Here you go.', toolCalls: [], finishReason: 'stop' },
      ];
      await run(); // signed-in web app session, no token

      expect(execCalls.map((c) => c.name)).toEqual(['get_clients']);
      expect(resultFor('r2')).toContain('invoices:read');
    });

    it('never puts a disallowed write on the approval card', async () => {
      conversationRows = [{ api_token_id: 'tok-1', permissions: TOKEN_PERMS }];
      llmRounds = [
        { content: 'Creating it.', toolCalls: [makeCall('w1', 'post_clients', { name: 'X' })], finishReason: 'tool_calls' },
        { content: 'I am not allowed to.', toolCalls: [], finishReason: 'stop' },
      ];
      await run();

      expect(events.some((e) => e.type === 'TOOL_APPROVAL_REQUIRED')).toBe(false);
      expect(execCalls).toHaveLength(0);
      expect(resultFor('w1')).toContain('clients:write');
    });

    it('offers custom tools only when they declare API calls the token allows', async () => {
      conversationRows = [{ api_token_id: 'tok-1', permissions: TOKEN_PERMS }];
      hooks.__customTools = {
        undeclared_tool: { name: 'undeclared_tool', requiresApproval: false },
        client_lookup: { name: 'client_lookup', requiresApproval: false, apiAccess: [{ method: 'GET', path: '/api/clients' }] },
      };
      llmRounds = [
        {
          content: '',
          toolCalls: [makeCall('c1', 'undeclared_tool', {}), makeCall('c2', 'client_lookup', {})],
          finishReason: 'tool_calls',
        },
        { content: 'Done.', toolCalls: [], finishReason: 'stop' },
      ];
      await run();

      expect(execCalls.map((c) => c.name)).toEqual(['client_lookup']);
      expect(resultFor('c1')).toContain('not available to API tokens');
    });

    it("a token can't use the web app's or another token's conversations", async () => {
      for (const startedBy of [null, 'tok-other']) {
        conversationRows = [{ api_token_id: startedBy, permissions: startedBy ? TOKEN_PERMS : null }];
        events = [];
        const svc = new AIAssistantService();
        await svc.initialize('user-1');
        await svc.runStream('user-1', CONV, 'hello', 'User', 'u@x', 'en', 'Bearer t', [], emit, undefined, access());
        expect(events).toEqual([expect.objectContaining({ type: 'RUN_ERROR', code: '404' })]);
      }
      expect(llmCallCount).toBe(0);
    });

    it('records the token on a new conversation and reports the in-app approval mode', async () => {
      llmRounds = [
        { content: 'Plan.', toolCalls: [makeCall('w1', 'post_time_entries', { a: 1 })], finishReason: 'tool_calls' },
      ];
      hooks.__operations.post_time_entries = { method: 'POST', pathTemplate: '/api/time-entries' };
      const svc = new AIAssistantService();
      await svc.initialize('user-1');
      const writer = {
        tokenId: 'tok-1',
        permissions: { resources: { time_entries: 'write' }, capabilities: ['assistant'] } as any,
        approvalMode: 'in_app' as const,
      };
      await svc.runStream('user-1', null, 'log 1h', 'User', 'u@x', 'en', 'Bearer t', [], emit, undefined, writer);

      const insert = queries.find((q) => q.sql.includes('INSERT INTO ai_conversations'));
      expect(insert?.params[2]).toBe('tok-1');
      const approval = events.find((e) => e.type === 'TOOL_APPROVAL_REQUIRED') as any;
      expect(approval.approvalMode).toBe('in_app');
    });

    it('re-checks an approved write against the current permissions before running it', async () => {
      // Proposed while the token could write clients; narrowed to read before approval.
      conversationRows = [{ api_token_id: 'tok-1', permissions: TOKEN_PERMS }];
      claimRows = [{ id: 'amsg-1', metadata: { status: 'resolved', pending: [makeCall('w1', 'post_clients', { name: 'X' })] } }];
      llmRounds = [{ content: 'Could not.', toolCalls: [], finishReason: 'stop' }];
      const svc = new AIAssistantService();
      await svc.initialize('user-1');
      await svc.resumeRun('user-1', CONV, [{ toolCallId: 'w1', decision: 'approve' }], 'User', 'u@x', 'en', 'Bearer t', [], emit);

      expect(execCalls).toHaveLength(0);
      expect(resultFor('w1')).toContain('clients:write');
    });
  });
});
