/**
 * AI assistant controller: SSE responses bypass compression and stream live,
 * a client disconnect (res 'close' before finish) cancels the run, a second run
 * on a busy conversation gets 409 RUN_IN_PROGRESS before SSE starts, invalid
 * conversation ids are 404s, and transcription errors map to stable codes.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { EventEmitter } from 'events';
import http from 'http';
import { AddressInfo } from 'net';

const ctlHooks = globalThis as unknown as { __ctlQueries: Array<{ sql: string; params: unknown[] }> };

jest.mock('../../src/utils/database', () => ({
  pool: () => ({
    query: async (sql: string, params: unknown[] = []) => {
      ctlHooks.__ctlQueries.push({ sql, params });
      if (sql.includes('FROM settings')) return { rows: [{ ai_enabled: false }] };
      if (sql.includes('SELECT id FROM ai_conversations')) return { rows: [{ id: params[0] }] };
      return { rows: [], rowCount: 0 };
    },
  }),
}));

import express from 'express';
import compression from 'compression';
import {
  approveRun,
  deleteConversation,
  getConversation,
  openSseStream,
  runStream,
  transcribeAudio,
} from '../../src/controllers/ai/ai-assistant.controller';
import { runLockKey, tryAcquireRunLock, releaseRunLock, isRunActive } from '../../src/services/ai/run-lock';
import { transcriptionService, TranscriptionError } from '../../src/services/ai/transcription.service';

const THREAD = '123e4567-e89b-12d3-a456-426614174abc';

/** Minimal Express-like response for handler-level tests. */
class FakeRes extends EventEmitter {
  statusCode = 200;
  body: any;
  headers: Record<string, string> = {};
  chunks: string[] = [];
  headersFlushed = false;
  writableEnded = false;
  writableFinished = false;
  destroyed = false;
  setHeader(k: string, v: string) {
    this.headers[k.toLowerCase()] = v;
  }
  flushHeaders() {
    this.headersFlushed = true;
  }
  write(c: string) {
    this.chunks.push(c);
    return true;
  }
  end() {
    this.writableEnded = true;
    this.writableFinished = true;
    this.emit('close');
  }
  status(code: number) {
    this.statusCode = code;
    return this;
  }
  json(b: unknown) {
    this.body = b;
    this.end();
    return this;
  }
  send() {
    this.end();
    return this;
  }
}

function events(res: FakeRes): any[] {
  return res.chunks
    .filter((c) => c.startsWith('data: {'))
    .map((c) => JSON.parse(c.slice(6)));
}

let userSeq = 0;
const nextUser = () => `user-${++userSeq}`; // fresh user per test (per-user rate limit)

beforeEach(() => {
  ctlHooks.__ctlQueries = [];
});

describe('SSE transport', () => {
  let server: http.Server;
  let port: number;
  let lastSignal: AbortSignal | undefined;
  let sawAbort: Promise<void>;
  let markAbort: () => void;

  beforeAll(async () => {
    const app = express();
    app.use(compression());
    // The real helper: first event immediately, second after 300 ms.
    app.get('/sse', (_req, res) => {
      const sse = openSseStream(res);
      lastSignal = sse.signal;
      sse.signal.addEventListener('abort', () => markAbort());
      sse.emit({ type: 'FIRST', pad: 'x'.repeat(4096) });
      setTimeout(() => {
        sse.emit({ type: 'SECOND' });
        sse.finish();
      }, 300);
    });
    // Control: what the old headers did — compression buffers the stream.
    app.get('/old', (_req, res) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.flushHeaders();
      res.write(`data: ${JSON.stringify({ pad: 'x'.repeat(4096) })}\n\n`);
      setTimeout(() => res.end(), 50);
    });
    server = app.listen(0);
    await new Promise((r) => server.once('listening', r));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise((r) => server.close(r));
  });

  beforeEach(() => {
    sawAbort = new Promise<void>((r) => (markAbort = r));
  });

  function get(pathname: string): Promise<http.IncomingMessage> {
    return new Promise((resolve, reject) => {
      const req = http.get({ port, path: pathname, headers: { 'Accept-Encoding': 'gzip, deflate, br' } }, resolve);
      req.on('error', reject);
    });
  }

  it('is not compressed and delivers the first event before the run ends', async () => {
    const started = Date.now();
    const res = await get('/sse');
    expect(res.headers['content-encoding']).toBeUndefined();
    expect(res.headers['cache-control']).toContain('no-transform');

    const first = await new Promise<string>((r) => res.once('data', (c: Buffer) => r(c.toString())));
    expect(first).toContain('"type":"FIRST"');
    expect(first).not.toContain('SECOND');
    expect(Date.now() - started).toBeLessThan(300); // arrived live, not at the end

    const rest = await new Promise<string>((r) => {
      let buf = '';
      res.on('data', (c: Buffer) => (buf += c.toString()));
      res.on('end', () => r(buf));
    });
    expect(rest).toContain('"type":"SECOND"');
    expect(rest).toContain('data: [DONE]');
    expect(lastSignal?.aborted).toBe(false); // normal completion is not a cancel
  });

  it('control: without no-transform the stream would be compressed (buffered)', async () => {
    const res = await get('/old');
    expect(res.headers['content-encoding']).toBeDefined();
    res.resume();
  });

  it('aborts the run when the client disconnects mid-stream', async () => {
    const res = await get('/sse');
    await new Promise<void>((r) => res.once('data', () => r()));
    res.destroy(); // client goes away
    await Promise.race([
      sawAbort,
      new Promise((_, reject) => setTimeout(() => reject(new Error('run was not aborted')), 1000)),
    ]);
    expect(lastSignal?.aborted).toBe(true);
  });
});

