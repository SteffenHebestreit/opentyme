/**
 * Cross-tenant isolation of every by-id business/financial endpoint.
 *
 * Registration is open, so any signed-in user can send any id they like. Every
 * row belongs to exactly one user; another user must get 404 (never 403, never
 * the data) on read, update and delete — and must not be able to point their
 * own rows at someone else's client, project, invoice, time entry or tax rate.
 *
 * Exercises the real routers → controllers → services against the test DB.
 * The Keycloak middleware is replaced by one that takes the caller from the
 * `x-test-user` header, so a single app can act as either user.
 */

process.env.NODE_ENV = 'test';

const OWNER_ID = '123e4567-e89b-12d3-a456-426614174000';
// A second, fixed tenant. Cleaned before and after this suite.
const OTHER_ID = '223e4567-e89b-42d3-a456-426614174999';

jest.mock('../../src/middleware/auth/keycloak.middleware', () => ({
  authenticateKeycloak: (req: any, _res: any, next: any) => {
    req.user = { id: req.headers['x-test-user'] || '123e4567-e89b-12d3-a456-426614174000' };
    next();
  },
  extractKeycloakUser: (_req: any, _res: any, next: any) => next(),
  requireAdmin: (_req: any, _res: any, next: any) => next(),
}));

import express from 'express';
import request from 'supertest';
import dotenv from 'dotenv';
import path from 'path';

const envPath = process.env.DOCKER_ENV
  ? path.resolve(__dirname, '../../.env.test.docker')
  : path.resolve(__dirname, '../../.env.test');
dotenv.config({ path: envPath });

import clientRoutes from '../../src/routes/business/client.routes';
import projectRoutes from '../../src/routes/business/project.routes';
import timeEntryRoutes from '../../src/routes/business/time-entry.routes';
import expenseRoutes from '../../src/routes/business/expense.routes';
import invoiceRoutes from '../../src/routes/financial/invoice.routes';
import paymentRoutes from '../../src/routes/financial/payment.routes';
import taxPrepaymentRoutes from '../../src/routes/financial/tax-prepayment.routes';
import recurringInvoiceRoutes from '../../src/routes/financial/recurring-invoice.routes';
import taxRateRoutes from '../../src/routes/financial/tax-rate.routes';
import invoiceTextTemplateRoutes from '../../src/routes/financial/invoice-text-template.routes';
import depreciationRoutes from '../../src/routes/financial/depreciation.routes';
import emailTemplateRoutes from '../../src/routes/communication/email-template.routes';
import { getDbClient } from '../../src/utils/database';
import { InvoiceService } from '../../src/services/financial/invoice.service';
import { ProjectService } from '../../src/services/business/project.service';
import { TimeEntryService } from '../../src/services/business/time-entry.service';

const app = express();
app.use(express.json());
app.use('/api/clients', clientRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/time-entries', timeEntryRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/tax-prepayments', taxPrepaymentRoutes);
app.use('/api/recurring-invoices', recurringInvoiceRoutes);
app.use('/api/admin/tax-rates', taxRateRoutes);
app.use('/api/admin/invoice-templates', invoiceTextTemplateRoutes);
app.use('/api/depreciation', depreciationRoutes);
app.use('/api/email-templates', emailTemplateRoutes);

/** Request as the other tenant. */
const asOther = {
  get: (url: string) => request(app).get(url).set('x-test-user', OTHER_ID),
  post: (url: string, body: any = {}) => request(app).post(url).set('x-test-user', OTHER_ID).send(body),
  put: (url: string, body: any = {}) => request(app).put(url).set('x-test-user', OTHER_ID).send(body),
  patch: (url: string, body: any = {}) => request(app).patch(url).set('x-test-user', OTHER_ID).send(body),
  delete: (url: string) => request(app).delete(url).set('x-test-user', OTHER_ID),
};

/** Request as the owner of the seeded rows. */
const asOwner = {
  put: (url: string, body: any = {}) => request(app).put(url).set('x-test-user', OWNER_ID).send(body),
};

// Ids of the owner's rows, filled in beforeAll
const owner: Record<string, string> = {};
// Ids of the other tenant's own rows
const other: Record<string, string> = {};

