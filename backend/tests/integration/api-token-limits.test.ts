/**
 * Per-token rate limit and the expiry reminder, against the test DB.
 */

process.env.NODE_ENV = 'test';
process.env.KEYCLOAK_ADMIN_CLIENT_SECRET ??= 'test-secret';
// Read when the rate-limit module loads.
process.env.API_TOKEN_RATE_LIMIT_MAX = '5';
process.env.FRONTEND_URL = 'https://tyme.example.com';

// The Keycloak admin client is ESM-only, which Jest can't load; the owner lookup is stubbed below.
jest.mock('@keycloak/keycloak-admin-client', () => ({
  __esModule: true,
  default: class {
    users = { findOne: jest.fn() };
    realms = { findOne: jest.fn() };
    auth = jest.fn();
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

import setupRoutes from '../../src/routes';
import { getDbClient } from '../../src/utils/database';
import { keycloakService } from '../../src/services/keycloak.service';
import { apiTokenService } from '../../src/services/auth/api-token.service';
import { ApiTokenExpirySchedulerService } from '../../src/services/auth/api-token-expiry-scheduler.service';

const OWNER = '123e4567-e89b-12d3-a456-426614174000';
const DAY = 24 * 3600 * 1000;

const app = express();
app.use(express.json());
setupRoutes(app);

const permissions = { resources: { clients: 'read' as const }, capabilities: [] };

// Everything sits in one describe so its afterAll (the cleanup) runs before
// the global afterAll in tests/setup.ts closes the database pool.
describe('API token limits and reminders', () => {
  const clean = () => getDbClient().query('DELETE FROM api_tokens WHERE user_id = $1', [OWNER]);
  beforeAll(async () => {
    await clean();
    jest.spyOn(keycloakService, 'findUserById').mockResolvedValue({ id: OWNER, enabled: true, email: 'olga@example.com', username: 'olga' });
  });
  afterAll(clean);

  it('limits each token on its own', async () => {
    const a = await apiTokenService.create(OWNER, { name: 'busy', permissions, expires_at: null });
    const b = await apiTokenService.create(OWNER, { name: 'calm', permissions, expires_at: null });
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      statuses.push((await request(app).get('/api/clients').set('Authorization', `Bearer ${a.secret}`)).status);
    }
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
    // Another token is unaffected.
    expect((await request(app).get('/api/clients').set('Authorization', `Bearer ${b.secret}`)).status).toBe(200);
  });

  it('reminds the owner once, a week ahead, of the tokens about to expire', async () => {
    await clean();
    const soon = await apiTokenService.create(OWNER, { name: 'expires soon', permissions, expires_at: new Date(Date.now() + 3 * DAY) });
    await apiTokenService.create(OWNER, { name: 'expires later', permissions, expires_at: new Date(Date.now() + 30 * DAY) });
    await apiTokenService.create(OWNER, { name: 'never expires', permissions, expires_at: null });

    const sendNotificationEmail = jest.fn().mockResolvedValue(undefined);
    const scheduler = new ApiTokenExpirySchedulerService({ sendNotificationEmail } as any);

    expect(await scheduler.sendReminders()).toEqual({ usersNotified: 1, tokensReported: 1 });
    expect(sendNotificationEmail).toHaveBeenCalledTimes(1);
    const [to, subject, text, html] = sendNotificationEmail.mock.calls[0];
    expect(to).toBe('olga@example.com');
    expect(subject).toContain('"expires soon"');
    expect(text).toContain('https://tyme.example.com/config/api-tokens');
    expect(text).not.toContain('expires later');
    expect(html).toContain('<strong>expires soon</strong>');

    // Once per expiry …
    expect(await scheduler.sendReminders()).toEqual({ usersNotified: 0, tokensReported: 0 });
    // … and again after regenerating with a new, again close expiry.
    await apiTokenService.regenerate(OWNER, soon.token.id, new Date(Date.now() + 2 * DAY));
    expect((await scheduler.sendReminders()).tokensReported).toBe(1);
  });

  it('tries again tomorrow when the mail could not be sent', async () => {
    await clean();
    await apiTokenService.create(OWNER, { name: 'retry me', permissions, expires_at: new Date(Date.now() + DAY) });
    const failing = new ApiTokenExpirySchedulerService({ sendNotificationEmail: jest.fn().mockRejectedValue(new Error('smtp down')) } as any);
    expect(await failing.sendReminders()).toEqual({ usersNotified: 0, tokensReported: 0 });
    const { rows } = await getDbClient().query(`SELECT expiry_reminded_at FROM api_tokens WHERE name = 'retry me'`);
    expect(rows[0].expiry_reminded_at).toBeNull();
  });
});
