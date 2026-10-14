/**
 * OAuth 2.1 for MCP clients, end to end against the test DB: discovery,
 * registration, consent, the token endpoint (PKCE), and using the issued
 * token on /api/mcp. Keycloak sessions and the owner lookup are stubbed.
 */

process.env.NODE_ENV = 'test';
process.env.KEYCLOAK_ADMIN_CLIENT_SECRET ??= 'test-secret';
process.env.PUBLIC_URL = 'https://tyme.example.com';
process.env.OAUTH_REGISTER_RATE_LIMIT_MAX = '1000';
process.env.OAUTH_TOKEN_RATE_LIMIT_MAX = '1000';

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

import crypto from 'crypto';
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
import { EmailService } from '../../src/services/external/email.service';

const OWNER = '123e4567-e89b-12d3-a456-426614174000';
const BASE = 'https://tyme.example.com';
const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
setupRoutes(app);

const session = `Bearer session:${OWNER}`;
const pkce = () => {
  const verifier = crypto.randomBytes(32).toString('base64url');
  return { verifier, challenge: crypto.createHash('sha256').update(verifier).digest('base64url') };
};

async function register(extra: Record<string, unknown> = {}) {
  const res = await request(app)
    .post('/api/oauth/register')
    .send({ client_name: 'Claude', redirect_uris: [REDIRECT], ...extra });
  expect(res.status).toBe(201);
  return res.body;
}

/** Runs the consent step as the signed-in user and returns the code from the redirect. */
async function authorize(clientId: string, challenge: string, grant: Record<string, unknown> = {}) {
  const res = await request(app)
    .post('/api/oauth/authorize')
    .set('Authorization', session)
    .send({
      request: {
        response_type: 'code',
        client_id: clientId,
        redirect_uri: REDIRECT,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state: 'xyz',
        resource: `${BASE}/api/mcp`,
      },
      grant: { permissions: { resources: { clients: 'read' } }, approval_mode: 'self', expires_at: null, ...grant },
    });
  expect(res.status).toBe(200);
  const url = new URL(res.body.redirect);
  expect(url.origin + url.pathname).toBe(REDIRECT);
  expect(url.searchParams.get('state')).toBe('xyz');
  expect(url.searchParams.get('iss')).toBe(BASE);
  return url.searchParams.get('code')!;
}

const exchange = (body: Record<string, unknown>) =>
  request(app).post('/api/oauth/token').type('form').send({ grant_type: 'authorization_code', redirect_uri: REDIRECT, ...body });