/** Tables holding rows of either test user, children first. */
const CLEANUP_TABLES = [
  'payment_invoices',
  'invoice_items',
  'payments',
  'invoices',
  'recurring_invoices',
  'expense_depreciation_schedule',
  'expenses',
  'project_rate_history',
  'time_entries',
  'client_documents',
  'projects',
  'clients',
  'tax_prepayments',
  'tax_rates',
  'invoice_text_templates',
  'email_templates',
];

async function cleanUser(userId: string): Promise<void> {
  const db = getDbClient();
  for (const table of CLEANUP_TABLES) {
    try {
      if (table === 'payment_invoices') {
        await db.query(
          'DELETE FROM payment_invoices WHERE payment_id IN (SELECT id FROM payments WHERE user_id = $1)',
          [userId]
        );
      } else if (table === 'invoice_items') {
        await db.query(
          'DELETE FROM invoice_items WHERE invoice_id IN (SELECT id FROM invoices WHERE user_id = $1)',
          [userId]
        );
      } else {
        await db.query(`DELETE FROM ${table} WHERE user_id = $1`, [userId]);
      }
    } catch (error: any) {
      // A table missing from this schema version is fine to skip
      if (!/does not exist/.test(error.message)) throw error;
    }
  }
}

async function readOne(sql: string, params: any[]): Promise<any> {
  const result = await getDbClient().query(sql, params);
  return result.rows[0];
}

