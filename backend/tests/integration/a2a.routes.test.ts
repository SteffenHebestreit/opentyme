/**
 * A2A JSON-RPC (POST /api/ai/a2a) end to end: real routes, auth with API
 * tokens and the test DB; only the LLM, the tools' HTTP calls and the
 * Keycloak owner lookup are stubbed.
 */

process.env.NODE_ENV = 'test';
process.env.KEYCLOAK_ADMIN_CLIENT_SECRET ??= 'test-secret';
process.env.PUBLIC_URL = 'https://tyme.example.com';

const hooks = globalThis as unknown as {
  __llm: () => Promise<{ content: string; toolCalls: unknown[]; finishReason: string | null }>;
  __exec: (name: string, args: Record<string, unknown>) => Promise<{ status: number; data?: unknown }>;
};

// The Keycloak admin client is ESM-only, which Jest can't load; the owner lookup is stubbed below.
jest.mock('@keycloak/keycloak-admin-client', () => ({
  __esModule: true,
  default: class {
    users = { findOne: jest.fn() };
    realms = { findOne: jest.fn() };
    auth = jest.fn();
  },
}));
jest.mock('../../src/middleware/auth/keycloak.middleware', () => {
  const actual = jest.requireActual('../../src/middleware/auth/keycloak.middleware');
  return {
    ...actual,
    authenticateKeycloak: (req: any, res: any, next: any) => {
      const session = /^Bearer session:(.+)$/.exec(req.headers.authorization ?? '');
      if (!session) return actual.authenticateKeycloak(req, res, next);
      req.kauth = { grant: { access_token: { content: { sub: session[1], email: 'olga@example.com', preferred_username: 'olga' } } } };
      req.authContext = { method: 'session' };
      next();
    },
  };
});
jest.mock('../../src/services/ai/llm-stream.service', () => ({
  ...jest.requireActual('../../src/services/ai/llm-stream.service'),
  streamChatCompletion: () => hooks.__llm(),
}));
jest.mock('../../src/services/ai/tool-executor.service', () => ({
  ...jest.requireActual('../../src/services/ai/tool-executor.service'),
  executeToolCall: (name: string, args: Record<string, unknown>) => hooks.__exec(name, args),
}));
// Tool arguments are the stub model's business here; keep the real operation lookup.
jest.mock('../../src/services/ai/openapi-tool-builder.service', () => ({
  ...jest.requireActual('../../src/services/ai/openapi-tool-builder.service'),
  validateToolArguments: () => ({ ok: true }),
}));
jest.mock('../../src/services/ai/tool-selection.service', () => ({
  ...jest.requireActual('../../src/services/ai/tool-selection.service'),
  selectTools: async () => [],
}));

import express from 'express';
import request from 'supertest';
import dotenv from 'dotenv';
import path from 'path';

const envPath = process.env.DOCKER_ENV
  ? path.resolve(__dirname, '../../.env.test.docker')
  : path.resolve(__dirname, '../../.env.test');
dotenv.config({ path: envPath });

import setupRoutes from '../../src/routes';
import { getDbClient } from '../../src/utils/database';
import { keycloakService } from '../../src/services/keycloak.service';

const OWNER = '123e4567-e89b-12d3-a456-426614174000';

const app = express();
app.use(express.json());
setupRoutes(app);

type Round = { content: string; toolCalls: unknown[]; finishReason: string | null };
let rounds: Round[] = [];
let execCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
let llmDelayMs = 0;

const answer = (content: string): Round => ({ content, toolCalls: [], finishReason: 'stop' });
const proposeTimeEntry = (id = 'call-1'): Round => ({
  content: 'I will log 2 hours.',
  toolCalls: [{ id, type: 'function', function: { name: 'post_time_entries', arguments: '{"description":"Work"}' } }],
  finishReason: 'tool_calls',
});

let tokenCount = 0;
async function token(approvalMode: 'self' | 'in_app' = 'self') {
  const res = await request(app)
    .post('/api/api-tokens')
    .set('Authorization', `Bearer session:${OWNER}`)
    .send({
      name: `A2A agent ${++tokenCount}`,
      permissions: { resources: { time_entries: 'write' }, capabilities: ['assistant'] },
      approval_mode: approvalMode,
      expires_at: null,
    });
  expect(res.status).toBe(201);
  return res.body.secret as string;
}

let rpcId = 0;
const rpc = (secret: string, method: string, params: Record<string, unknown> = {}) =>
  request(app)
    .post('/api/ai/a2a')
    .set('Authorization', `Bearer ${secret}`)
    .send({ jsonrpc: '2.0', id: ++rpcId, method, params });

const userMessage = (text: string | null, extra: Record<string, unknown> = {}, data?: Record<string, unknown>) => ({
  message: {
    kind: 'message',
    role: 'user',
    messageId: `m-${rpcId}`,
    parts: [...(text ? [{ kind: 'text', text }] : []), ...(data ? [{ kind: 'data', data }] : [])],
    ...extra,
  },
});

