/**
 * Registration is public: it must never let the caller pick privileges.
 * (It once accepted `role: "admin"` and assigned that Keycloak realm role.)
 */

process.env.KEYCLOAK_ADMIN_CLIENT_SECRET ??= 'test-secret';

// The Keycloak admin client is ESM-only, which Jest can't load.
jest.mock('@keycloak/keycloak-admin-client', () => ({ __esModule: true, default: class {} }));

import express from 'express';
import request from 'supertest';
import authRoutes from '../../src/routes/auth/auth.routes';
import { KeycloakService } from '../../src/services/keycloak.service';

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

const registerUser = jest
  .spyOn(KeycloakService.prototype, 'registerUser')
  .mockResolvedValue({ message: 'User registered successfully', userId: 'u1' });

const newUser = { username: 'olga', email: 'olga@example.com', password: 'Sup3r@secret' };

beforeEach(() => {
  registerUser.mockClear();
});

it.each(['admin', 'user', 'manager'])('refuses a self-chosen role (%s)', async (role) => {
  const res = await request(app).post('/api/auth/register').send({ ...newUser, role });
  expect(res.status).toBe(400);
  expect(registerUser).not.toHaveBeenCalled();
});

it('registers without any role', async () => {
  const res = await request(app).post('/api/auth/register').send(newUser);
  expect(res.status).toBe(201);
  expect(registerUser).toHaveBeenCalledWith(expect.not.objectContaining({ role: expect.anything() }));
});
