/**
 * Personal access tokens end to end: managing them with a signed-in session,
 * and calling the real API with them against the test DB.
 *
 * The Keycloak JWT path is replaced: `Bearer session:<userId>` stands for a
 * signed-in user. Token requests (`Bearer oty_pat_…`) go through the real
 * middleware; only the Keycloak owner lookup is stubbed.
 */

process.env.NODE_ENV = 'test';
process.env.KEYCLOAK_ADMIN_CLIENT_SECRET ??= 'test-secret';

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
      req.kauth = {
        grant: {
          access_token: {
            content: { sub: session[1], email: 'owner@example.com', preferred_username: 'owner', realm_access: { roles: ['user', 'admin'] } },
          },
        },
      };
      req.authContext = { method: 'session' };
      next();
    },
  };
});

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
import { MAX_TOKENS_PER_USER, generateApiToken } from '../../src/services/auth/api-token.service';

const OWNER = '123e4567-e89b-12d3-a456-426614174000';
const OTHER = '223e4567-e89b-42d3-a456-426614174998';
const DISABLED = '323e4567-e89b-42d3-a456-426614174997';
const OUTAGE = '423e4567-e89b-42d3-a456-426614174996';
const USERS = [OWNER, OTHER, DISABLED, OUTAGE];

const app = express();
app.use(express.json());
setupRoutes(app);

const session = (userId = OWNER) => `Bearer session:${userId}`;
const bearer = (secret: string) => `Bearer ${secret}`;

async function createToken(body: Record<string, unknown>, userId = OWNER) {
  const res = await request(app)
    .post('/api/api-tokens')
    .set('Authorization', session(userId))
    .send({ expires_at: null, ...body });
  expect(res.status).toBe(201);
  return res.body as { token: { id: string; [k: string]: any }; secret: string };
}

let tokenCounter = 0;
const uniqueName = (label: string) => `${label} ${++tokenCounter}`;

async function cleanTokens() {
  await getDbClient().query('DELETE FROM api_tokens WHERE user_id = ANY($1::uuid[])', [USERS]);
}

