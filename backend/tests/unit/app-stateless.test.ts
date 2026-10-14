/**
 * Authentication is stateless (bearer tokens): the app must not hand out
 * session cookies. A session middleware used to create and keep a new
 * in-memory session for every cookie-less request — every API token call.
 */

process.env.KEYCLOAK_ADMIN_CLIENT_SECRET ??= 'test-secret';

// The Keycloak admin client is ESM-only, which Jest can't load.
jest.mock('@keycloak/keycloak-admin-client', () => ({ __esModule: true, default: class {} }));
// jsdom (used by the request sanitizer) is ESM-only too; sanitizing isn't under test here.
jest.mock('jsdom', () => ({ JSDOM: class { window = {}; } }));
jest.mock('dompurify', () => ({ __esModule: true, default: () => ({ sanitize: (value: string) => value }) }));

import request from 'supertest';
import { app } from '../../src/app';

it('sets no session cookie', async () => {
  for (const path of ['/api/health', '/api/clients']) {
    const res = await request(app).get(path);
    expect(res.headers['set-cookie']).toBeUndefined();
  }
});
