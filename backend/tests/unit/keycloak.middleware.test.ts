/**
 * authenticateKeycloak answers 401 (not 403) for tokens that are expired,
 * malformed or otherwise can't be verified, so clients re-authenticate.
 */

process.env.KEYCLOAK_ADMIN_CLIENT_SECRET ??= 'test-secret';

// The Keycloak admin client is ESM-only, which Jest can't load.
jest.mock('@keycloak/keycloak-admin-client', () => ({ __esModule: true, default: class {} }));

const mockPost = jest.fn();
const mockGet = jest.fn();
jest.mock('axios', () => ({
  __esModule: true,
  default: { post: (...a: unknown[]) => mockPost(...a), get: (...a: unknown[]) => mockGet(...a) },
}));

import express from 'express';
import request from 'supertest';
import { authenticateKeycloak } from '../../src/middleware/auth/keycloak.middleware';

const app = express();
app.get('/protected', authenticateKeycloak, (_req, res) => {
  res.json({ ok: true });
});

beforeEach(() => {
  mockPost.mockReset();
  mockGet.mockReset().mockResolvedValue({ data: { public_key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtest' } });
});

it.each([
  ['a malformed token', 'not-a-jwt'],
  ['an expired or foreign JWT', 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ4In0.c2ln'],
])('answers 401 with invalid_token for %s', async (_label, token) => {
  mockPost.mockResolvedValue({ data: { active: false } });
  const res = await request(app).get('/protected').set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(401);
  expect(res.headers['www-authenticate']).toContain('error="invalid_token"');
});

it('lets an active token through', async () => {
  mockPost.mockResolvedValue({ data: { active: true, sub: 'u1', preferred_username: 'olga' } });
  const res = await request(app).get('/protected').set('Authorization', 'Bearer valid-active-token');
  expect(res.status).toBe(200);
});

it('answers 401 without any token', async () => {
  expect((await request(app).get('/protected')).status).toBe(401);
});
