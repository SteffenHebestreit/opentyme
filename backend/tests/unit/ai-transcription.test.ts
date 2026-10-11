/**
 * Speech-to-text error mapping (contract: STT_DISABLED 400, STT_UNREACHABLE 503,
 * STT_TIMEOUT 504, STT_FAILED 502) — upstream bodies and hostnames never reach
 * the client — plus NULL-safe settings and a timeout that also covers the body.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const sttHooks = globalThis as unknown as { __sttRow: Record<string, unknown> | undefined };

jest.mock('../../src/utils/database', () => ({
  pool: () => ({
    query: async () => ({ rows: sttHooks.__sttRow ? [sttHooks.__sttRow] : [] }),
  }),
}));

import { TranscriptionService, TranscriptionError, classifySttError } from '../../src/services/ai/transcription.service';

const audio = Buffer.from('fake-audio');
const originalFetch = global.fetch;

function netError(code: string): Error {
  return Object.assign(new TypeError('fetch failed'), {
    cause: Object.assign(new Error(`getaddrinfo ${code} stt.internal`), { code }),
  });
}

describe('TranscriptionService errors', () => {
  const svc = new TranscriptionService();
  let fetchMock: jest.Mock;

  beforeEach(() => {
    sttHooks.__sttRow = {
      stt_enabled: true,
      stt_provider: 'whisper',
      stt_api_url: 'http://stt.internal:8080',
      stt_api_key: null,
      stt_model: null,
      stt_language: null,
    };
    fetchMock = jest.fn();
    (global as any).fetch = fetchMock;
  });

  afterAll(() => {
    (global as any).fetch = originalFetch;
    delete process.env.STT_TIMEOUT_MS;
  });

  for (const code of ['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH']) {
    it(`maps ${code} (hidden in err.cause) to STT_UNREACHABLE 503`, async () => {
      fetchMock.mockRejectedValue(netError(code));
      const err = await svc.transcribe(audio, 'audio/webm', 'u1').catch((e) => e);
      expect(err).toBeInstanceOf(TranscriptionError);
      expect(err).toMatchObject({ code: 'STT_UNREACHABLE', status: 503 });
      expect(err.message).not.toContain('stt.internal');
    });
  }

  it('maps an aborted request (timeout) to STT_TIMEOUT 504', async () => {
    fetchMock.mockRejectedValue(Object.assign(new Error('This operation was aborted'), { name: 'AbortError' }));
    await expect(svc.transcribe(audio, 'audio/webm', 'u1')).rejects.toMatchObject({ code: 'STT_TIMEOUT', status: 504 });
  });

  it('maps upstream HTTP errors to STT_FAILED 502 without echoing the body', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => 'Traceback … at /srv/secret/model.py' });
    const err = await svc.transcribe(audio, 'audio/webm', 'u1').catch((e) => e);
    expect(err).toMatchObject({ code: 'STT_FAILED', status: 502 });
    expect(err.message).not.toMatch(/Traceback|secret/);
  });

  it('maps a non-JSON success body to STT_FAILED', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => JSON.parse('<html>') });
    await expect(svc.transcribe(audio, 'audio/webm', 'u1')).rejects.toMatchObject({ code: 'STT_FAILED' });
  });

  it('reports STT_DISABLED 400 when speech-to-text is off', async () => {
    sttHooks.__sttRow = { ...sttHooks.__sttRow, stt_enabled: false };
    await expect(svc.transcribe(audio, 'audio/webm', 'u1')).rejects.toMatchObject({ code: 'STT_DISABLED', status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to the default URL when stt_api_url is NULL (no TypeError)', async () => {
    sttHooks.__sttRow = { ...sttHooks.__sttRow, stt_api_url: null };
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ text: ' hallo welt ' }) });
    const result = await svc.transcribe(audio, 'audio/webm', 'u1');
    expect(result.text).toBe('hallo welt');
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8080/v1/audio/transcriptions');
  });

  it('keeps the abort timer armed until the response body has been read', async () => {
    process.env.STT_TIMEOUT_MS = '30';
    // Headers arrive at once, but the body never completes until the request is aborted.
    fetchMock.mockImplementation(async (_url: string, init: { signal: AbortSignal }) => ({
      ok: true,
      status: 200,
      json: () =>
        new Promise((_resolve, reject) =>
          init.signal.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
          )
        ),
    }));
    await expect(svc.transcribe(audio, 'audio/webm', 'u1')).rejects.toMatchObject({ code: 'STT_TIMEOUT' });
    delete process.env.STT_TIMEOUT_MS;
  });

  it('rejects unsupported audio as INVALID_AUDIO 400', async () => {
    await expect(svc.transcribe(audio, 'video/mp4', 'u1')).rejects.toMatchObject({ code: 'INVALID_AUDIO', status: 400 });
  });
});

describe('classifySttError', () => {
  it('handles undici connect timeouts and multi-address failures', () => {
    expect(classifySttError({ cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } })).toBe('STT_TIMEOUT');
    expect(classifySttError({ cause: { errors: [{ code: 'ECONNREFUSED' }] } })).toBe('STT_UNREACHABLE');
    expect(classifySttError(new Error('weird'))).toBe('STT_FAILED');
  });
});
