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
  __exec: (name: string, args: Record<string, unknown>) => Promise<{ status: number; data?: unknown; error?: string }>;
  __validate: (name: string, args: Record<string, unknown>) => { ok: true } | { ok: false; errors: string[] };
};

jest.mock('../../src/utils/database', () => ({
  pool: () => ({ query: (sql: string, params?: unknown[]) => hooks.__query(sql, params) }),
}));
jest.mock('../../src/services/ai/llm-stream.service', () => ({
  streamChatCompletion: (opts: unknown) => hooks.__llm(opts),
}));
jest.mock('../../src/services/ai/tool-selection.service', () => ({
  selectTools: async () => [],
  isToolAllowedForRoles: () => true,
}));
jest.mock('../../src/services/ai/tool-executor.service', () => ({
  executeToolCall: (name: string, args: Record<string, unknown>) => hooks.__exec(name, args),
  isWriteTool: (name: string) => /^(post|put|patch|delete)_/.test(name),
}));
jest.mock('../../src/services/ai/openapi-tool-builder.service', () => ({
  validateToolArguments: (name: string, args: Record<string, unknown>) => hooks.__validate(name, args),
}));
jest.mock('../../src/services/ai/system-prompt.builder', () => ({
  buildSystemPrompt: () => 'SYS',
}));
jest.mock('../../src/services/ai/conversation-history.service', () => ({
  loadHistory: async () => [],
}));

import { AIAssistantService, ToolApprovalDecision } from '../../src/services/ai/ai-assistant.service';

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
  let execResult: (name: string) => { status: number; data?: unknown; error?: string };
  let claimRows: unknown[];

  const emit = (e: Record<string, unknown>) => events.push(e);

  beforeEach(() => {
    queries = [];
    events = [];
    llmRounds = [];
    llmCallCount = 0;
    execCalls = [];
    execResult = () => ({ status: 200, data: { ok: true } });
    claimRows = [];

    hooks.__query = async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params: params ?? [] });
      if (sql.includes('FROM settings')) {
        return {
          rows: [{ ai_enabled: true, ai_provider: 'lm_studio', ai_api_url: 'http://x/v1', ai_api_key: 'k', ai_model: 'm' }],
        };
      }
      if (sql.includes('INSERT INTO ai_conversations')) return { rows: [{ id: CONV }] };
      if (sql.includes('SELECT id FROM ai_conversations')) return { rows: [{ id: CONV }] };
      if (sql.includes('RETURNING id, metadata')) return { rows: claimRows };
      if (sql.includes('RETURNING id')) return { rows: [{ id: `amsg-${queries.length}` }] };
      return { rows: [] };
    };
    hooks.__llm = async () => {
      const round = llmRounds[Math.min(llmCallCount, llmRounds.length - 1)];
      llmCallCount++;
      return round ?? { content: 'done', toolCalls: [], finishReason: 'stop' };
    };
    hooks.__exec = async (name, args) => {
      execCalls.push({ name, args });
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

  it('resume with no pending approval (double click) reports NO_PENDING and executes nothing', async () => {
    claimRows = []; // atomic claim finds nothing — already claimed
    const svc = new AIAssistantService();
    await svc.initialize('user-1');
    await svc.resumeRun('user-1', CONV, [{ toolCallId: 'w1', decision: 'approve' }], 'User', 'u@x', 'en', 'B', [], emit);

    expect(execCalls).toHaveLength(0);
    expect(events.some((e) => e.type === 'RUN_ERROR' && e.code === 'NO_PENDING')).toBe(true);
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
});
