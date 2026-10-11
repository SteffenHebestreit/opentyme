/**
 * Unit tests for the AI assistant's pure helpers: tool-argument parsing,
 * repeat-detection call keys, and conversation-history hygiene. These guard the
 * loop-safety behavior added by the agentic-assistant work (dangling-approval
 * normalization, duplicate/repeat detection, context budgeting).
 */

import { parseToolArguments, stableCallKey, safeToolErrorMessage } from '../../src/services/ai/tool-call-utils';
import {
  normalizeHistoryWindow,
  applyToolContextBudget,
  TOOL_CONTEXT_BUDGET,
  ConversationMessage,
  LLMToolCall,
} from '../../src/services/ai/conversation-history.service';

const call = (id: string, name: string, args: Record<string, unknown> | string): LLMToolCall => ({
  id,
  type: 'function',
  function: { name, arguments: typeof args === 'string' ? args : JSON.stringify(args) },
});

describe('parseToolArguments', () => {
  it('parses a valid JSON object', () => {
    const r = parseToolArguments('{"project_id":"abc","hours":2}');
    expect(r).toEqual({ ok: true, args: { project_id: 'abc', hours: 2 } });
  });

  it('treats an empty string as an empty object', () => {
    expect(parseToolArguments('')).toEqual({ ok: true, args: {} });
  });

  it('unwinds double-stringified JSON (known local-model habit)', () => {
    const doubled = JSON.stringify(JSON.stringify({ a: 1 }));
    const r = parseToolArguments(doubled);
    expect(r).toEqual({ ok: true, args: { a: 1 } });
  });

  it('reports malformed JSON instead of silently succeeding', () => {
    const r = parseToolArguments('{"a": 1,,}');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.length).toBeGreaterThan(0);
  });

  it('rejects non-object argument payloads', () => {
    expect(parseToolArguments('[1,2,3]').ok).toBe(false);
    expect(parseToolArguments('42').ok).toBe(false);
  });
});

describe('stableCallKey', () => {
  it('is insensitive to top-level key order', () => {
    const a = call('1', 'get_time_entries', '{"start_date":"2026-06-01","project_id":"p1"}');
    const b = call('2', 'get_time_entries', '{"project_id":"p1","start_date":"2026-06-01"}');
    expect(stableCallKey(a)).toBe(stableCallKey(b));
  });

  it('is insensitive to nested key order', () => {
    const a = call('1', 't', '{"filter":{"x":1,"y":2}}');
    const b = call('2', 't', '{"filter":{"y":2,"x":1}}');
    expect(stableCallKey(a)).toBe(stableCallKey(b));
  });

  it('differs for different arguments or tool names', () => {
    const base = call('1', 't', { a: 1 });
    expect(stableCallKey(base)).not.toBe(stableCallKey(call('2', 't', { a: 2 })));
    expect(stableCallKey(base)).not.toBe(stableCallKey(call('3', 'other', { a: 1 })));
  });
});

describe('safeToolErrorMessage', () => {
  it('hides axios transport details (internal host:port) but keeps the code/status', () => {
    const transport = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:8000'), {
      isAxiosError: true,
      code: 'ECONNREFUSED',
    });
    expect(safeToolErrorMessage(transport)).toBe('The API request failed (ECONNREFUSED).');
    const http = Object.assign(new Error('Request failed'), { isAxiosError: true, response: { status: 401 } });
    expect(safeToolErrorMessage(http)).toBe('The API request failed (HTTP 401).');
  });

  it('keeps deliberate tool error messages for the model', () => {
    expect(safeToolErrorMessage(new Error('Project name "x" is ambiguous'))).toBe('Project name "x" is ambiguous');
  });
});

