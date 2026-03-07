/**
 * Integration tests for /api/email-templates routes
 *
 * Uses supertest against a minimal Express app with mocked Keycloak auth.
 * Exercises the full HTTP layer (controller → service → real test DB).
 */

process.env.NODE_ENV = 'test';

// Must be hoisted before route import — replaces real Keycloak middleware
jest.mock('../../src/middleware/auth/keycloak.middleware', () => ({
  authenticateKeycloak: (req: any, _res: any, next: any) => {
    req.user = { id: '123e4567-e89b-12d3-a456-426614174000' };
    next();
  },
  extractKeycloakUser: (_req: any, _res: any, next: any) => next(),
}));

import express from 'express';
import request from 'supertest';
import dotenv from 'dotenv';
import path from 'path';

// Load test env (same logic as backend/tests/setup.ts)
const envPath = process.env.DOCKER_ENV
  ? path.resolve(__dirname, '../../.env.test.docker')
  : path.resolve(__dirname, '../../.env.test');
dotenv.config({ path: envPath });

import emailTemplateRoutes from '../../src/routes/communication/email-template.routes';
import { getDbClient } from '../../src/utils/database';

const TEST_USER_ID = '123e4567-e89b-12d3-a456-426614174000';

// Build minimal test app
const app = express();
app.use(express.json());
app.use('/api/email-templates', emailTemplateRoutes);

// ───────────── MJML fixtures ─────────────

const MINIMAL_MJML = `<mjml>
  <mj-body>
    <mj-section>
      <mj-column>
        <mj-text>Test</mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;

const VAR_MJML = `<mjml>
  <mj-body>
    <mj-section>
      <mj-column>
        <mj-text>Dear {{client.name}}, invoice {{invoice.number}} is ready.</mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;

// ───────────── DB setup / teardown ─────────────

beforeAll(async () => {
  const db = getDbClient();
  await db.query(
    `INSERT INTO settings (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
    [TEST_USER_ID]
  );
  await db.query(`DELETE FROM email_templates WHERE user_id = $1`, [TEST_USER_ID]);
}, 30000);

afterAll(async () => {
  const db = getDbClient();
  await db.query(`DELETE FROM email_templates WHERE user_id = $1`, [TEST_USER_ID]);
  // closeDbConnection is handled by the global setup.ts afterAll
});

// ───────────── Tests ─────────────

describe('GET /api/email-templates', () => {
  it('returns 200 with empty templates array when none exist', async () => {
    const res = await request(app).get('/api/email-templates');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('templates');
    expect(Array.isArray(res.body.templates)).toBe(true);
  });
});

describe('POST /api/email-templates', () => {
  it('creates a template and returns 201 with the new template', async () => {
    const payload = {
      name: 'Integration Test Template',
      subject: 'Hello {{client.name}}',
      mjml_content: MINIMAL_MJML,
      category: 'invoice',
      language: 'en',
    };

    const res = await request(app).post('/api/email-templates').send(payload);

    expect(res.status).toBe(201);
    expect(res.body.template.id).toBeDefined();
    expect(res.body.template.name).toBe('Integration Test Template');
    expect(res.body.template.subject).toBe('Hello {{client.name}}');
    expect(res.body.template.category).toBe('invoice');
    expect(res.body.template.language).toBe('en');
    expect(res.body.template.html_content).toContain('<html');
    expect(res.body.template.user_id).toBe(TEST_USER_ID);
  });

  it('uses default category and language when omitted', async () => {
    const res = await request(app).post('/api/email-templates').send({
      name: 'Defaults Template',
      subject: 'Hello',
      mjml_content: MINIMAL_MJML,
    });

    expect(res.status).toBe(201);
    expect(res.body.template.category).toBe('custom');
    expect(res.body.template.language).toBe('de');
  });
});

describe('GET /api/email-templates/:id', () => {
  let createdId: string;

  beforeAll(async () => {
    const res = await request(app).post('/api/email-templates').send({
      name: 'Get By ID',
      subject: 'Subject',
      mjml_content: MINIMAL_MJML,
    });
    createdId = res.body.template.id;
  });

  it('returns the template by id', async () => {
    const res = await request(app).get(`/api/email-templates/${createdId}`);

    expect(res.status).toBe(200);
    expect(res.body.template.id).toBe(createdId);
    expect(res.body.template.name).toBe('Get By ID');
  });

  it('returns 404 for a non-existent id', async () => {
    const res = await request(app).get(
      '/api/email-templates/00000000-0000-0000-0000-000000000000'
    );
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });
});

describe('PUT /api/email-templates/:id', () => {
  let createdId: string;

  beforeAll(async () => {
    const res = await request(app).post('/api/email-templates').send({
      name: 'Before Update',
      subject: 'Original Subject',
      mjml_content: MINIMAL_MJML,
    });
    createdId = res.body.template.id;
  });

  it('updates template fields and returns the updated template', async () => {
    const res = await request(app).put(`/api/email-templates/${createdId}`).send({
      name: 'After Update',
      mjml_content: VAR_MJML,
    });

    expect(res.status).toBe(200);
    expect(res.body.template.name).toBe('After Update');
    expect(res.body.template.subject).toBe('Original Subject'); // unchanged
    expect(res.body.template.variables).toContain('client.name');
    expect(res.body.template.variables).toContain('invoice.number');
  });

  it('returns 404 when template does not exist', async () => {
    const res = await request(app)
      .put('/api/email-templates/00000000-0000-0000-0000-000000000000')
      .send({ name: 'Ghost' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/email-templates/:id', () => {
  let createdId: string;

  beforeAll(async () => {
    const res = await request(app).post('/api/email-templates').send({
      name: 'Delete Me',
      subject: 'Subject',
      mjml_content: MINIMAL_MJML,
    });
    createdId = res.body.template.id;
  });

  it('deletes the template and returns success', async () => {
    const delRes = await request(app).delete(`/api/email-templates/${createdId}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body.success).toBe(true);

    const getRes = await request(app).get(`/api/email-templates/${createdId}`);
    expect(getRes.status).toBe(404);
  });

  it('returns 404 when deleting a non-existent template', async () => {
    const res = await request(app).delete(
      '/api/email-templates/00000000-0000-0000-0000-000000000000'
    );
    expect(res.status).toBe(404);
  });
});

describe('POST /api/email-templates/:id/preview', () => {
  let createdId: string;

  beforeAll(async () => {
    const res = await request(app).post('/api/email-templates').send({
      name: 'Preview Me',
      subject: 'Invoice {{invoice.number}}',
      mjml_content: VAR_MJML,
    });
    createdId = res.body.template.id;
  });

  it('renders preview HTML with variables substituted', async () => {
    const res = await request(app)
      .post(`/api/email-templates/${createdId}/preview`)
      .send({
        variables: {
          'client.name': 'Acme Corp',
          'invoice.number': 'INV-2025-001',
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.html).toContain('Acme Corp');
    expect(res.body.html).toContain('INV-2025-001');
    expect(res.body.html).not.toContain('{{client.name}}');
    expect(res.body.html).not.toContain('{{invoice.number}}');
  });

  it('returns 404 for a non-existent template', async () => {
    const res = await request(app)
      .post('/api/email-templates/00000000-0000-0000-0000-000000000000/preview')
      .send({ variables: {} });
    expect(res.status).toBe(404);
  });
});