// Everything sits in one describe so its afterAll (the cleanup) runs before
// the global afterAll in tests/setup.ts closes the database pool.
describe('A2A', () => {
  beforeAll(async () => {
    const db = getDbClient();
    await db.query('DELETE FROM api_tokens WHERE user_id = $1', [OWNER]);
    await db.query(
      `UPDATE settings SET ai_enabled = true, ai_api_url = 'http://llm.invalid/v1', ai_model = 'test-model' WHERE user_id = $1`,
      [OWNER]
    );
    jest.spyOn(keycloakService, 'findUserById').mockResolvedValue({
      id: OWNER,
      enabled: true,
      email: 'olga@example.com',
      username: 'olga',
      firstName: 'Olga',
    });
  });

  afterAll(async () => {
    const db = getDbClient();
    await db.query('DELETE FROM ai_conversations WHERE user_id = $1', [OWNER]);
    await db.query('DELETE FROM api_tokens WHERE user_id = $1', [OWNER]);
    await db.query('UPDATE settings SET ai_enabled = false, ai_api_url = NULL, ai_model = NULL WHERE user_id = $1', [OWNER]);
  });

  beforeEach(() => {
    rounds = [];
    execCalls = [];
    llmDelayMs = 0;
    let call = 0;
    hooks.__llm = async () => {
      if (llmDelayMs) await new Promise((r) => setTimeout(r, llmDelayMs));
      return rounds[Math.min(call++, rounds.length - 1)] ?? answer('done');
    };
    hooks.__exec = async (name, args) => {
      execCalls.push({ name, args });
      return { status: 201, data: { id: 'te-1' } };
    };
  });

  it('serves a public agent card pointing at the JSON-RPC endpoint', async () => {
    for (const p of ['/.well-known/agent-card.json', '/.well-known/agent.json']) {
      const res = await request(app).get(p);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        protocolVersion: '0.3.0',
        url: 'https://tyme.example.com/api/ai/a2a',
        preferredTransport: 'JSONRPC',
        capabilities: { streaming: true, pushNotifications: false },
        security: [{ openTymeApiToken: [] }],
      });
      expect(res.body.securitySchemes.openTymeApiToken).toMatchObject({ type: 'http', scheme: 'bearer' });
    }
  });

  it('answers a message with a completed task and keeps it retrievable', async () => {
    const secret = await token();
    rounds = [answer('You worked 3 hours this week.')];

    const res = await rpc(secret, 'message/send', userMessage('How much did I work this week?'));
    expect(res.body.error).toBeUndefined();
    const task = res.body.result;
    expect(task).toMatchObject({ kind: 'task', status: { state: 'completed' } });
    expect(task.artifacts[0].parts[0]).toEqual({ kind: 'text', text: 'You worked 3 hours this week.' });

    const again = await rpc(secret, 'tasks/get', { id: task.id, historyLength: 10 });
    expect(again.body.result.status.state).toBe('completed');
    expect(again.body.result.history.map((m: any) => m.role)).toEqual(['user', 'agent']);

    // The conversation belongs to the token.
    const { rows } = await getDbClient().query('SELECT api_token_id FROM ai_conversations WHERE id = $1', [task.contextId]);
    expect(rows[0].api_token_id).not.toBeNull();
  });

  it('pauses writes for approval and runs them once approved on the task', async () => {
    const secret = await token();
    rounds = [proposeTimeEntry()];
    const first = (await rpc(secret, 'message/send', userMessage('Log 2 hours of work today'))).body.result;
    expect(first.status.state).toBe('input-required');
    expect(execCalls).toHaveLength(0);
    const request = first.status.message.parts.find((p: any) => p.kind === 'data').data;
    expect(request).toMatchObject({
      type: 'approval_request',
      approvalMode: 'self',
      actions: [{ toolCallId: 'call-1', toolName: 'post_time_entries' }],
    });

    rounds = [answer('Logged 2 hours.')];
    const approved = await rpc(
      secret,
      'message/send',
      userMessage(null, { taskId: first.id, contextId: first.contextId }, { decision: 'approve' })
    );
    expect(approved.body.result).toMatchObject({ id: first.id, status: { state: 'completed' } });
    expect(execCalls.map((c) => c.name)).toEqual(['post_time_entries']);
  });

  it("refuses decisions from a token whose owner approves in the app, and reflects the owner's approval", async () => {
    const secret = await token('in_app');
    rounds = [proposeTimeEntry()];
    const first = (await rpc(secret, 'message/send', userMessage('Log 2 hours'))).body.result;
    expect(first.status.message.parts.find((p: any) => p.kind === 'data').data.approvalMode).toBe('in_app');

    const refused = await rpc(secret, 'message/send', userMessage(null, { taskId: first.id }, { decision: 'approve' }));
    expect(refused.body.error.code).toBe(-32004);
    expect(execCalls).toHaveLength(0);

    // The owner approves in the web app (signed-in session, AG-UI endpoint).
    rounds = [answer('Logged.')];
    const pending = await getDbClient().query(
      `SELECT id FROM ai_messages WHERE conversation_id = $1 AND metadata->>'status' = 'awaiting_approval'`,
      [first.contextId]
    );
    const web = await request(app)
      .post(`/api/ai/run/${first.contextId}/approve`)
      .set('Authorization', `Bearer session:${OWNER}`)
      .send({ approvals: [{ toolCallId: 'call-1', decision: 'approve' }], batchId: pending.rows[0].id });
    expect(web.status).toBe(200);
    expect(execCalls.map((c) => c.name)).toEqual(['post_time_entries']);

    const after = await rpc(secret, 'tasks/get', { id: first.id });
    expect(after.body.result.status.state).toBe('completed');
  });

  it('continues an input-required task with text: the actions are declined, the task id stays', async () => {
    const secret = await token();
    rounds = [proposeTimeEntry()];
    const first = (await rpc(secret, 'message/send', userMessage('Log 2 hours'))).body.result;

    rounds = [answer('Okay, nothing logged.')];
    const followUp = await rpc(secret, 'message/send', userMessage('Actually, never mind.', { taskId: first.id }));
    expect(followUp.body.result).toMatchObject({ id: first.id, status: { state: 'completed' } });
    expect(execCalls).toHaveLength(0);
    const history = (await rpc(secret, 'tasks/get', { id: first.id, historyLength: 10 })).body.result.history;
    expect(history.filter((m: any) => m.role === 'user').map((m: any) => m.parts[0].text)).toEqual([
      'Log 2 hours',
      'Actually, never mind.',
    ]);
  });

  it('cancels a task waiting for approval, and not a finished one', async () => {
    const secret = await token();
    rounds = [proposeTimeEntry()];
    const first = (await rpc(secret, 'message/send', userMessage('Log 2 hours'))).body.result;

    const canceled = await rpc(secret, 'tasks/cancel', { id: first.id });
    expect(canceled.body.result.status.state).toBe('canceled');
    const { rows } = await getDbClient().query(
      `SELECT 1 FROM ai_messages WHERE conversation_id = $1 AND metadata->>'status' = 'awaiting_approval'`,
      [first.contextId]
    );
    expect(rows).toHaveLength(0);

    expect((await rpc(secret, 'tasks/cancel', { id: first.id })).body.error.code).toBe(-32002);
  });

  it("can't see another token's tasks or continue its conversation", async () => {
    const a = await token();
    const b = await token();
    rounds = [answer('Hi.')];
    const task = (await rpc(a, 'message/send', userMessage('Hello'))).body.result;

    expect((await rpc(b, 'tasks/get', { id: task.id })).body.error.code).toBe(-32001);
    const hijack = await rpc(b, 'message/send', userMessage('Hello again', { contextId: task.contextId }));
    expect(hijack.body.error.code).toBe(-32602);
  });

  it('returns at once when not blocking, and the task completes in the background', async () => {
    const secret = await token();
    rounds = [answer('Background answer.')];
    llmDelayMs = 300;
    const res = await rpc(secret, 'message/send', { ...userMessage('Slow question'), configuration: { blocking: false } });
    expect(res.body.result.status.state).toBe('working');

    let state = 'working';
    for (let i = 0; i < 40 && state === 'working'; i++) {
      await new Promise((r) => setTimeout(r, 50));
      state = (await rpc(secret, 'tasks/get', { id: res.body.result.id })).body.result.status.state;
    }
    expect(state).toBe('completed');
  });

  it('streams the task, then the answer and a final status', async () => {
    const secret = await token();
    rounds = [answer('Streamed answer.')];
    const res = await rpc(secret, 'message/stream', userMessage('Stream please'));
    expect(res.headers['content-type']).toContain('text/event-stream');
    const events = res.text
      .split('\n\n')
      .filter((chunk) => chunk.startsWith('data: '))
      .map((chunk) => JSON.parse(chunk.slice(6)).result);
    expect(events[0]).toMatchObject({ kind: 'task', status: { state: 'working' } });
    expect(events.find((e: any) => e.kind === 'artifact-update').artifact.parts[0].text).toBe('Streamed answer.');
    expect(events[events.length - 1]).toMatchObject({ kind: 'status-update', final: true, status: { state: 'completed' } });
  });

  it('speaks JSON-RPC errors', async () => {
    const secret = await token();
    const bad = await request(app).post('/api/ai/a2a').set('Authorization', `Bearer ${secret}`).send({ hello: 'world' });
    expect(bad.body.error.code).toBe(-32600);
    expect((await rpc(secret, 'tasks/frobnicate')).body.error.code).toBe(-32601);
    expect((await rpc(secret, 'tasks/pushNotificationConfig/set', {})).body.error.code).toBe(-32003);
    expect((await rpc(secret, 'tasks/get', { id: '00000000-0000-4000-8000-000000000000' })).body.error.code).toBe(-32001);
    expect((await rpc(secret, 'message/send', { message: { parts: [] } })).body.error.code).toBe(-32602);
  });

  it('needs the assistant capability', async () => {
    const res = await request(app)
      .post('/api/api-tokens')
      .set('Authorization', `Bearer session:${OWNER}`)
      .send({ name: 'no assistant', permissions: { resources: { time_entries: 'read' } }, expires_at: null });
    const denied = await rpc(res.body.secret, 'tasks/get', { id: 'x' });
    expect(denied.status).toBe(403);
  });
});
