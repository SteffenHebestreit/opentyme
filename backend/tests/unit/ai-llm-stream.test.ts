/**
 * Tests for the streaming chat-completions client: classification of model-
 * server failures into stable RUN_ERROR codes, in-band error chunks, stream
 * lifecycle safety (close/abort can't hang the run) and tool-call assembly.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { PassThrough } from 'stream';
import {
  streamChatCompletion,
  classifyLLMHttpError,
  classifyLLMErrorText,
  toLLMError,
  isAbortError,
  LLMError,
} from '../../src/services/ai/llm-stream.service';

function sse(stream: PassThrough, payloads: Array<Record<string, unknown> | string>, end = true): void {
  for (const p of payloads) stream.write(`data: ${typeof p === 'string' ? p : JSON.stringify(p)}\n\n`);
  if (end) stream.end();
}

function clientReturning(stream: PassThrough): any {
  return { post: async () => ({ data: stream }) };
}

function bodyStream(text: string): PassThrough {
  const s = new PassThrough();
  s.end(text);
  return s;
}

const baseOpts = { model: 'm', messages: [], tools: [], emit: () => undefined };

describe('classifyLLMHttpError', () => {
  const cases: Array<[number, string, string]> = [
    [401, 'Unauthorized', 'LLM_AUTH'],
    [403, '{"error":"forbidden"}', 'LLM_AUTH'],
    [404, '{"error":{"message":"model \\"qwen\\" not found, try pulling it first"}}', 'LLM_MODEL'],
    [400, '{"error":"No models loaded. Please load a model in the developer page"}', 'LLM_MODEL'],
    [404, '{"error":{"code":"model_not_found"}}', 'LLM_MODEL'],
    [400, "This model's maximum context length is 4096 tokens. However, you requested 9000", 'LLM_CONTEXT'],
    [500, 'the request exceeds the available context size, try increasing it', 'LLM_CONTEXT'],
    [413, '', 'LLM_CONTEXT'],
    [404, '{"detail":"Not Found"}', 'LLM_UNREACHABLE'],
    [502, 'Bad Gateway', 'LLM_UNREACHABLE'],
    [503, 'Service Unavailable', 'LLM_UNREACHABLE'],
    [504, 'Gateway Timeout', 'LLM_TIMEOUT'],
    [500, 'Internal Server Error', 'INTERNAL'],
  ];
  for (const [status, body, code] of cases) {
    it(`HTTP ${status} ${body.slice(0, 40)} → ${code}`, () => {
      expect(classifyLLMHttpError(status, body)).toBe(code);
    });
  }

  it('classifies in-band error texts', () => {
    expect(classifyLLMErrorText('Context length exceeded')).toBe('LLM_CONTEXT');
    expect(classifyLLMErrorText('Failed to load model "x"')).toBe('LLM_MODEL');
    expect(classifyLLMErrorText('Unexpected endpoint or method. (POST /v1/v1/chat/completions)')).toBe(
      'LLM_UNREACHABLE'
    );
    expect(classifyLLMErrorText('something odd')).toBe('INTERNAL');
  });
});

describe('toLLMError', () => {
  const transport: Array<[string, string]> = [
    ['ECONNREFUSED', 'LLM_UNREACHABLE'],
    ['ENOTFOUND', 'LLM_UNREACHABLE'],
    ['EAI_AGAIN', 'LLM_UNREACHABLE'],
    ['EHOSTUNREACH', 'LLM_UNREACHABLE'],
    ['ECONNABORTED', 'LLM_TIMEOUT'],
    ['ETIMEDOUT', 'LLM_TIMEOUT'],
  ];
  for (const [code, expected] of transport) {
    it(`transport code ${code} → ${expected}`, async () => {
      const err = Object.assign(new Error(`connect ${code} llm.internal:1234`), { code });
      const out = (await toLLMError(err)) as LLMError;
      expect(out).toBeInstanceOf(LLMError);
      expect(out.code).toBe(expected);
      expect(out.message).not.toContain('llm.internal'); // generic client text only
    });
  }

  it('reads the code from err.cause (fetch/undici style)', async () => {
    const err = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENETUNREACH' } });
    expect(((await toLLMError(err)) as LLMError).code).toBe('LLM_UNREACHABLE');
  });

  it('reads a streamed error body for classification and keeps it out of the message', async () => {
    const err = {
      message: 'Request failed with status code 404',
      response: { status: 404, data: bodyStream('{"error":"model \\"secret-model\\" not found"}') },
    };
    const out = (await toLLMError(err)) as LLMError;
    expect(out.code).toBe('LLM_MODEL');
    expect(out.status).toBe(404);
    expect(out.message).not.toContain('secret-model');
    expect(out.detail).toContain('secret-model'); // kept for server-side logs only
  });

  it('passes abort errors through unchanged', async () => {
    const abortErr = Object.assign(new Error('canceled'), { name: 'CanceledError', code: 'ERR_CANCELED' });
    expect(await toLLMError(abortErr)).toBe(abortErr);
    expect(isAbortError(abortErr)).toBe(true);
  });

  it('maps unknown failures to INTERNAL', async () => {
    expect(((await toLLMError(new Error('weird'))) as LLMError).code).toBe('INTERNAL');
  });
});

describe('streamChatCompletion', () => {
  afterEach(() => {
    delete process.env.AI_STREAM_IDLE_TIMEOUT_MS;
  });

  it('streams text and assembles tool calls', async () => {
    const stream = new PassThrough();
    const events: any[] = [];
    const p = streamChatCompletion({ ...baseOpts, client: clientReturning(stream), emit: (e) => events.push(e) });
    sse(stream, [
      { choices: [{ delta: { content: 'Hello' } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, id: 'a', function: { name: 'get_projects', arguments: '{"q"' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: ':1}' } }] } }] },
      { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
      '[DONE]',
    ]);
    const out = await p;
    expect(out.content).toBe('Hello');
    expect(out.finishReason).toBe('tool_calls');
    expect(out.toolCalls).toEqual([{ id: 'a', type: 'function', function: { name: 'get_projects', arguments: '{"q":1}' } }]);
    expect(events.map((e) => e.type)).toEqual(['TEXT_MESSAGE_START', 'TEXT_MESSAGE_CONTENT', 'TEXT_MESSAGE_END']);
  });

  it('does not merge parallel tool calls that share an index but have different ids', async () => {
    const stream = new PassThrough();
    const p = streamChatCompletion({ ...baseOpts, client: clientReturning(stream) });
    sse(stream, [
      { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_a', function: { name: 'get_projects', arguments: '{}' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_b', function: { name: 'get_clients', arguments: '{"x"' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: ':2}' } }] } }] },
    ]);
    const out = await p;
    expect(out.toolCalls).toEqual([
      { id: 'call_a', type: 'function', function: { name: 'get_projects', arguments: '{}' } },
      { id: 'call_b', type: 'function', function: { name: 'get_clients', arguments: '{"x":2}' } },
    ]);
  });

  it('keeps one call when a server repeats the same id on every delta', async () => {
    const stream = new PassThrough();
    const p = streamChatCompletion({ ...baseOpts, client: clientReturning(stream) });
    sse(stream, [
      { choices: [{ delta: { tool_calls: [{ index: 0, id: 'same', function: { name: 'get_projects', arguments: '{"a"' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, id: 'same', function: { arguments: ':1}' } }] } }] },
    ]);
    const out = await p;
    expect(out.toolCalls).toHaveLength(1);
    expect(out.toolCalls[0].function.arguments).toBe('{"a":1}');
  });

  it('throws a classified LLMError for an in-band error chunk', async () => {
    const stream = new PassThrough();
    const p = streamChatCompletion({ ...baseOpts, client: clientReturning(stream) });
    sse(stream, [{ error: { message: 'Context length exceeded: 9000 > 4096 tokens' } }], false);
    await expect(p).rejects.toMatchObject({ name: 'LLMError', code: 'LLM_CONTEXT' });
  });

  it('throws for a plain JSON error body answered with HTTP 200', async () => {
    const stream = new PassThrough();
    const p = streamChatCompletion({ ...baseOpts, client: clientReturning(stream) });
    stream.end('{"error":"Unexpected endpoint or method. (POST /chat/completions)"}');
    await expect(p).rejects.toMatchObject({ code: 'LLM_UNREACHABLE' });
  });

  it('classifies an HTTP error response of the request itself', async () => {
    const client = {
      post: async () => {
        throw Object.assign(new Error('Request failed with status code 401'), {
          response: { status: 401, data: bodyStream('{"error":"invalid api key"}') },
        });
      },
    };
    await expect(streamChatCompletion({ ...baseOpts, client: client as any })).rejects.toMatchObject({
      code: 'LLM_AUTH',
      message: expect.not.stringContaining('api key'),
    });
  });

  it('cannot hang when the stream closes without ending', async () => {
    const stream = new PassThrough();
    const p = streamChatCompletion({ ...baseOpts, client: clientReturning(stream) });
    sse(stream, [{ choices: [{ delta: { content: 'partial' } }] }], false);
    setImmediate(() => stream.destroy());
    await expect(p).rejects.toMatchObject({ code: 'LLM_UNREACHABLE' });
  });

  it('rejects with an abort error when the run is cancelled mid-stream', async () => {
    const stream = new PassThrough();
    const abort = new AbortController();
    const p = streamChatCompletion({ ...baseOpts, client: clientReturning(stream), signal: abort.signal });
    sse(stream, [{ choices: [{ delta: { content: 'partial' } }] }], false);
    setImmediate(() => abort.abort());
    const err = await p.catch((e) => e);
    expect(isAbortError(err)).toBe(true);
    expect(stream.destroyed).toBe(true);
  });

  it('times out a stalled stream as LLM_TIMEOUT', async () => {
    process.env.AI_STREAM_IDLE_TIMEOUT_MS = '30';
    const stream = new PassThrough();
    const p = streamChatCompletion({ ...baseOpts, client: clientReturning(stream) });
    await expect(p).rejects.toMatchObject({ code: 'LLM_TIMEOUT' });
  });
});