// Everything sits in one describe so its afterAll (the cleanup) runs before
// the global afterAll in tests/setup.ts closes the database pool.
describe('tenant isolation: a second user', () => {
  beforeAll(async () => {
    const db = getDbClient();

    // tax_prepayments.user_id references settings(user_id)
    for (const userId of [OWNER_ID, OTHER_ID]) {
      await db.query('INSERT INTO settings (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [userId]);
    }
    await cleanUser(OWNER_ID);
    await cleanUser(OTHER_ID);

    // ── the owner's data ──
    owner.client = (await readOne(
      `INSERT INTO clients (user_id, name, email) VALUES ($1, 'Owner Client', 'owner-client@example.com') RETURNING id`,
      [OWNER_ID]
    )).id;
    owner.project = (await readOne(
      `INSERT INTO projects (user_id, client_id, name, hourly_rate, rate_type, status)
       VALUES ($1, $2, 'Owner Secret Project', 120, 'hourly', 'active') RETURNING id`,
      [OWNER_ID, owner.client]
    )).id;
    owner.timeEntry = (await readOne(
      `INSERT INTO time_entries (user_id, project_id, description, entry_date, entry_time, entry_end_time, duration_hours, is_billable, hourly_rate)
       VALUES ($1, $2, 'Owner work', '2026-01-05', '09:00', '11:00', 2, true, 120) RETURNING id`,
      [OWNER_ID, owner.project]
    )).id;
    owner.taxRate = (await readOne(
      `INSERT INTO tax_rates (user_id, name, rate, is_default) VALUES ($1, 'Owner VAT', 19, true) RETURNING id`,
      [OWNER_ID]
    )).id;
    owner.template = (await readOne(
      `INSERT INTO invoice_text_templates (user_id, name, category, content)
       VALUES ($1, 'Owner header', 'header', 'Owner header text') RETURNING id`,
      [OWNER_ID]
    )).id;
    owner.emailTemplate = (await readOne(
      `INSERT INTO email_templates (user_id, name, subject) VALUES ($1, 'Owner mail', 'Owner subject') RETURNING id`,
      [OWNER_ID]
    )).id;
    owner.expense = (await readOne(
      `INSERT INTO expenses (user_id, project_id, category, description, amount, net_amount, tax_rate, tax_amount, expense_date)
       VALUES ($1, $2, 'software', 'Owner expense', 119, 100, 19, 19, '2026-01-10') RETURNING id`,
      [OWNER_ID, owner.project]
    )).id;
    owner.prepayment = (await readOne(
      `INSERT INTO tax_prepayments (user_id, tax_type, amount, payment_date, period_start, period_end, tax_year)
       VALUES ($1, 'vat', 500, '2026-01-10', '2026-01-01', '2026-03-31', 2026) RETURNING id`,
      [OWNER_ID]
    )).id;
    owner.recurring = (await readOne(
      `INSERT INTO recurring_invoices (user_id, client_id, title, frequency, start_date, line_items)
       VALUES ($1, $2, 'Owner retainer', 'monthly', '2026-01-01', '[{"description":"Retainer","quantity":1,"unit_price":100}]')
       RETURNING id`,
      [OWNER_ID, owner.client]
    )).id;

    const invoiceService = new InvoiceService();
    const invoice = await invoiceService.create({
      user_id: OWNER_ID,
      client_id: owner.client,
      project_id: owner.project,
      status: 'sent',
      issue_date: new Date('2026-01-31'),
      due_date: new Date('2026-02-28'),
      currency: 'EUR',
      notes: 'Owner notes',
    });
    owner.invoice = invoice.id;
    await invoiceService.addLineItems(invoice.id, OWNER_ID, [
      { description: 'Consulting', quantity: 2, unit_price: 120, total_price: 240, time_entry_id: owner.timeEntry } as any,
    ]);
    owner.payment = (await readOne(
      `INSERT INTO payments (user_id, client_id, invoice_id, amount, payment_type, payment_date)
       VALUES ($1, $2, $3, 50, 'payment', '2026-02-01') RETURNING id`,
      [OWNER_ID, owner.client, owner.invoice]
    )).id;

    // ── the other tenant's own data (to try pointing it at the owner's rows) ──
    other.client = (await readOne(
      `INSERT INTO clients (user_id, name) VALUES ($1, 'Other Client') RETURNING id`,
      [OTHER_ID]
    )).id;
    other.invoice = (await readOne(
      `INSERT INTO invoices (user_id, client_id, invoice_number, status, issue_date, due_date, currency)
       VALUES ($1, $2, 'OTHER-1', 'draft', '2026-01-31', '2026-02-28', 'EUR') RETURNING id`,
      [OTHER_ID, other.client]
    )).id;
    other.timeEntryProject = (await readOne(
      `INSERT INTO projects (user_id, client_id, name, status) VALUES ($1, $2, 'Other Project', 'active') RETURNING id`,
      [OTHER_ID, other.client]
    )).id;
    other.timeEntry = (await readOne(
      `INSERT INTO time_entries (user_id, project_id, description, entry_date, entry_time, duration_hours)
       VALUES ($1, $2, 'Other work', '2026-01-06', '09:00', 1) RETURNING id`,
      [OTHER_ID, other.timeEntryProject]
    )).id;
    other.payment = (await readOne(
      `INSERT INTO payments (user_id, client_id, invoice_id, amount, payment_type, payment_date)
       VALUES ($1, $2, $3, 10, 'payment', '2026-02-01') RETURNING id`,
      [OTHER_ID, other.client, other.invoice]
    )).id;
    other.taxRate = (await readOne(
      `INSERT INTO tax_rates (user_id, name, rate, is_default) VALUES ($1, 'Other VAT', 7, true) RETURNING id`,
      [OTHER_ID]
    )).id;
  }, 30000);

  afterAll(async () => {
    await cleanUser(OTHER_ID);
    await cleanUser(OWNER_ID);
    await getDbClient().query('DELETE FROM settings WHERE user_id = $1', [OTHER_ID]);
  });

  describe('invoices', () => {
    it('reads another user\'s invoice as 404', async () => {
      const res = await asOther.get(`/api/invoices/${owner.invoice}`);
      expect(res.status).toBe(404);
      expect(JSON.stringify(res.body)).not.toContain('Owner');
    });

    it('refuses to update, cancel, correct or delete another user\'s invoice', async () => {
      expect((await asOther.put(`/api/invoices/${owner.invoice}`, { notes: 'hijacked' })).status).toBe(404);
      expect((await asOther.patch(`/api/invoices/${owner.invoice}/cancel`)).status).toBe(404);
      expect((await asOther.post(`/api/invoices/${owner.invoice}/correct`, { correction_reason: 'x', notes: 'hijacked' })).status).toBe(404);
      expect((await asOther.delete(`/api/invoices/${owner.invoice}`)).status).toBe(404);

      const row = await readOne('SELECT notes, status, correction_reason FROM invoices WHERE id = $1', [owner.invoice]);
      expect(row).toEqual({ notes: 'Owner notes', status: 'sent', correction_reason: null });
    });

    it('refuses to add or replace line items on another user\'s invoice', async () => {
      const items = [{ description: 'Injected', quantity: 1, unit_price: 9999, total_price: 9999 }];
      expect((await asOther.post(`/api/invoices/${owner.invoice}/items`, { items })).status).toBe(404);
      expect((await asOther.put(`/api/invoices/${owner.invoice}/items`, { items })).status).toBe(404);

      const rows = (await getDbClient().query('SELECT description FROM invoice_items WHERE invoice_id = $1', [owner.invoice])).rows;
      expect(rows.map((r: any) => r.description)).toEqual(['Consulting']);
    });

    it('hides billing status, payments and PDFs of another user\'s invoice', async () => {
      expect((await asOther.get(`/api/invoices/${owner.invoice}/billing-status`)).status).toBe(404);
      expect((await asOther.post(`/api/invoices/${owner.invoice}/validate-payment`, { amount: 10 })).status).toBe(404);
      expect((await asOther.get(`/api/invoices/${owner.invoice}/payments`)).status).toBe(404);
      expect((await asOther.get(`/api/payments/invoice/${owner.invoice}`)).status).toBe(404);
      expect((await asOther.get(`/api/invoices/${owner.invoice}/pdf`)).status).toBe(404);
      expect((await asOther.get(`/api/invoices/${owner.invoice}/storno-pdf`)).status).toBe(404);
      expect((await asOther.get(`/api/invoices/${owner.invoice}/correction-pdf`)).status).toBe(404);
      expect((await asOther.get(`/api/invoices/client/${owner.client}/history`)).status).toBe(404);
    });

    it('rejects an invoice filed against another user\'s client, project, tax rate or template', async () => {
      const base = { issue_date: '2026-03-01', due_date: '2026-03-31', currency: 'EUR' };
      const attempts = [
        { body: { ...base, client_id: owner.client }, field: 'client_id' },
        { body: { ...base, client_id: other.client, project_id: owner.project }, field: 'project_id' },
        { body: { ...base, client_id: other.client, tax_rate_id: owner.taxRate }, field: 'tax_rate_id' },
        { body: { ...base, client_id: other.client, header_template_id: owner.template }, field: 'header_template_id' },
      ];
      for (const attempt of attempts) {
        const res = await asOther.post('/api/invoices', attempt.body);
        expect(res.status).toBe(400);
        expect(res.body).toMatchObject({ code: 'INVALID_REFERENCE', field: attempt.field });
      }

      const count = await readOne('SELECT count(*)::int AS n FROM invoices WHERE user_id = $1', [OTHER_ID]);
      expect(count.n).toBe(1);
    });

    it('rejects moving an own invoice onto another user\'s client', async () => {
      const res = await asOther.put(`/api/invoices/${other.invoice}`, { client_id: owner.client });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_REFERENCE');
      const row = await readOne('SELECT client_id FROM invoices WHERE id = $1', [other.invoice]);
      expect(row.client_id).toBe(other.client);
    });

    it('rejects line items that link another user\'s time entry', async () => {
      const res = await asOther.post(`/api/invoices/${other.invoice}/items`, {
        items: [{ description: 'Linked', quantity: 1, unit_price: 1, total_price: 1, time_entry_id: owner.timeEntry }],
      });
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ code: 'INVALID_REFERENCE', field: 'time_entry_id' });
    });

    it('does not create a draft when generating from another user\'s client', async () => {
      const res = await asOther.post('/api/invoices/generate-from-time-entries', { client_id: owner.client });
      expect(res.status).toBe(404);
      const count = await readOne('SELECT count(*)::int AS n FROM invoices WHERE user_id = $1', [OTHER_ID]);
      expect(count.n).toBe(1);
    });
  });

  describe('projects', () => {
    it('reads, updates and deletes another user\'s project as 404', async () => {
      const read = await asOther.get(`/api/projects/${owner.project}`);
      expect(read.status).toBe(404);
      expect(JSON.stringify(read.body)).not.toContain('Owner');

      expect((await asOther.put(`/api/projects/${owner.project}`, { name: 'Hijacked' })).status).toBe(404);
      expect((await asOther.delete(`/api/projects/${owner.project}`)).status).toBe(404);

      const row = await readOne('SELECT name FROM projects WHERE id = $1', [owner.project]);
      expect(row.name).toBe('Owner Secret Project');
    });

    it('hides the rate timeline of another user\'s project', async () => {
      expect((await asOther.get(`/api/projects/${owner.project}/rates`)).status).toBe(404);
      expect((await asOther.get(`/api/projects/${owner.project}/rates/effective`)).status).toBe(404);
      expect((await asOther.get(`/api/projects/${owner.project}/rates/impact?valid_from=2026-02-01`)).status).toBe(404);
      expect(
        (await asOther.post(`/api/projects/${owner.project}/rates`, { hourly_rate: 1, valid_from: '2026-02-01' })).status
      ).toBe(404);
    });

    it('rejects a project for another user\'s client', async () => {
      const res = await asOther.post('/api/projects', { name: 'Leech', client_id: owner.client });
      expect(res.status).toBe(400);
      const count = await readOne(
        'SELECT count(*)::int AS n FROM projects WHERE user_id = $1 AND client_id = $2',
        [OTHER_ID, owner.client]
      );
      expect(count.n).toBe(0);
    });

    it('rejects moving an own project onto another user\'s client', async () => {
      const res = await asOther.put(`/api/projects/${other.timeEntryProject}`, { client_id: owner.client });
      expect(res.status).toBe(400);
    });

    it('scopes the service methods themselves', async () => {
      const service = new ProjectService();
      expect(await service.findById(owner.project, OTHER_ID)).toBeNull();
      expect(await service.update(owner.project, OTHER_ID, { name: 'x' })).toBeNull();
      expect(await service.delete(owner.project, OTHER_ID)).toBe(false);
      expect(await service.findById(owner.project, OWNER_ID)).not.toBeNull();
    });
  });

  describe('time entries', () => {
    it('reads, updates and deletes another user\'s entry as 404', async () => {
      expect((await asOther.get(`/api/time-entries/${owner.timeEntry}`)).status).toBe(404);
      expect((await asOther.put(`/api/time-entries/${owner.timeEntry}`, { description: 'hijacked' })).status).toBe(404);
      expect((await asOther.delete(`/api/time-entries/${owner.timeEntry}`)).status).toBe(404);

      const row = await readOne('SELECT description FROM time_entries WHERE id = $1', [owner.timeEntry]);
      expect(row.description).toBe('Owner work');
    });

    it('rejects logging time or starting a timer on another user\'s project', async () => {
      const create = await asOther.post('/api/time-entries', {
        project_id: owner.project,
        entry_date: '2026-01-07',
        entry_time: '09:00',
        duration_hours: 1,
      });
      expect(create.status).toBe(400);

      const timer = await asOther.post('/api/time-entries/start', { project_id: owner.project });
      expect(timer.status).toBe(400);

      const count = await readOne('SELECT count(*)::int AS n FROM time_entries WHERE user_id = $1', [OTHER_ID]);
      expect(count.n).toBe(1);
    });

    it('rejects moving an own entry onto another user\'s project', async () => {
      const res = await asOther.put(`/api/time-entries/${other.timeEntry}`, { project_id: owner.project });
      expect(res.status).toBe(400);
      const row = await readOne('SELECT project_id FROM time_entries WHERE id = $1', [other.timeEntry]);
      expect(row.project_id).toBe(other.timeEntryProject);
    });

    it('never hands an entry to another user via user_id in the body', async () => {
      const res = await asOwner.put(`/api/time-entries/${owner.timeEntry}`, { user_id: OTHER_ID, description: 'Owner work' });
      expect(res.status).toBe(200);
      const row = await readOne('SELECT user_id FROM time_entries WHERE id = $1', [owner.timeEntry]);
      expect(row.user_id).toBe(OWNER_ID);
    });

    it('scopes the service methods themselves', async () => {
      const service = new TimeEntryService();
      expect(await service.findById(owner.timeEntry, OTHER_ID)).toBeNull();
      expect(await service.update(owner.timeEntry, OTHER_ID, { description: 'x' })).toBeNull();
      expect(await service.delete(owner.timeEntry, OTHER_ID)).toBe(false);
    });
  });

  describe('payments', () => {
    it('reads, updates and deletes another user\'s payment as 404', async () => {
      expect((await asOther.get(`/api/payments/${owner.payment}`)).status).toBe(404);
      expect(
        (await asOther.put(`/api/payments/${owner.payment}`, { client_id: other.client, amount: 1 })).status
      ).toBe(404);
      expect((await asOther.delete(`/api/payments/${owner.payment}`)).status).toBe(404);

      const row = await readOne('SELECT amount FROM payments WHERE id = $1', [owner.payment]);
      expect(Number(row.amount)).toBe(50);
    });

    it('rejects a payment for another user\'s client or invoice', async () => {
      const forClient = await asOther.post('/api/payments', {
        client_id: owner.client,
        project_id: owner.project,
        amount: 10,
        payment_type: 'payment',
      });
      expect(forClient.status).toBe(404);

      const forInvoice = await asOther.post('/api/payments', {
        client_id: other.client,
        invoice_ids: [owner.invoice],
        amount: 10,
        payment_type: 'payment',
      });
      expect(forInvoice.status).toBe(404);
    });

    it('refuses to link an own payment to another user\'s invoice (and never re-statuses it)', async () => {
      const before = await readOne('SELECT status FROM invoices WHERE id = $1', [owner.invoice]);
      const res = await asOther.put(`/api/payments/${other.payment}`, {
        client_id: other.client,
        amount: 10000,
        invoice_ids: [owner.invoice],
      });
      expect(res.status).toBe(404);

      const after = await readOne('SELECT status FROM invoices WHERE id = $1', [owner.invoice]);
      expect(after.status).toBe(before.status);
      const links = await readOne(
        'SELECT count(*)::int AS n FROM payment_invoices WHERE invoice_id = $1',
        [owner.invoice]
      );
      expect(links.n).toBe(0);
    });
  });

  describe('expenses', () => {
    it('reads, updates and deletes another user\'s expense as 404', async () => {
      const read = await asOther.get(`/api/expenses/${owner.expense}`);
      expect(read.status).toBe(404);
      expect((await asOther.put(`/api/expenses/${owner.expense}`, { description: 'hijacked' })).status).toBe(404);
      expect((await asOther.delete(`/api/expenses/${owner.expense}`)).status).toBe(404);
      expect((await asOther.patch(`/api/expenses/${owner.expense}/approve`, { status: 'approved' })).status).toBe(404);
      expect((await asOther.patch(`/api/expenses/${owner.expense}/reimburse`, { status: 'reimbursed' })).status).toBe(404);
      expect((await asOther.get(`/api/expenses/${owner.expense}/generated`)).status).toBe(404);
      expect((await asOther.get(`/api/expenses/${owner.expense}/receipt/download`)).status).toBe(404);
      expect((await asOther.delete(`/api/expenses/${owner.expense}/receipt`)).status).toBe(404);
      expect((await asOther.get(`/api/expenses/${owner.expense}/depreciation-schedule`)).status).toBe(404);
      expect((await asOther.get(`/api/depreciation/asset/${owner.expense}`)).status).toBe(404);

      const row = await readOne('SELECT description, status FROM expenses WHERE id = $1', [owner.expense]);
      expect(row.description).toBe('Owner expense');
    });

    it('rejects booking an expense on another user\'s project', async () => {
      const res = await asOther.post('/api/expenses', {
        project_id: owner.project,
        category: 'software',
        description: 'Leech',
        amount: 10,
        net_amount: 10,
        expense_date: '2026-01-15',
      });
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ code: 'INVALID_REFERENCE', field: 'project_id' });
    });
  });

  describe('tax prepayments', () => {
    it('reads, updates and deletes another user\'s prepayment as 404', async () => {
      expect((await asOther.get(`/api/tax-prepayments/${owner.prepayment}`)).status).toBe(404);
      expect((await asOther.put(`/api/tax-prepayments/${owner.prepayment}`, { amount: 1 })).status).toBe(404);
      expect((await asOther.delete(`/api/tax-prepayments/${owner.prepayment}`)).status).toBe(404);
      expect((await asOther.get(`/api/tax-prepayments/${owner.prepayment}/receipt/download`)).status).toBe(404);

      const row = await readOne('SELECT amount FROM tax_prepayments WHERE id = $1', [owner.prepayment]);
      expect(Number(row.amount)).toBe(500);
    });
  });

  describe('recurring invoices', () => {
    it('reads, updates, deletes and generates another user\'s schedule as 404', async () => {
      expect((await asOther.get(`/api/recurring-invoices/${owner.recurring}`)).status).toBe(404);
      expect((await asOther.put(`/api/recurring-invoices/${owner.recurring}`, { title: 'hijacked' })).status).toBe(404);
      expect((await asOther.post(`/api/recurring-invoices/${owner.recurring}/generate`)).status).toBe(404);
      expect((await asOther.delete(`/api/recurring-invoices/${owner.recurring}`)).status).toBe(404);

      const row = await readOne('SELECT title FROM recurring_invoices WHERE id = $1', [owner.recurring]);
      expect(row.title).toBe('Owner retainer');
    });

    it('rejects a schedule for another user\'s client', async () => {
      const res = await asOther.post('/api/recurring-invoices', {
        client_id: owner.client,
        title: 'Leech',
        frequency: 'monthly',
        start_date: '2026-01-01',
        line_items: [{ description: 'x', quantity: 1, unit_price: 1 }],
      });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_REFERENCE');
    });
  });

  describe('tax rates, text templates and email templates', () => {
    it('handles another user\'s tax rate as 404 without touching the caller\'s own default', async () => {
      expect((await asOther.get(`/api/admin/tax-rates/${owner.taxRate}`)).status).toBe(404);
      expect((await asOther.put(`/api/admin/tax-rates/${owner.taxRate}`, { name: 'hijacked' })).status).toBe(404);
      expect((await asOther.patch(`/api/admin/tax-rates/${owner.taxRate}/set-default`)).status).toBe(404);
      expect((await asOther.delete(`/api/admin/tax-rates/${owner.taxRate}`)).status).toBe(404);

      const ownerRate = await readOne('SELECT name, is_default FROM tax_rates WHERE id = $1', [owner.taxRate]);
      expect(ownerRate).toEqual({ name: 'Owner VAT', is_default: true });
      const otherRate = await readOne('SELECT is_default FROM tax_rates WHERE id = $1', [other.taxRate]);
      expect(otherRate.is_default).toBe(true);
    });

    it('handles another user\'s invoice text template as 404', async () => {
      expect((await asOther.get(`/api/admin/invoice-templates/${owner.template}`)).status).toBe(404);
      expect((await asOther.put(`/api/admin/invoice-templates/${owner.template}`, { name: 'hijacked' })).status).toBe(404);
      expect((await asOther.delete(`/api/admin/invoice-templates/${owner.template}`)).status).toBe(404);
    });

    it('handles another user\'s email template as 404', async () => {
      expect((await asOther.get(`/api/email-templates/${owner.emailTemplate}`)).status).toBe(404);
      expect((await asOther.put(`/api/email-templates/${owner.emailTemplate}`, { name: 'hijacked' })).status).toBe(404);
      expect((await asOther.post(`/api/email-templates/${owner.emailTemplate}/preview`, {})).status).toBe(404);
      expect((await asOther.delete(`/api/email-templates/${owner.emailTemplate}`)).status).toBe(404);
    });
  });

  describe('clients', () => {
    it('reads, updates and deletes another user\'s client as 404', async () => {
      expect((await asOther.get(`/api/clients/${owner.client}`)).status).toBe(404);
      expect((await asOther.put(`/api/clients/${owner.client}`, { name: 'hijacked' })).status).toBe(404);
      expect((await asOther.delete(`/api/clients/${owner.client}`)).status).toBe(404);
      expect((await asOther.get(`/api/clients/${owner.client}/documents`)).status).toBe(404);
    });
  });

  describe('owner still has full access', () => {
    it('reads its own invoice with client, project and items', async () => {
      const res = await request(app).get(`/api/invoices/${owner.invoice}`).set('x-test-user', OWNER_ID);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ client_name: 'Owner Client', project_name: 'Owner Secret Project' });
      expect(res.body.items).toHaveLength(1);
      expect(res.body.payments).toHaveLength(1);
    });

    it('reads its own project, entry and expense', async () => {
      const asOwnerGet = (url: string) => request(app).get(url).set('x-test-user', OWNER_ID);
      expect((await asOwnerGet(`/api/projects/${owner.project}`)).status).toBe(200);
      expect((await asOwnerGet(`/api/time-entries/${owner.timeEntry}`)).status).toBe(200);
      expect((await asOwnerGet(`/api/expenses/${owner.expense}`)).status).toBe(200);
      expect((await asOwnerGet(`/api/projects/${owner.project}/rates`)).status).toBe(200);
    });
  });
});
