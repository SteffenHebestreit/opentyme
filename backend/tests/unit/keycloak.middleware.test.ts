/**
 * authenticateKeycloak: Keycloak's introspection is the authority.
 * - "inactive" (expired, signed out, revoked) → 401, even for a token whose
 *   signature is valid — the old local fallback accepted signed-out tokens
 * - Keycloak unreachable → the signature is checked locally instead
 * - tokens issued under the public URL are introspected with forwarded
 *   headers for that URL, so Keycloak judges them by the right issuer
 */

process.env.KEYCLOAK_ADMIN_CLIENT_SECRET ??= 'test-secret';
process.env.KEYCLOAK_PUBLIC_URL = 'https://auth.example.com';
process.env.KEYCLOAK_REALM = 'opentyme';

// The Keycloak admin client is ESM-only, which Jest can't load.
jest.mock('@keycloak/keycloak-admin-client', () => ({ __esModule: true, default: class {} }));

const mockPost = jest.fn();
const mockGet = jest.fn();
jest.mock('axios', () => ({
  __esModule: true,
  default: { post: (...a: unknown[]) => mockPost(...a), get: (...a: unknown[]) => mockGet(...a) },
}));

import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import express from 'express';
import request from 'supertest';
import { authenticateKeycloak } from '../../src/middleware/auth/keycloak.middleware';

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicKeyBody = publicKey
  .export({ type: 'spki', format: 'pem' })
  .toString()
  .replace(/-----[^-]+-----/g, '')
  .replace(/\s+/g, '');

const PUBLIC_ISSUER = 'https://auth.example.com/realms/opentyme';
const sign = (claims: Record<string, unknown> = {}) =>
  jwt.sign({ sub: 'u1', preferred_username: 'olga', ...claims }, privateKey, {
    algorithm: 'RS256',
    issuer: PUBLIC_ISSUER,
    expiresIn: 300,
  });

const app = express();
app.get('/protected', authenticateKeycloak, (_req, res) => {
  res.json({ ok: true });
});
const call = (token: string) => request(app).get('/protected').set('Authorization', `Bearer ${token}`);

beforeEach(() => {
  mockPost.mockReset();
  mockGet.mockReset().mockResolvedValue({ data: { public_key: publicKeyBody } });
});

it('accepts a token Keycloak calls active', async () => {
  mockPost.mockResolvedValue({ data: { active: true, sub: 'u1', preferred_username: 'olga' } });
  expect((await call(sign({ jti: 'a' }))).status).toBe(200);
});

it('refuses a signed-out token although its signature is valid', async () => {
  mockPost.mockResolvedValue({ data: { active: false } });
  const res = await call(sign({ jti: 'b' }));
  expect(res.status).toBe(401);
  expect(res.headers['www-authenticate']).toContain('error="invalid_token"');
});

it('asks Keycloak with forwarded headers for the public URL the token was issued under', async () => {
  mockPost.mockResolvedValue({ data: { active: true, sub: 'u1' } });
  await call(sign({ jti: 'c' }));
  const headers = mockPost.mock.calls[0][2].headers;
  expect(headers).toMatchObject({ 'X-Forwarded-Proto': 'https', 'X-Forwarded-Host': 'auth.example.com', 'X-Forwarded-Port': '443' });
});

it('sends no forwarded headers for a token from another issuer', async () => {
  mockPost.mockResolvedValue({ data: { active: false } });
  const foreign = jwt.sign({ sub: 'u1' }, privateKey, { algorithm: 'RS256', issuer: 'https://evil.example/realms/x' });
  expect((await call(foreign)).status).toBe(401);
  expect(mockPost.mock.calls[0][2].headers['X-Forwarded-Host']).toBeUndefined();
});

describe('when Keycloak cannot be asked', () => {
  beforeEach(() => {
    mockPost.mockRejectedValue(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }));
  });

  it('accepts a token with a valid signature', async () => {
    expect((await call(sign({ jti: 'd' }))).status).toBe(200);
  });

  it('refuses a forged or malformed token', async () => {
    const forged = jwt.sign({ sub: 'u1' }, crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey, {
      algorithm: 'RS256',
      issuer: PUBLIC_ISSUER,
    });
    expect((await call(forged)).status).toBe(401);
    expect((await call('not-a-jwt')).status).toBe(401);
  });
});

it('answers 401 without any token', async () => {
  expect((await request(app).get('/protected')).status).toBe(401);
});
