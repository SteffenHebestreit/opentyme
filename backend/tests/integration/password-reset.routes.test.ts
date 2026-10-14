/**
 * "Forgot password" for Keycloak accounts, end to end against the test DB.
 * Keycloak and outgoing mail are stubbed; the reset-token table is real.
 */

process.env.NODE_ENV = 'test';
process.env.KEYCLOAK_ADMIN_CLIENT_SECRET ??= 'test-secret';
// The reset endpoints are rate limited per IP; every request here comes from one.
process.env.PASSWORD_RESET_RATE_LIMIT_MAX = '1000';
process.env.FRONTEND_URL = 'https://app.example.com/';

// The Keycloak admin client is ESM-only, which Jest can't load; Keycloak calls are stubbed below.
jest.mock('@keycloak/keycloak-admin-client', () => ({
  __esModule: true,
  default: class {
    users = { findOne: jest.fn() };
    realms = { findOne: jest.fn() };
    auth = jest.fn();
  },
}));

const mockSendResetEmail = jest.fn();
jest.mock('../../src/services/external/email.service', () => ({
  EmailService: class {
    sendPasswordResetEmail = (...args: unknown[]) => mockSendResetEmail(...args);
  },
}));

import express from 'express';
import request from 'supertest';
import dotenv from 'dotenv';
import path from 'path';

const envPath = process.env.DOCKER_ENV
  ? path.resolve(__dirname, '../../.env.test.docker')
  : path.resolve(__dirname, '../../.env.test');
dotenv.config({ path: envPath });

import passwordResetRoutes from '../../src/routes/auth/password-reset.routes';
import { getDbClient } from '../../src/utils/database';
import { keycloakService, PasswordRejectedError } from '../../src/services/keycloak.service';

const USER_ID = '523e4567-e89b-42d3-a456-426614174995';
const DISABLED_ID = '623e4567-e89b-42d3-a456-426614174994';
const LINK_SENT = 'If your email address exists in our database, you will receive a password reset link shortly.';

const app = express();
app.use(express.json());
app.use('/api/password-reset', passwordResetRoutes);

const findUserByEmail = jest.spyOn(keycloakService, 'findUserByEmail');
const setUserPassword = jest.spyOn(keycloakService, 'setUserPassword');
const logoutUser = jest.spyOn(keycloakService, 'logoutUser');

/** The mail goes out after the response (same answer, same timing, for every address). */
async function settle() {
  for (let i = 0; i < 40; i++) {
    if (mockSendResetEmail.mock.calls.length > 0) return;
    await new Promise((r) => setTimeout(r, 25));
  }
}

async function requestLink(email = 'olga@example.com'): Promise<string> {
  mockSendResetEmail.mockClear();
  const res = await request(app).post('/api/password-reset/request').send({ email });
  expect(res.status).toBe(200);
  expect(res.body.message).toBe(LINK_SENT);
  await settle();
  expect(mockSendResetEmail).toHaveBeenCalledTimes(1);
  const [to, link] = mockSendResetEmail.mock.calls[0];
  expect(to).toBe('olga@example.com');
  const url = new URL(link);
  expect(url.origin + url.pathname).toBe('https://app.example.com/reset-password');
  return url.searchParams.get('token')!;
}

const reset = (token: string, newPassword = 'N3w-Passw0rd!') =>
  request(app).post('/api/password-reset/reset').send({ token, newPassword });