// Everything sits in one describe so its afterAll (the cleanup) runs before
// the global afterAll in tests/setup.ts closes the database pool.
describe('OAuth for MCP clients', () => {
  const clean = async () => {
    await getDbClient().query('DELETE FROM api_tokens WHERE user_id = $1', [OWNER]);
    await getDbClient().query(`DELETE FROM oauth_clients WHERE name LIKE 'Claude%' OR name = 'MCP client'`);
  };
  beforeAll(async () => {
    await clean();
    jest.spyOn(keycloakService, 'findUserById').mockResolvedValue({ id: OWNER, enabled: true, email: 'olga@example.com', username: 'olga' });
    jest.spyOn(EmailService.prototype, 'sendNotificationEmail').mockResolvedValue(undefined);
  });
  afterAll(clean);

  it('is discoverable from a 401 on /api/mcp', async () => {
    const unauthenticated = await request(app).post('/api/mcp').send({});
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.headers['www-authenticate']).toContain(
      `resource_metadata="${BASE}/.well-known/oauth-protected-resource/api/mcp"`
    );

    const resource = await request(app).get('/.well-known/oauth-protected-resource/api/mcp');
    expect(resource.body).toMatchObject({ resource: `${BASE}/api/mcp`, authorization_servers: [BASE] });

    const server = await request(app).get('/.well-known/oauth-authorization-server');
    expect(server.body).toMatchObject({
      issuer: BASE,
      authorization_endpoint: `${BASE}/oauth/authorize`,
      token_endpoint: `${BASE}/api/oauth/token`,
      registration_endpoint: `${BASE}/api/oauth/register`,
      code_challenge_methods_supported: ['S256'],
      grant_types_supported: ['authorization_code'],
    });
  });

  it('registers clients with safe redirect URIs only', async () => {
    const client = await register();
    expect(client).toMatchObject({ client_name: 'Claude', token_endpoint_auth_method: 'none', redirect_uris: [REDIRECT] });
    expect(client.client_secret).toBeUndefined();

    for (const redirect_uris of [['http://evil.example/cb'], ['https://x.example/cb#frag'], ['javascript:alert(1)'], []]) {
      const res = await request(app).post('/api/oauth/register').send({ client_name: 'Claude', redirect_uris });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_redirect_uri');
    }
    // Native apps may use loopback over http.
    expect((await request(app).post('/api/oauth/register').send({ redirect_uris: ['http://127.0.0.1:33418/callback'] })).status).toBe(201);
  });

  it('describes a request for the consent page, and never redirects to an unregistered URI', async () => {
    const client = await register();
    const ok = await request(app)
      .get('/api/oauth/authorize/request')
      .query({ response_type: 'code', client_id: client.client_id, redirect_uri: REDIRECT, code_challenge: pkce().challenge, code_challenge_method: 'S256' })
      .set('Authorization', session);
    expect(ok.body.client).toEqual({ id: client.client_id, name: 'Claude', redirectHost: 'claude.ai' });

    const foreign = await request(app)
      .get('/api/oauth/authorize/request')
      .query({ response_type: 'code', client_id: client.client_id, redirect_uri: 'https://evil.example/cb', code_challenge: pkce().challenge, code_challenge_method: 'S256' })
      .set('Authorization', session);
    expect(foreign.status).toBe(400);
    expect(foreign.body.redirect).toBeUndefined();

    const noPkce = await request(app)
      .get('/api/oauth/authorize/request')
      .query({ response_type: 'code', client_id: client.client_id, redirect_uri: REDIRECT })
      .set('Authorization', session);
    expect(noPkce.status).toBe(400);
    expect(new URL(noPkce.body.redirect).searchParams.get('error')).toBe('invalid_request');
  });

  it('issues an ordinary API token with MCP access that works on /api/mcp', async () => {
    const client = await register();
    const { verifier, challenge } = pkce();
    const code = await authorize(client.client_id, challenge);

    const res = await exchange({ code, code_verifier: verifier, client_id: client.client_id, resource: `${BASE}/api/mcp` });
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toMatchObject({ token_type: 'Bearer', scope: 'mcp' });
    expect(res.body.access_token).toMatch(/^oty_pat_/);
    expect(res.body.expires_in).toBeUndefined(); // the user chose "never"

    const list = await request(app)
      .post('/api/mcp')
      .set('Authorization', `Bearer ${res.body.access_token}`)
      .set('Accept', 'application/json, text/event-stream')
      .set('MCP-Protocol-Version', '2025-06-18')
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    const names = list.body.result.tools.map((t: { name: string }) => t.name);
    expect(names).toContain('get_clients');
    expect(names).not.toContain('get_invoices');

    // It is one of the user's tokens, named after the client.
    const tokens = await request(app).get('/api/api-tokens').set('Authorization', session);
    const token = tokens.body.tokens.find((t: any) => t.oauth_client_id === client.client_id);
    expect(token).toMatchObject({ name: 'Claude', oauth_client_name: 'Claude' });
    expect(token.permissions).toEqual({ resources: { clients: 'read' }, capabilities: ['mcp'] });
  });

  it('refuses reused codes, wrong verifiers, other clients and other redirect URIs', async () => {
    const client = await register();
    const other = await register();
    const { verifier, challenge } = pkce();

    const code = await authorize(client.client_id, challenge);
    expect((await exchange({ code, code_verifier: verifier, client_id: client.client_id })).status).toBe(200);
    const reused = await exchange({ code, code_verifier: verifier, client_id: client.client_id });
    expect(reused.body.error).toBe('invalid_grant');

    const wrongVerifier = await exchange({ code: await authorize(client.client_id, challenge), code_verifier: pkce().verifier, client_id: client.client_id });
    expect(wrongVerifier.body.error).toBe('invalid_grant');

    const stolen = await exchange({ code: await authorize(client.client_id, challenge), code_verifier: verifier, client_id: other.client_id });
    expect(stolen.body.error).toBe('invalid_grant');

    const wrongRedirect = await exchange({
      code: await authorize(client.client_id, challenge),
      code_verifier: verifier,
      client_id: client.client_id,
      redirect_uri: 'https://claude.ai/other',
    });
    expect(wrongRedirect.body.error).toBe('invalid_grant');

    const expiredCode = await authorize(client.client_id, challenge);
    await getDbClient().query(`UPDATE oauth_authorization_codes SET expires_at = NOW() - INTERVAL '1 second'`);
    expect((await exchange({ code: expiredCode, code_verifier: verifier, client_id: client.client_id })).body.error).toBe('invalid_grant');
  });

  it('makes confidential clients authenticate', async () => {
    const client = await register({ token_endpoint_auth_method: 'client_secret_basic' });
    expect(client.client_secret).toBeDefined();
    const { verifier, challenge } = pkce();

    const noSecret = await exchange({ code: await authorize(client.client_id, challenge), code_verifier: verifier, client_id: client.client_id });
    expect(noSecret.status).toBe(401);
    expect(noSecret.body.error).toBe('invalid_client');

    const basic = Buffer.from(`${client.client_id}:${client.client_secret}`).toString('base64');
    const ok = await exchange({ code: await authorize(client.client_id, challenge), code_verifier: verifier }).set('Authorization', `Basic ${basic}`);
    expect(ok.status).toBe(200);
  });

  it('honours the expiry and approval mode the user chose', async () => {
    const client = await register();
    const { verifier, challenge } = pkce();
    const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000);
    const code = await authorize(client.client_id, challenge, { expires_at: expires.toISOString(), approval_mode: 'in_app' });
    const res = await exchange({ code, code_verifier: verifier, client_id: client.client_id });
    expect(res.body.expires_in).toBeGreaterThan(7 * 24 * 3600 - 60);
    const current = await request(app).get('/api/api-tokens/current').set('Authorization', `Bearer ${res.body.access_token}`);
    expect(current.body.token.approval_mode).toBe('in_app');
  });

  it('sends a denial back to the client', async () => {
    const client = await register();
    const res = await request(app)
      .post('/api/oauth/authorize/deny')
      .set('Authorization', session)
      .send({ request: { response_type: 'code', client_id: client.client_id, redirect_uri: REDIRECT, code_challenge: pkce().challenge, code_challenge_method: 'S256', state: 's1' } });
    const url = new URL(res.body.redirect);
    expect(url.searchParams.get('error')).toBe('access_denied');
    expect(url.searchParams.get('state')).toBe('s1');
  });

  it('never lets a token drive the consent step', async () => {
    const client = await register();
    const { verifier, challenge } = pkce();
    const token = (await exchange({ code: await authorize(client.client_id, challenge), code_verifier: verifier, client_id: client.client_id })).body
      .access_token;
    const res = await request(app)
      .post('/api/oauth/authorize')
      .set('Authorization', `Bearer ${token}`)
      .send({ request: {}, grant: {} });
    expect(res.status).toBe(403);
  });
});
