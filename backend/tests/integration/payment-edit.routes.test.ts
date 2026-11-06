/**
 * Editing and deleting payments keeps invoice statuses right.
 *
 * A payment is split over its invoices by what is still open on each (oldest first);
 * moving it to other invoices, changing its amount or deleting it re-statuses every
 * invoice it was or is linked to. Runs the real router → controller against the test DB.
 */

process.env.NODE_ENV = 'test';

// A tenant of its own, so this suite never races the others over the shared test user
const USER_ID = '423e4567-e89b-42d3-a456-426614174042';

jest.mock('../../src/middleware/auth/keycloak.middleware', () => ({
  authenticateKeycloak: (req: any, _res: any, next: any) => {
    req.user = { id: '423e4567-e89b-42d3-a456-426614174042' };
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

import paymentRoutes from '../../src/routes/financial/payment.routes';
import { getDbClient } from '../../src/utils/database';

const app = express();
app.use(express.json());
app.use('/api/payments', paymentRoutes);

const FUTURE = '2099-12-31';
const PAST = '2026-01-31';

let clientId: string;
let otherClientId: string;
let projectId: string;
let seq = 0;

async function readOne(sql: string, params: any[]): Promise<any> {
  return (await getDbClient().query(sql, params)).rows[0];
}

async function cleanUp(): Promise<void> {
  const db = getDbClient();
  await db.query('DELETE FROM payment_invoices WHERE payment_id IN (SELECT id FROM payments WHERE user_id = $1)', [USER_ID]);
  await db.query('DELETE FROM payments WHERE user_id = $1', [USER_ID]);
  await db.query('DELETE FROM invoice_items WHERE invoice_id IN (SELECT id FROM invoices WHERE user_id = $1)', [USER_ID]);
  await db.query('DELETE FROM invoices WHERE user_id = $1', [USER_ID]);
  await db.query('DELETE FROM projects WHERE user_id = $1', [USER_ID]);
  await db.query('DELETE FROM clients WHERE user_id = $1', [USER_ID]);
}

async function invoice(total: number, opts: { issue?: string; due?: string; status?: string; client?: string } = {}): Promise<string> {
  seq += 1;
  return (await readOne(
    `INSERT INTO invoices (user_id, client_id, invoice_number, status, issue_date, due_date, sub_total, total_amount, currency)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $7, 'EUR') RETURNING id`,
    [USER_ID, opts.client ?? clientId, `PE-TEST-${seq}`, opts.status ?? 'sent', opts.issue ?? new Date(Date.UTC(2026, 0, seq)).toISOString().slice(0, 10), opts.due ?? FUTURE, total]
  )).id;
}

const status = async (invoiceId: string) => (await readOne('SELECT status FROM invoices WHERE id = $1', [invoiceId])).status;

async function links(paymentId: string): Promise<Record<string, number>> {
  const rows = (await getDbClient().query('SELECT invoice_id, amount FROM payment_invoices WHERE payment_id = $1', [paymentId])).rows;
  return Object.fromEntries(rows.map((r: any) => [r.invoice_id, Number(r.amount)]));
}

async function pay(amount: number, invoiceIds: string[], type = 'payment'): Promise<string> {
  const res = await request(app).post('/api/payments').send({
    client_id: clientId, invoice_ids: invoiceIds, amount, payment_type: type, payment_date: '2026-02-01',
  });
  expect(res.status).toBe(201);
  return res.body.payment.id;
}

describe('payments: edit and delete keep invoice statuses right', () => {
  beforeAll(async () => {
    await cleanUp();
    clientId = (await readOne(
      `INSERT INTO clients (user_id, name, email) VALUES ($1, 'Pay Client', 'pay-client@example.com') RETURNING id`, [USER_ID]
    )).id;
    otherClientId = (await readOne(
      `INSERT INTO clients (user_id, name, email) VALUES ($1, 'Other Client', 'other-client@example.com') RETURNING id`, [USER_ID]
    )).id;
    projectId = (await readOne(
      `INSERT INTO projects (user_id, client_id, name, hourly_rate, rate_type, status)
       VALUES ($1, $2, 'Pay Project', 100, 'hourly', 'active') RETURNING id`, [USER_ID, clientId]
    )).id;
  });

  afterAll(async () => {
    await cleanUp();
  });

  it('a partial payment leaves the invoice partially paid', async () => {
    const inv = await invoice(1000);
    const p = await pay(400, [inv]);
    expect(await status(inv)).toBe('partially_paid');
    expect(await links(p)).toEqual({ [inv]: 400 });
  });

  it('splits one payment over several invoices, oldest first', async () => {
    const older = await invoice(1000);
    const newer = await invoice(1000);
    const p = await pay(1500, [newer, older]);
    expect(await links(p)).toEqual({ [older]: 1000, [newer]: 500 });
    expect(await status(older)).toBe('paid');
    expect(await status(newer)).toBe('partially_paid');
  });

  it('moves a payment booked on the wrong invoice', async () => {
    const wrong = await invoice(18684.86);
    const right = await invoice(18032.22, { due: PAST });
    const p = await pay(18684.86, [wrong]);
    expect(await status(wrong)).toBe('paid');

    const res = await request(app).put(`/api/payments/${p}`).send({ invoice_ids: [right], amount: 18032.22 });
    expect(res.status).toBe(200);
    expect(await status(right)).toBe('paid');
    expect(await status(wrong)).toBe('sent');
    expect(await links(p)).toEqual({ [right]: 18032.22 });
    const row = await readOne('SELECT invoice_id, amount FROM payments WHERE id = $1', [p]);
    expect(row.invoice_id).toBe(right);
    expect(Number(row.amount)).toBe(18032.22);
  });

  it('re-statuses the invoice when only the amount changes', async () => {
    const inv = await invoice(500);
    const p = await pay(500, [inv]);
    expect(await status(inv)).toBe('paid');

    expect((await request(app).put(`/api/payments/${p}`).send({ amount: 200 })).status).toBe(200);
    expect(await status(inv)).toBe('partially_paid');
    expect(await links(p)).toEqual({ [inv]: 200 });
  });

  it('does not touch statuses when only notes change', async () => {
    const inv = await invoice(300);
    const p = await pay(300, [inv]);
    expect((await request(app).put(`/api/payments/${p}`).send({ notes: 'Bank ref 42' })).status).toBe(200);
    expect((await readOne('SELECT notes FROM payments WHERE id = $1', [p])).notes).toBe('Bank ref 42');
    expect(await links(p)).toEqual({ [inv]: 300 });
  });

  it('moves a legacy payment (invoice_id only, no junction rows) and re-statuses the old invoice', async () => {
    const old = await invoice(700, { due: PAST, status: 'paid' });
    const next = await invoice(700);
    const p = (await readOne(
      `INSERT INTO payments (user_id, client_id, invoice_id, amount, payment_type, payment_date)
       VALUES ($1, $2, $3, 700, 'payment', '2026-02-01') RETURNING id`, [USER_ID, clientId, old]
    )).id;

    expect((await request(app).put(`/api/payments/${p}`).send({ invoice_ids: [next] })).status).toBe(200);
    expect(await status(old)).toBe('overdue');
    expect(await status(next)).toBe('paid');
  });

  it('deleting a payment re-opens its invoice', async () => {
    const inv = await invoice(250);
    const p = await pay(250, [inv]);
    expect(await status(inv)).toBe('paid');

    expect((await request(app).delete(`/api/payments/${p}`)).status).toBe(200);
    expect(await status(inv)).toBe('sent');
    expect(await readOne('SELECT id FROM payments WHERE id = $1', [p])).toBeUndefined();
  });

  it('refuses invoices of another client, and a refund without an invoice', async () => {
    const inv = await invoice(100);
    const foreign = await invoice(100, { client: otherClientId });
    const p = await pay(100, [inv]);
    expect((await request(app).put(`/api/payments/${p}`).send({ invoice_ids: [foreign] })).status).toBe(400);
    expect(await status(foreign)).toBe('sent');
    expect(await links(p)).toEqual({ [inv]: 100 });

    const refund = await pay(50, [inv], 'refund');
    expect((await request(app).put(`/api/payments/${refund}`).send({ invoice_ids: [] })).status).toBe(400);
  });

  it('unlinks a project payment from all invoices', async () => {
    const inv = await invoice(900);
    const res = await request(app).post('/api/payments').send({
      client_id: clientId, invoice_ids: [inv], project_id: projectId, amount: 900, payment_date: '2026-02-01',
    });
    expect(res.status).toBe(201);
    const p = res.body.payment.id;
    expect(await status(inv)).toBe('paid');

    expect((await request(app).put(`/api/payments/${p}`).send({ invoice_ids: [] })).status).toBe(200);
    expect(await status(inv)).toBe('sent');
    expect(await links(p)).toEqual({});
    expect((await readOne('SELECT invoice_id FROM payments WHERE id = $1', [p])).invoice_id).toBeNull();
  });

  it('keeps a cancelled invoice cancelled', async () => {
    const inv = await invoice(400, { status: 'cancelled' });
    const p = (await readOne(
      `INSERT INTO payments (user_id, client_id, invoice_id, amount, payment_type, payment_date)
       VALUES ($1, $2, $3, 400, 'payment', '2026-02-01') RETURNING id`, [USER_ID, clientId, inv]
    )).id;
    expect((await request(app).delete(`/api/payments/${p}`)).status).toBe(200);
    expect(await status(inv)).toBe('cancelled');
  });

  it('rejects a non-positive amount', async () => {
    const inv = await invoice(100);
    const p = await pay(100, [inv]);
    expect((await request(app).put(`/api/payments/${p}`).send({ amount: 0 })).status).toBe(400);
    expect((await request(app).put(`/api/payments/${p}`).send({ amount: 'abc' })).status).toBe(400);
  });
});
