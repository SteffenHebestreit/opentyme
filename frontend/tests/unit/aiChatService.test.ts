import { TextEncoder } from 'util';
import { streamChat, approveActions } from '../../src/api/services/ai-chat.service';
import { getFreshAccessToken } from '../../src/services/auth/freshToken';

jest.mock('../../src/services/auth/freshToken', () => ({
  getFreshAccessToken: jest.fn().mockResolvedValue('token-1'),
}));

const encoder = new TextEncoder();

/** A fetch Response whose body yields the given chunks. */
function sseResponse(chunks: string[], status = 200) {
  let i = 0;
  return {
    ok: status >= 200 && status < 300,
    status,
    body: {
      getReader: () => ({
        read: async () => (i < chunks.length ? { value: encoder.encode(chunks[i++]), done: false } : { value: undefined, done: true }),
        cancel: jest.fn().mockResolvedValue(undefined),
      }),
    },
    text: async () => '',
  } as unknown as Response;
}

function jsonResponse(status: number, body: unknown) {
  return { ok: false, status, body: null, text: async () => JSON.stringify(body) } as unknown as Response;
}

const fetchMock = jest.fn();
beforeEach(() => {
  fetchMock.mockReset();
  (getFreshAccessToken as jest.Mock).mockClear();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

describe('streamChat', () => {
  it('parses events split across chunks, CRLF and "data:" without a space', async () => {
    fetchMock.mockResolvedValue(
      sseResponse([
        'data: {"type":"RUN_STARTED","threadId":"t-1"}\n\nda',
        'ta: {"type":"TEXT_MESSAGE_CONTENT","delta":"Hal"}\r\n\r\n',
        ': ping\n\ndata:{"type":"TEXT_MESSAGE_CONTENT","delta":"lo"}\n\n',
        'data: [DONE]\n\n',
      ])
    );
    const events: Array<Record<string, unknown>> = [];
    const result = await streamChat({ message: 'hi', onEvent: (e) => events.push(e) });

    expect(events.map((e) => e.type)).toEqual(['RUN_STARTED', 'TEXT_MESSAGE_CONTENT', 'TEXT_MESSAGE_CONTENT']);
    expect(events.map((e) => e.delta).join('')).toBe('Hallo');
    expect(result).toMatchObject({ threadId: 't-1', started: true, aborted: false });
    expect(result.error).toBeUndefined();
  });

  it('handles a last event without its trailing blank line', async () => {
    fetchMock.mockResolvedValue(sseResponse(['data: {"type":"RUN_STARTED","threadId":"t-2"}\n\ndata: {"type":"RUN_FINISHED"}']));
    const events: Array<Record<string, unknown>> = [];
    await streamChat({ message: 'hi', onEvent: (e) => events.push(e) });
    expect(events.map((e) => e.type)).toEqual(['RUN_STARTED', 'RUN_FINISHED']);
  });

  it('reports a busy conversation (409) as its own error kind', async () => {
    fetchMock.mockResolvedValue(jsonResponse(409, { error: 'busy', code: 'RUN_IN_PROGRESS' }));
    const onError = jest.fn();
    const result = await streamChat({ message: 'hi', threadId: 't', onEvent: jest.fn(), onError });
    expect(result.error?.kind).toBe('busy');
    expect(result.started).toBe(false);
    expect(onError).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ kind: 'busy', status: 409 }));
  });

  it('retries once with a forced token refresh on 401', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { error: 'expired' }))
      .mockResolvedValueOnce(sseResponse(['data: {"type":"RUN_STARTED","threadId":"t-3"}\n\n', 'data: [DONE]\n\n']));
    const result = await streamChat({ message: 'hi', onEvent: jest.fn() });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getFreshAccessToken).toHaveBeenNthCalledWith(1, 300, false);
    expect(getFreshAccessToken).toHaveBeenNthCalledWith(2, 300, true);
    expect(result).toMatchObject({ threadId: 't-3', started: true });
  });

  it('gives up with an auth error after a second 401', async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { error: 'expired' }));
    const result = await streamChat({ message: 'hi', onEvent: jest.fn() });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.error?.kind).toBe('auth');
  });

  it('ends quietly when the caller aborts (Stop)', async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation(() => {
      controller.abort();
      return Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    });
    const onError = jest.fn();
    const result = await streamChat({ message: 'hi', onEvent: jest.fn(), onError, signal: controller.signal });
    expect(result.aborted).toBe(true);
    expect(result.error).toBeUndefined();
    expect(onError).not.toHaveBeenCalled();
  });

  it('reports a timeout when the stream goes silent (not on the caller\'s abort)', async () => {
    fetchMock.mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    const result = await streamChat({ message: 'hi', onEvent: jest.fn() });
    expect(result.error?.kind).toBe('timeout');
  });

  it('maps a network failure to a network error', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const result = await streamChat({ message: 'hi', onEvent: jest.fn() });
    expect(result.error?.kind).toBe('network');
  });
});

describe('approveActions', () => {
  it('sends the batch id with the decisions', async () => {
    fetchMock.mockResolvedValue(sseResponse(['data: [DONE]\n\n']));
    await approveActions({
      conversationId: 'c-1',
      batchId: 'b-1',
      approvals: [{ toolCallId: 'x', decision: 'approve' }],
      onEvent: jest.fn(),
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/ai/run/c-1/approve');
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({ batchId: 'b-1', approvals: [{ toolCallId: 'x' }] });
  });
});
