/**
 * The owner hears about every new token — a token added by someone with a
 * stolen password or session must not go unnoticed.
 */

process.env.KEYCLOAK_ADMIN_CLIENT_SECRET ??= 'test-secret';
process.env.FRONTEND_URL = 'https://tyme.example.com';

// The Keycloak admin client is ESM-only, which Jest can't load.
jest.mock('@keycloak/keycloak-admin-client', () => ({ __esModule: true, default: class {} }));

import { notifyTokenCreated } from '../../src/services/auth/api-token.service';
import type { ApiToken } from '../../src/models/auth/api-token.model';

const token = {
  id: 't1',
  name: 'Claude Code',
  permissions: { resources: { clients: 'read', time_entries: 'write' }, capabilities: ['mcp'] },
  expires_at: null,
} as unknown as ApiToken;

it('tells the owner what was created, from where, and how to revoke it', async () => {
  const sendNotificationEmail = jest.fn().mockResolvedValue(undefined);
  await notifyTokenCreated('olga@example.com', token, { ip: '::ffff:203.0.113.5', userAgent: 'Firefox' }, { sendNotificationEmail });

  const [to, subject, text] = sendNotificationEmail.mock.calls[0];
  expect(to).toBe('olga@example.com');
  expect(subject).toContain('"Claude Code"');
  expect(text).toContain('clients: read, time_entries: write, mcp');
  expect(text).toContain('Expires: never');
  expect(text).toContain('203.0.113.5 (Firefox)');
  expect(text).toContain('https://tyme.example.com/config/api-tokens');
});

it('never fails the request when mail is down', async () => {
  const sendNotificationEmail = jest.fn().mockRejectedValue(new Error('smtp down'));
  await expect(notifyTokenCreated('olga@example.com', token, {}, { sendNotificationEmail })).resolves.toBeUndefined();
});