// Everything sits in one describe so its afterAll (the cleanup) runs before
// the global afterAll in tests/setup.ts closes the database pool.
describe('password reset', () => {
  const clean = () =>
    getDbClient().query('DELETE FROM password_reset_tokens WHERE user_id = ANY($1::uuid[])', [[USER_ID, DISABLED_ID]]);

  beforeAll(clean);
  afterAll(clean);

  beforeEach(() => {
    findUserByEmail.mockReset().mockImplementation(async (email: string) => {
      if (email.toLowerCase() === 'olga@example.com') return { id: USER_ID, email: 'olga@example.com', enabled: true };
      if (email === 'disabled@example.com') return { id: DISABLED_ID, email, enabled: false };
      return null;
    });
    setUserPassword.mockReset().mockResolvedValue(undefined);
    logoutUser.mockReset().mockResolvedValue(undefined);
    mockSendResetEmail.mockReset().mockResolvedValue(undefined);
  });

  it('answers the same for unknown and disabled addresses, and sends nothing', async () => {
    for (const email of ['nobody@example.com', 'disabled@example.com']) {
      const res = await request(app).post('/api/password-reset/request').send({ email });
      expect(res.status).toBe(200);
      expect(res.body.message).toBe(LINK_SENT);
    }
    await new Promise((r) => setTimeout(r, 200));
    expect(mockSendResetEmail).not.toHaveBeenCalled();
    const { rows } = await getDbClient().query('SELECT 1 FROM password_reset_tokens WHERE user_id = $1', [DISABLED_ID]);
    expect(rows).toHaveLength(0);
  });

  it('mails a link and stores only a hash of its token', async () => {
    const token = await requestLink();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    const { rows } = await getDbClient().query('SELECT token_hash, expires_at FROM password_reset_tokens WHERE user_id = $1', [
      USER_ID,
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].token_hash).not.toBe(token);
    const minutesLeft = (new Date(rows[0].expires_at).getTime() - Date.now()) / 60000;
    expect(minutesLeft).toBeGreaterThan(58);
    expect(minutesLeft).toBeLessThanOrEqual(60);
  });

  it('sets the new password in Keycloak, signs the user out, and works only once', async () => {
    const token = await requestLink();
    const res = await reset(token);
    expect(res.status).toBe(200);
    expect(setUserPassword).toHaveBeenCalledWith(USER_ID, 'N3w-Passw0rd!');
    expect(logoutUser).toHaveBeenCalledWith(USER_ID);

    const again = await reset(token);
    expect(again.status).toBe(400);
    expect(again.body.message).toBe('Invalid or expired token.');
    expect(setUserPassword).toHaveBeenCalledTimes(1);
  });

  it('keeps the link usable when Keycloak rejects the password', async () => {
    const token = await requestLink();
    setUserPassword.mockRejectedValueOnce(new PasswordRejectedError('Invalid password: minimum length 12.'));
    const rejected = await reset(token, 'short');
    expect(rejected.status).toBe(400);
    expect(rejected.body).toMatchObject({ code: 'PASSWORD_REJECTED', message: 'Invalid password: minimum length 12.' });

    expect((await reset(token, 'a-much-longer-passphrase')).status).toBe(200);
  });

  it('refuses an expired link', async () => {
    const token = await requestLink();
    await getDbClient().query(`UPDATE password_reset_tokens SET expires_at = NOW() - INTERVAL '1 second' WHERE user_id = $1`, [
      USER_ID,
    ]);
    const res = await reset(token);
    expect(res.status).toBe(400);
    expect(setUserPassword).not.toHaveBeenCalled();
  });

  it('a new request replaces the previous link', async () => {
    const first = await requestLink();
    const second = await requestLink();
    expect((await reset(first)).status).toBe(400);
    expect((await reset(second)).status).toBe(200);
  });

  it('still reports success when ending the old sessions fails', async () => {
    const token = await requestLink();
    logoutUser.mockRejectedValueOnce(new Error('keycloak hiccup'));
    expect((await reset(token)).status).toBe(200);
  });

  it('validates input', async () => {
    expect((await request(app).post('/api/password-reset/request').send({})).status).toBe(400);
    expect((await request(app).post('/api/password-reset/reset').send({ token: 'x' })).status).toBe(400);
    expect((await request(app).post('/api/password-reset/reset').send({ newPassword: 'x' })).status).toBe(400);
  });

  it('gives the same answer when Keycloak cannot be asked (no hint that the account exists)', async () => {
    findUserByEmail.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));
    const res = await request(app).post('/api/password-reset/request').send({ email: 'olga@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe(LINK_SENT);
  });

  it('lets only one of two simultaneous resets use the link', async () => {
    const token = await requestLink();
    const results = await Promise.all([reset(token, 'First-passw0rd!'), reset(token, 'Second-passw0rd!')]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    expect(setUserPassword).toHaveBeenCalledTimes(1);
  });
});