describe('one run per conversation (RUN_IN_PROGRESS)', () => {
  it('answers 409 for /run on a busy thread before starting SSE', async () => {
    const user = nextUser();
    const key = runLockKey(user, THREAD);
    expect(tryAcquireRunLock(key)).toBe(true);
    try {
      const res = new FakeRes();
      await runStream({ body: { message: 'hi', threadId: THREAD }, user: { id: user }, headers: {} } as any, res as any);
      expect(res.statusCode).toBe(409);
      expect(res.body).toMatchObject({ code: 'RUN_IN_PROGRESS' });
      expect(typeof res.body.error).toBe('string');
      expect(res.headersFlushed).toBe(false);
    } finally {
      releaseRunLock(key);
    }
  });

  it('answers 409 for /approve on a busy thread', async () => {
    const user = nextUser();
    const key = runLockKey(user, THREAD);
    tryAcquireRunLock(key);
    try {
      const res = new FakeRes();
      await approveRun(
        {
          params: { conversationId: THREAD },
          body: { approvals: [{ toolCallId: 'w1', decision: 'approve' }], batchId: THREAD },
          user: { id: user },
          headers: {},
        } as any,
        res as any
      );
      expect(res.statusCode).toBe(409);
      expect(res.body).toMatchObject({ code: 'RUN_IN_PROGRESS' });
      expect(ctlHooks.__ctlQueries).toHaveLength(0);
    } finally {
      releaseRunLock(key);
    }
  });

  it('holds the lock while a run streams and releases it afterwards', async () => {
    const user = nextUser();
    const res = new FakeRes();
    let lockedDuringRun = false;
    res.write = (c: string) => {
      res.chunks.push(c);
      if (c.includes('RUN_STARTED')) lockedDuringRun = isRunActive(runLockKey(user, THREAD));
      return true;
    };
    await runStream({ body: { message: 'hi', threadId: THREAD, language: 'de-DE' }, user: { id: user }, headers: {} } as any, res as any);

    expect(lockedDuringRun).toBe(true);
    expect(isRunActive(runLockKey(user, THREAD))).toBe(false);
    expect(res.headers['cache-control']).toBe('no-cache, no-transform');
    expect(events(res).map((e) => e.type)).toContain('RUN_FINISHED');
    expect(res.chunks[res.chunks.length - 1]).toBe('data: [DONE]\n\n');
  });
});

describe('conversation ids', () => {
  it('GET with a non-UUID id is a 404 (no database error)', async () => {
    const res = new FakeRes();
    await getConversation({ params: { id: 'not-a-uuid' }, user: { id: nextUser() } } as any, res as any);
    expect(res.statusCode).toBe(404);
    expect(ctlHooks.__ctlQueries).toHaveLength(0);
  });

  it('DELETE with a non-UUID id is a 404 (no database error)', async () => {
    const res = new FakeRes();
    await deleteConversation({ params: { id: "1' OR 1=1" }, user: { id: nextUser() } } as any, res as any);
    expect(res.statusCode).toBe(404);
    expect(ctlHooks.__ctlQueries).toHaveLength(0);
  });
});

describe('POST /api/ai/transcribe error mapping', () => {
  const file = { buffer: Buffer.from('a'), mimetype: 'audio/webm' };
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const cases: Array<[string, number]> = [
    ['STT_DISABLED', 400],
    ['STT_UNREACHABLE', 503],
    ['STT_TIMEOUT', 504],
    ['STT_FAILED', 502],
  ];
  for (const [code, status] of cases) {
    it(`${code} → HTTP ${status} { error, code }`, async () => {
      jest.spyOn(transcriptionService, 'transcribe').mockRejectedValue(new TranscriptionError(code as any));
      const res = new FakeRes();
      await transcribeAudio({ user: { id: nextUser() }, file } as any, res as any);
      expect(res.statusCode).toBe(status);
      expect(res.body).toEqual({ error: expect.any(String), code });
    });
  }

  it('unexpected errors are a generic 500 without the raw message', async () => {
    jest.spyOn(transcriptionService, 'transcribe').mockRejectedValue(new Error('ECONNREFUSED 10.0.0.9:9000'));
    const res = new FakeRes();
    await transcribeAudio({ user: { id: nextUser() }, file } as any, res as any);
    expect(res.statusCode).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('10.0.0.9');
  });
});