// Everything sits in one describe so its afterAll (the cleanup) runs before
// the global afterAll in tests/setup.ts closes the database pool.
describe('personal access tokens', () => {
  beforeAll(async () => {
    await cleanTokens();
    jest.spyOn(keycloakService, 'findUserById').mockImplementation(async (id: string) => {
      if (id === OUTAGE) throw new Error('connect ECONNREFUSED keycloak:8080');
      if (id === DISABLED) return { id, enabled: false, username: 'gone' };
      if (id === OWNER || id === OTHER) {
        return { id, enabled: true, email: 'owner@example.com', username: 'owner', firstName: 'Olga', lastName: 'Owner', emailVerified: true };
      }
      return null;
    });
  });

  afterAll(async () => {
    await cleanTokens();
  });

  describe('managing tokens (signed in)', () => {
    it('creates a token and shows the secret only in that response', async () => {
      const { token, secret } = await createToken({
        name: uniqueName('Script'),
        description: 'nightly export',
        permissions: { resources: { clients: 'read', projects: 'none' }, capabilities: ['mcp'] },
      });
      expect(secret).toMatch(/^oty_pat_[0-9A-Za-z]{46}$/);
      expect(token.token_prefix).toBe(secret.slice(0, 12));
      // 'none' is not stored: what is stored is exactly what is granted.
      expect(token.permissions).toEqual({ resources: { clients: 'read' }, capabilities: ['mcp'] });
      expect(token.approval_mode).toBe('self');
      expect(token.expires_at).toBeNull();

      const list = await request(app).get('/api/api-tokens').set('Authorization', session());
      expect(list.status).toBe(200);
      const listed = list.body.tokens.find((t: any) => t.id === token.id);
      expect(listed).toBeDefined();
      expect(JSON.stringify(list.body)).not.toContain(secret);
      expect(listed).not.toHaveProperty('token_hash');
      expect(listed).not.toHaveProperty('secret');
    });

    it.each([
      ['no expiry choice', { permissions: { resources: {} } }],
      ['expiry in the past', { permissions: { resources: {} }, expires_at: '2020-01-01T00:00:00Z' }],
      ['a level the resource does not support', { permissions: { resources: { reports: 'write' } }, expires_at: null }],
      ['an unknown resource', { permissions: { resources: { users: 'read' } }, expires_at: null }],
      ['an unknown capability', { permissions: { resources: {}, capabilities: ['root'] }, expires_at: null }],
      ['an unknown approval mode', { permissions: { resources: {} }, approval_mode: 'auto', expires_at: null }],
    ])('rejects %s', async (_label, body) => {
      const res = await request(app)
        .post('/api/api-tokens')
        .set('Authorization', session())
        .send({ name: uniqueName('Invalid'), ...body });
      expect(res.status).toBe(400);
    });

    it('refuses a second token with the same name (case-insensitive)', async () => {
      const name = uniqueName('Duplicate');
      await createToken({ name, permissions: { resources: {} } });
      const res = await request(app)
        .post('/api/api-tokens')
        .set('Authorization', session())
        .send({ name: name.toUpperCase(), permissions: { resources: {} }, expires_at: null });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('NAME_TAKEN');
    });

    it(`stops at ${MAX_TOKENS_PER_USER} tokens per user`, async () => {
      const db = getDbClient();
      for (let i = 0; i < MAX_TOKENS_PER_USER; i++) {
        const { hash, prefix } = generateApiToken();
        await db.query(
          `INSERT INTO api_tokens (user_id, name, token_hash, token_prefix) VALUES ($1, $2, $3, $4)`,
          [OTHER, `bulk ${i}`, hash, prefix]
        );
      }
      const res = await request(app)
        .post('/api/api-tokens')
        .set('Authorization', session(OTHER))
        .send({ name: 'one too many', permissions: { resources: {} }, expires_at: null });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('LIMIT_REACHED');
      await db.query('DELETE FROM api_tokens WHERE user_id = $1', [OTHER]);
    });

    it("keeps each user's tokens to themselves", async () => {
      const { token } = await createToken({ name: uniqueName('Private'), permissions: { resources: {} } });
      const asOther = session(OTHER);
      expect((await request(app).get(`/api/api-tokens/${token.id}`).set('Authorization', asOther)).status).toBe(404);
      expect(
        (await request(app).patch(`/api/api-tokens/${token.id}`).set('Authorization', asOther).send({ name: 'mine' })).status
      ).toBe(404);
      expect(
        (await request(app).post(`/api/api-tokens/${token.id}/regenerate`).set('Authorization', asOther).send({ expires_at: null }))
          .status
      ).toBe(404);
      expect((await request(app).delete(`/api/api-tokens/${token.id}`).set('Authorization', asOther)).status).toBe(404);
      const list = await request(app).get('/api/api-tokens').set('Authorization', asOther);
      expect(list.body.tokens.map((t: any) => t.id)).not.toContain(token.id);
    });

    it('serves the permission catalog', async () => {
      const res = await request(app).get('/api/api-tokens/catalog').set('Authorization', session());
      expect(res.status).toBe(200);
      expect(res.body.levels).toEqual(['none', 'read', 'write', 'delete']);
      expect(res.body.resources).toContainEqual({ key: 'reports', levels: ['none', 'read'] });
      expect(res.body.capabilities.map((c: any) => c.key)).toEqual(['assistant', 'mcp', 'email_send']);
    });

    it('answers /current only for token requests', async () => {
      const res = await request(app).get('/api/api-tokens/current').set('Authorization', session());
      expect(res.status).toBe(400);
    });
  });

  describe('calling the API with a token', () => {
    it('reads with read, writes with write, deletes only with delete', async () => {
      const reader = await createToken({ name: uniqueName('Reader'), permissions: { resources: { clients: 'read' } } });
      const writer = await createToken({ name: uniqueName('Writer'), permissions: { resources: { clients: 'write' } } });
      const deleter = await createToken({ name: uniqueName('Deleter'), permissions: { resources: { clients: 'delete' } } });

      expect((await request(app).get('/api/clients').set('Authorization', bearer(reader.secret))).status).toBe(200);

      const denied = await request(app)
        .post('/api/clients')
        .set('Authorization', bearer(reader.secret))
        .send({ name: 'Token Client' });
      expect(denied.status).toBe(403);
      expect(denied.body.required).toBe('clients:write');
      expect(denied.headers['www-authenticate']).toContain('error="insufficient_scope"');

      const created = await request(app)
        .post('/api/clients')
        .set('Authorization', bearer(writer.secret))
        .send({ name: 'Token Client' });
      expect(created.status).toBe(201);
      const clientId = created.body.id ?? created.body.client?.id;
      expect(clientId).toBeDefined();

      // Created as the token's owner.
      const owned = await getDbClient().query('SELECT user_id FROM clients WHERE id = $1', [clientId]);
      expect(owned.rows[0].user_id).toBe(OWNER);

      const notAllowed = await request(app).delete(`/api/clients/${clientId}`).set('Authorization', bearer(writer.secret));
      expect(notAllowed.status).toBe(403);
      expect(notAllowed.body.required).toBe('clients:delete');

      expect((await request(app).delete(`/api/clients/${clientId}`).set('Authorization', bearer(deleter.secret))).status).toBe(
        200
      );
    });

    it('cannot reach anything it was not granted', async () => {
      const { secret } = await createToken({ name: uniqueName('Clients only'), permissions: { resources: { clients: 'delete' } } });
      const res = await request(app).get('/api/invoices').set('Authorization', bearer(secret));
      expect(res.status).toBe(403);
      expect(res.body.required).toBe('invoices:read');
    });

    it('can never manage tokens, settings or the system — even with every permission', async () => {
      const { secret } = await createToken({
        name: uniqueName('Everything'),
        permissions: {
          resources: {
            clients: 'delete', projects: 'delete', time_entries: 'delete', expenses: 'delete', invoices: 'delete',
            payments: 'delete', tax: 'delete', templates: 'delete', reports: 'read', addons: 'delete',
          },
          capabilities: ['assistant', 'mcp', 'email_send'],
        },
      });
      const auth = bearer(secret);
      expect((await request(app).get('/api/api-tokens').set('Authorization', auth)).status).toBe(403);
      expect(
        (await request(app).post('/api/api-tokens').set('Authorization', auth).send({ name: 'minted', permissions: { resources: {} }, expires_at: null }))
          .status
      ).toBe(403);
      expect((await request(app).get('/api/settings').set('Authorization', auth)).status).toBe(403);
      expect((await request(app).put('/api/settings').set('Authorization', auth).send({ ai_api_url: 'https://evil.example' })).status).toBe(403);
      expect((await request(app).get('/api/system/backups').set('Authorization', auth)).status).toBe(403);
      expect((await request(app).get('/api/auth/profile/me').set('Authorization', auth)).status).toBe(403);
    });

    it('describes itself at /current', async () => {
      const { token, secret } = await createToken({
        name: uniqueName('Self-aware'),
        permissions: { resources: { time_entries: 'write' }, capabilities: ['assistant'] },
        approval_mode: 'in_app',
      });
      const res = await request(app).get('/api/api-tokens/current').set('Authorization', bearer(secret));
      expect(res.status).toBe(200);
      expect(res.body.token).toMatchObject({
        id: token.id,
        permissions: { resources: { time_entries: 'write' }, capabilities: ['assistant'] },
        approval_mode: 'in_app',
        expires_at: null,
      });
      expect(res.body.user).toMatchObject({ id: OWNER, username: 'owner', name: 'Olga Owner' });
    });

    it('rejects malformed and unknown tokens with invalid_token', async () => {
      for (const secret of ['oty_pat_garbage', generateApiToken().secret]) {
        const res = await request(app).get('/api/clients').set('Authorization', bearer(secret));
        expect(res.status).toBe(401);
        expect(res.headers['www-authenticate']).toContain('error="invalid_token"');
      }
    });

    it('rejects an expired token', async () => {
      const { token, secret } = await createToken({ name: uniqueName('Short-lived'), permissions: { resources: { clients: 'read' } } });
      await getDbClient().query(`UPDATE api_tokens SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1`, [token.id]);
      const res = await request(app).get('/api/clients').set('Authorization', bearer(secret));
      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/expired/);
    });

    it('stops working on the very next request after it is revoked', async () => {
      const { token, secret } = await createToken({ name: uniqueName('Revoked'), permissions: { resources: { clients: 'read' } } });
      expect((await request(app).get('/api/clients').set('Authorization', bearer(secret))).status).toBe(200); // now cached
      expect((await request(app).delete(`/api/api-tokens/${token.id}`).set('Authorization', session())).status).toBe(200);
      expect((await request(app).get('/api/clients').set('Authorization', bearer(secret))).status).toBe(401);
    });

    it('applies changed permissions on the very next request', async () => {
      const { token, secret } = await createToken({ name: uniqueName('Widened'), permissions: { resources: { clients: 'read' } } });
      expect((await request(app).get('/api/projects').set('Authorization', bearer(secret))).status).toBe(403); // now cached
      const patched = await request(app)
        .patch(`/api/api-tokens/${token.id}`)
        .set('Authorization', session())
        .send({ permissions: { resources: { clients: 'read', projects: 'read' } } });
      expect(patched.status).toBe(200);
      expect((await request(app).get('/api/projects').set('Authorization', bearer(secret))).status).toBe(200);
    });

    it('does not let PATCH change the expiry', async () => {
      const { token } = await createToken({ name: uniqueName('Fixed expiry'), permissions: { resources: {} } });
      const res = await request(app)
        .patch(`/api/api-tokens/${token.id}`)
        .set('Authorization', session())
        .send({ expires_at: '2099-01-01T00:00:00Z' });
      expect(res.status).toBe(400);
    });

    it('regenerating replaces the secret and sets the new expiry', async () => {
      const { token, secret } = await createToken({ name: uniqueName('Rotated'), permissions: { resources: { clients: 'read' } } });
      expect((await request(app).get('/api/clients').set('Authorization', bearer(secret))).status).toBe(200); // now cached

      const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
      const res = await request(app)
        .post(`/api/api-tokens/${token.id}/regenerate`)
        .set('Authorization', session())
        .send({ expires_at: expiresAt });
      expect(res.status).toBe(200);
      expect(res.body.secret).not.toBe(secret);
      expect(res.body.token.id).toBe(token.id);
      expect(new Date(res.body.token.expires_at).toISOString()).toBe(expiresAt);

      expect((await request(app).get('/api/clients').set('Authorization', bearer(secret))).status).toBe(401);
      expect((await request(app).get('/api/clients').set('Authorization', bearer(res.body.secret))).status).toBe(200);
    });

    it('stops working when the owner account is disabled or gone', async () => {
      const { secret } = await createToken({ name: uniqueName('Orphan'), permissions: { resources: { clients: 'read' } } }, DISABLED);
      const res = await request(app).get('/api/clients').set('Authorization', bearer(secret));
      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/disabled or no longer exists/);
    });

    it('answers 503, not 401, when Keycloak cannot be reached', async () => {
      const { secret } = await createToken({ name: uniqueName('Outage'), permissions: { resources: { clients: 'read' } } }, OUTAGE);
      expect((await request(app).get('/api/clients').set('Authorization', bearer(secret))).status).toBe(503);
    });

    it('records when and from where it was last used', async () => {
      const { token, secret } = await createToken({ name: uniqueName('Tracked'), permissions: { resources: { clients: 'read' } } });
      await request(app).get('/api/clients').set('Authorization', bearer(secret)).set('User-Agent', 'agent-test/1.0');
      // The write is fire-and-forget; give it a moment.
      let row: any;
      for (let i = 0; i < 20 && !row?.last_used_at; i++) {
        await new Promise((r) => setTimeout(r, 50));
        row = (await getDbClient().query('SELECT last_used_at, last_used_user_agent FROM api_tokens WHERE id = $1', [token.id]))
          .rows[0];
      }
      expect(row.last_used_at).not.toBeNull();
      expect(row.last_used_user_agent).toBe('agent-test/1.0');
    });
  });

  describe('the assistant with a token', () => {
    const assistantToken = (label: string, approval_mode: 'self' | 'in_app' = 'self') =>
      createToken({ name: uniqueName(label), permissions: { resources: { clients: 'read' }, capabilities: ['assistant'] }, approval_mode });

    async function conversation(title: string, apiTokenId: string | null, awaitingApproval = false) {
      const db = getDbClient();
      const { rows } = await db.query(
        `INSERT INTO ai_conversations (user_id, title, api_token_id) VALUES ($1, $2, $3) RETURNING id`,
        [OWNER, title, apiTokenId]
      );
      if (awaitingApproval) {
        await db.query(
          `INSERT INTO ai_messages (conversation_id, role, content, metadata) VALUES ($1, 'assistant', 'plan', $2)`,
          [rows[0].id, JSON.stringify({ status: 'awaiting_approval', pending: [] })]
        );
      }
      return rows[0].id as string;
    }

    afterAll(async () => {
      await getDbClient().query(`DELETE FROM ai_conversations WHERE user_id = $1`, [OWNER]);
    });

    it("sees only the conversations it started, never the owner's other chats", async () => {
      const a = await assistantToken('Agent A');
      const b = await assistantToken('Agent B');
      const web = await conversation('my private chat', null);
      const mine = await conversation('agent A chat', a.token.id, true);
      const theirs = await conversation('agent B chat', b.token.id);

      const list = await request(app).get('/api/ai/conversations').set('Authorization', bearer(a.secret));
      expect(list.status).toBe(200);
      expect(list.body.map((c: any) => c.id)).toEqual([mine]);

      for (const id of [web, theirs]) {
        expect((await request(app).get(`/api/ai/conversations/${id}`).set('Authorization', bearer(a.secret))).status).toBe(404);
        expect((await request(app).delete(`/api/ai/conversations/${id}`).set('Authorization', bearer(a.secret))).status).toBe(404);
      }
      expect((await request(app).get(`/api/ai/conversations/${mine}`).set('Authorization', bearer(a.secret))).status).toBe(200);

      // The web app sees all of them, labelled, with the waiting approval flagged.
      const all = await request(app).get('/api/ai/conversations').set('Authorization', session());
      const byId = Object.fromEntries(all.body.map((c: any) => [c.id, c]));
      expect(byId[web]).toMatchObject({ api_token_name: null, awaiting_approval: false });
      expect(byId[mine]).toMatchObject({ api_token_name: a.token.name, awaiting_approval: true });
      expect(byId[theirs].api_token_name).toBe(b.token.name);
    });

    it('may not approve when its owner approves in the app', async () => {
      const inApp = await assistantToken('Supervised', 'in_app');
      const id = await conversation('supervised chat', inApp.token.id, true);
      const res = await request(app)
        .post(`/api/ai/run/${id}/approve`)
        .set('Authorization', bearer(inApp.secret))
        .send({ approvals: [{ toolCallId: 'x', decision: 'approve' }] });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('APPROVAL_IN_APP');
    });

    it('needs the assistant capability', async () => {
      const { secret } = await createToken({ name: uniqueName('No assistant'), permissions: { resources: { clients: 'read' } } });
      const res = await request(app).get('/api/ai/conversations').set('Authorization', bearer(secret));
      expect(res.status).toBe(403);
      expect(res.body.required).toBe('capability:assistant');
    });
  });
});