describe('normalizeHistoryWindow', () => {
  const assistantWithCall = (id: string): ConversationMessage => ({
    role: 'assistant',
    content: null,
    tool_calls: [call(id, 'get_projects', {})],
  });
  const toolResult = (id: string): ConversationMessage => ({
    role: 'tool',
    content: '{"ok":true}',
    tool_call_id: id,
    name: 'get_projects',
  });

  it('keeps a well-formed sequence unchanged', () => {
    const msgs: ConversationMessage[] = [
      { role: 'user', content: 'hi' },
      assistantWithCall('tc1'),
      toolResult('tc1'),
      { role: 'assistant', content: 'done' },
    ];
    expect(normalizeHistoryWindow(msgs)).toEqual(msgs);
  });

  it('drops orphan tool results whose assistant message was trimmed off', () => {
    const msgs: ConversationMessage[] = [toolResult('gone'), { role: 'user', content: 'hi' }];
    expect(normalizeHistoryWindow(msgs)).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('injects a synthetic result for dangling tool_calls', () => {
    const msgs: ConversationMessage[] = [assistantWithCall('tc1'), { role: 'user', content: 'next' }];
    const out = normalizeHistoryWindow(msgs);
    expect(out).toHaveLength(3);
    expect(out[1].role).toBe('tool');
    expect(out[1].tool_call_id).toBe('tc1');
    expect(out[1].content).toContain('not_executed');
    expect(out[2]).toEqual({ role: 'user', content: 'next' });
  });

  it('exempts keepDanglingIds from synthetic injection (resume flow)', () => {
    const msgs: ConversationMessage[] = [assistantWithCall('tc1')];
    const out = normalizeHistoryWindow(msgs, new Set(['tc1']));
    expect(out).toEqual(msgs);
  });

  it('moves tool results directly behind their assistant message (overlapping runs)', () => {
    // Persisted by two overlapping runs: assistant(tool_calls) → user → tool.
    const msgs: ConversationMessage[] = [
      { role: 'user', content: 'first' },
      assistantWithCall('tc1'),
      { role: 'user', content: 'second' },
      toolResult('tc1'),
      { role: 'assistant', content: 'answer' },
    ];
    const out = normalizeHistoryWindow(msgs);
    expect(out.map((m) => `${m.role}:${m.tool_call_id ?? m.content ?? ''}`)).toEqual([
      'user:first',
      'assistant:',
      'tool:tc1',
      'user:second',
      'assistant:answer',
    ]);
    expect(out.filter((m) => m.role === 'tool')).toHaveLength(1); // no synthetic duplicate
  });

  it('keeps the persisted order of several results and regroups each under its own assistant', () => {
    const multi: ConversationMessage = {
      role: 'assistant',
      content: null,
      tool_calls: [call('a', 'get_projects', {}), call('b', 'get_clients', {})],
    };
    const msgs: ConversationMessage[] = [
      multi,
      toolResult('b'),
      { role: 'user', content: 'interleaved' },
      assistantWithCall('c'),
      toolResult('a'),
      toolResult('c'),
    ];
    const out = normalizeHistoryWindow(msgs);
    expect(out.map((m) => m.tool_call_id ?? m.content ?? m.role)).toEqual([
      'assistant',
      'b',
      'a',
      'interleaved',
      'assistant',
      'c',
    ]);
  });

  it('drops a duplicate result for the same tool_call id', () => {
    const msgs: ConversationMessage[] = [assistantWithCall('tc1'), toolResult('tc1'), toolResult('tc1')];
    expect(normalizeHistoryWindow(msgs)).toHaveLength(2);
  });

  it('attaches a result to the LATEST preceding assistant that declared a reused id', () => {
    const msgs: ConversationMessage[] = [
      assistantWithCall('call_0'),
      { ...toolResult('call_0'), content: 'first' },
      { role: 'user', content: 'again' },
      assistantWithCall('call_0'),
      { ...toolResult('call_0'), content: 'second' },
    ];
    const out = normalizeHistoryWindow(msgs);
    expect(out.map((m) => (m.role === 'assistant' ? 'assistant' : m.content))).toEqual([
      'assistant',
      'first',
      'again',
      'assistant',
      'second',
    ]);
  });
});

describe('applyToolContextBudget', () => {
  const tool = (id: string, size: number): ConversationMessage => ({
    role: 'tool',
    content: 'x'.repeat(size),
    tool_call_id: id,
    name: 't',
  });

  it('keeps content under budget untouched and never mutates the input', () => {
    const msgs = [tool('a', 100), tool('b', 100)];
    const out = applyToolContextBudget(msgs);
    expect(out).toEqual(msgs);
    expect(out[0]).not.toBe(msgs[0]); // copies, not the same objects
  });

  it('truncates older results and preserves the newest once over budget', () => {
    const big = Math.ceil(TOOL_CONTEXT_BUDGET * 0.8);
    const msgs = [tool('oldest', big), tool('older', big), tool('newest', big)];
    const out = applyToolContextBudget(msgs);

    // Newest fully intact.
    expect(out[2].content).toHaveLength(big);
    // Middle one partially truncated to fit the remaining budget.
    expect(out[1].content).toMatch(/…\[truncated\]$/);
    expect((out[1].content as string).length).toBeLessThan(big);
    // Oldest fully omitted (budget already spent).
    expect(out[0].content).toBe('[older tool result omitted to save context]');
    // Non-tool messages and pairing metadata untouched.
    expect(out[1].tool_call_id).toBe('older');
  });
});
