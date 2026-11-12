/**
 * The workflow actions against the real API: the server listens on a free
 * port, a run calls it over loopback with its own credential, and only what
 * leaves the process is replaced (Keycloak's user lookup, object storage, the
 * mail transport). This is what proves the actions' assumptions about the
 * routes they use — and that a run cannot reach what its flow was not
 * published with.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

process.env.KEYCLOAK_ADMIN_CLIENT_SECRET ??= 'test-secret';

// The Keycloak admin client is ESM-only, which Jest can't load.
jest.mock('@keycloak/keycloak-admin-client', () => ({ __esModule: true, default: class {} }));
// jsdom (used by the request sanitizer) is ESM-only too; sanitizing isn't under test here.
jest.mock('jsdom', () => ({ JSDOM: class { window = {}; } }));
jest.mock('dompurify', () => ({ __esModule: true, default: () => ({ sanitize: (value: string) => value }) }));

import { AddressInfo } from 'net';
import { Server } from 'http';
import { Readable } from 'stream';
import { app } from '../../src/app';
import { getDbClient } from '../../src/utils/database';
import { TEST_USER_ID } from '../setup';
import { apiTokenService } from '../../src/services/auth/api-token.service';
import { storageService } from '../../src/services/storage/storage.service';
import { emailService } from '../../src/services/external/email.service';
import { ProjectService } from '../../src/services/business/project.service';
import { TimeEntryService } from '../../src/services/business/time-entry.service';
import { ensureWorkflowSchema } from '../../src/services/workflow/workflow-schema';
import { WorkflowDefinitionService } from '../../src/services/workflow/workflow-definition.service';
import { WorkflowEngine } from '../../src/services/workflow/workflow-engine.service';
import { createWorkflowApi, WorkflowApiError } from '../../src/services/workflow/workflow-api';
import { getWorkflowTemplate } from '../../src/services/workflow/workflow-templates';
import type { WorkflowGraph, WorkflowRun } from '../../src/types/workflow.types';

const db = getDbClient();
const definitions = new WorkflowDefinitionService();
const engine = new WorkflowEngine({}, definitions);

let server: Server;
let clientId: string;
let projectId: string;
let templateId: string;
const stored = new Map<string, Buffer>();
const sent: any[] = [];

const openTask = (run: WorkflowRun, kind: string) => run.tasks.find((task) => task.status === 'open' && task.kind === kind)!;
const reload = async (run: WorkflowRun) => (await engine.getRun(run.id, TEST_USER_ID)) as WorkflowRun;
const stepOf = (run: WorkflowRun, nodeId: string) => [...run.steps].reverse().find((step) => step.node_id === nodeId);

beforeAll(async () => {
  await ensureWorkflowSchema(db);
  await db.query(`DELETE FROM workflow_definitions WHERE user_id = $1`, [TEST_USER_ID]);

  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  process.env.INTERNAL_API_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  jest.spyOn(apiTokenService, 'resolveOwner').mockResolvedValue({
    id: TEST_USER_ID, email: 'owner@example.com', username: 'owner', firstName: 'Olivia', lastName: 'Owner', emailVerified: true,
  } as any);
  jest.spyOn(storageService, 'uploadFile').mockImplementation(async (userId, buffer, filename, _mime, category, subPath) => {
    const objectName = `${category}/${subPath}/${stored.size}-${filename}`;
    stored.set(objectName, buffer);
    return { url: `/user-${userId}/${objectName}`, filename, objectName };
  });
  jest.spyOn(storageService, 'getFileStream').mockImplementation(async (_bucket, objectName) => Readable.from([stored.get(objectName) as Buffer]));
  jest.spyOn(emailService, 'sendEmail').mockImplementation(async (mail: any) => {
    sent.push(mail);
    return `<${sent.length}@test>`;
  });

  const client = await db.query(
    `INSERT INTO clients (user_id, name, email, billing_email) VALUES ($1, 'Acme GmbH', 'kontakt@acme.example', 'rechnung@vermittler.example') RETURNING id`,
    [TEST_USER_ID]
  );
  clientId = client.rows[0].id;
  const project = await new ProjectService().create({ user_id: TEST_USER_ID, name: 'Mendix-Entwicklung', client_id: clientId, hourly_rate: 100 } as any);
  projectId = project.id;
  const timeEntries = new TimeEntryService();
  for (const [day, hours] of [['2026-10-05', 8], ['2026-10-06', 7.5]] as const) {
    await timeEntries.create({
      user_id: TEST_USER_ID, project_id: projectId, description: 'Entwicklung', entry_date: new Date(`${day}T00:00:00Z`),
      entry_time: '09:00', duration_hours: hours, is_billable: true,
    } as any);
  }
  const template = await db.query(
    `INSERT INTO email_templates (user_id, name, subject, mjml_content)
     VALUES ($1, 'Stundennachweis', 'Stundennachweis {{period.label}} – {{client.name}}',
             '<mjml><mj-body><mj-section><mj-column><mj-text>Hallo {{client.name}}</mj-text></mj-column></mj-section></mj-body></mjml>')
     RETURNING id`,
    [TEST_USER_ID]
  );
  templateId = template.rows[0].id;
}, 60000);

afterAll(async () => {
  jest.restoreAllMocks();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

it('runs the signed-timesheet flow through the real routes', async () => {
  const graph = JSON.parse(JSON.stringify(getWorkflowTemplate('signed-timesheet-invoice', 'de')!.graph)) as WorkflowGraph;
  for (const node of graph.nodes) {
    if (node.type === 'action' && node.data.action === 'email.send') node.data.input.templateId = templateId;
  }
  const definition = await definitions.create(TEST_USER_ID, { name: 'Vermittler', subject_type: 'client', graph });
  expect(await definitions.publish(definition.id, TEST_USER_ID)).toMatchObject({ ok: true });

  const runId = await engine.startRun({
    userId: TEST_USER_ID, definitionId: definition.id, subjectId: clientId, periodStart: '2026-10-01', periodEnd: '2026-10-31',
  });
  let run = (await engine.getRun(runId, TEST_USER_ID)) as WorkflowRun;
  expect(run.steps.filter((step) => step.status === 'failed').map((step) => `${step.node_id}: ${step.error}`)).toEqual([]);

  // Hours from the report route; the timesheet PDF filed as a client document for the period.
  expect(stepOf(run, 'n_sum')?.output).toMatchObject({ totalHours: 15.5, billableHours: 15.5, entryCount: 2 });
  const sheetId = stepOf(run, 'n_sheet')?.output?.documentId as string;
  const sheet = await db.query(`SELECT * FROM client_documents WHERE id = $1`, [sheetId]);
  expect(sheet.rows[0]).toMatchObject({ client_id: clientId, document_type: 'timesheet', file_mimetype: 'application/pdf', user_id: TEST_USER_ID });
  expect(sheet.rows[0].period_start.toISOString().slice(0, 10)).toBe('2026-10-01');
  const sheetPdf = Array.from(stored.values())[0];
  expect(sheetPdf.subarray(0, 5).toString()).toBe('%PDF-');

  // The approval shows what the real routes know about the template and the attachment.
  expect(openTask(run, 'approval').payload.preview).toEqual(
    expect.arrayContaining([
      { key: 'to', label: 'Recipient', value: 'kontakt@acme.example' },
      { key: 'template', label: 'Template', value: 'Stundennachweis' },
      { key: 'attachments', label: 'Attachments', value: 'Stundennachweis 2026-10-01 – 2026-10-31' },
    ])
  );
  await engine.settleTask(openTask(run, 'approval').id, TEST_USER_ID, 'approve');
  run = await reload(run);
  expect(stepOf(run, 'n_mail_sheet')?.error).toBeNull();

  // The mail carries the stored timesheet itself, and the template was filled from the run's data.
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({ userId: TEST_USER_ID, to: 'kontakt@acme.example', subject: 'Stundennachweis 2026-10 – Acme GmbH' });
  expect(sent[0].html).toContain('Hallo Acme GmbH');
  expect(sent[0].attachments).toHaveLength(1);
  expect(sent[0].attachments[0]).toMatchObject({ contentType: 'application/pdf' });
  expect(Buffer.compare(sent[0].attachments[0].content, sheetPdf)).toBe(0);

  // The signed sheet comes back and is filed through the document service.
  await engine.settleTask(openTask(run, 'upload').id, TEST_USER_ID, 'complete', {
    file: { buffer: Buffer.from('%PDF-signed'), originalname: 'unterschrieben.pdf', mimetype: 'application/pdf', size: 11 },
  });
  run = await reload(run);
  expect(run.steps.filter((step) => step.status === 'failed').map((step) => `${step.node_id}: ${step.error}`)).toEqual([]);

  // A real draft invoice from the two time entries, and the signed sheet tied to it.
  const invoiceId = stepOf(run, 'n_invoice')?.output?.invoiceId as string;
  const invoice = await db.query(`SELECT status, client_id, sub_total FROM invoices WHERE id = $1 AND user_id = $2`, [invoiceId, TEST_USER_ID]);
  expect(invoice.rows[0]).toMatchObject({ status: 'draft', client_id: clientId });
  expect(Number(invoice.rows[0].sub_total)).toBe(1550);
  const signedId = stepOf(run, 'n_upload')?.output?.documentId as string;
  const signed = await db.query(`SELECT document_type, invoice_id, signed_at FROM client_documents WHERE id = $1`, [signedId]);
  expect(signed.rows[0]).toMatchObject({ document_type: 'timesheet_signed', invoice_id: invoiceId });
  expect(signed.rows[0].signed_at).not.toBeNull();

  await engine.settleTask(openTask(run, 'confirm').id, TEST_USER_ID, 'complete');
  run = await reload(run);
  await engine.settleTask(openTask(run, 'approval').id, TEST_USER_ID, 'approve');
  run = await reload(run);
  expect(run.steps.filter((step) => step.status === 'failed').map((step) => `${step.node_id}: ${step.error}`)).toEqual([]);

  // The invoice mail: to the billing address, with the invoice PDF and the signed sheet; the invoice is now sent.
  expect(sent).toHaveLength(2);
  expect(sent[1].to).toBe('rechnung@vermittler.example');
  expect(sent[1].attachments.map((attachment: any) => attachment.contentType)).toEqual(['application/pdf', 'application/pdf']);
  expect(sent[1].attachments[0].content.subarray(0, 5).toString()).toBe('%PDF-');
  expect(sent[1].attachments[1].content.toString()).toBe('%PDF-signed');
  expect((await db.query(`SELECT status, currency FROM invoices WHERE id = $1`, [invoiceId])).rows[0]).toMatchObject({ status: 'sent', currency: 'EUR' });
  expect(run).toMatchObject({ status: 'completed' });
  expect(run.result).toMatch(/^Rechnung .+ versendet$/);
}, 120000);

it('a test run mails the owner with a marked subject and leaves the invoice a draft', async () => {
  sent.length = 0;
  const graph: WorkflowGraph = {
    nodes: [
      { id: 's', type: 'start', position: { x: 0, y: 0 }, data: { trigger: 'manual' } },
      {
        id: 'inv', type: 'action', position: { x: 0, y: 0 },
        data: { action: 'invoice.createDraft', mode: 'auto', input: { projectId: { $ref: 'project.id' }, start: { $ref: 'period.start' }, end: { $ref: 'period.end' } } },
      },
      { id: 'pdf', type: 'action', position: { x: 0, y: 0 }, data: { action: 'invoice.pdf', mode: 'auto', input: { invoiceId: { $ref: 'steps.inv.invoiceId' } } } },
      {
        id: 'mail', type: 'action', position: { x: 0, y: 0 },
        data: {
          action: 'email.send', mode: 'auto',
          input: { to: { $ref: 'client.invoice_email' }, templateId, attachInvoiceId: { $ref: 'steps.inv.invoiceId' }, attachDocumentIds: [{ $ref: 'steps.pdf.documentId' }], markInvoiceSent: true },
        },
      },
      { id: 'note', type: 'action', position: { x: 0, y: 0 }, data: { action: 'notify.owner', mode: 'auto', input: { message: 'Rechnung {{steps.inv.invoiceNumber}} ist raus', email: false } } },
      { id: 'e', type: 'end', position: { x: 0, y: 0 }, data: {} },
    ],
    edges: [
      { id: 'e1', source: 's', target: 'inv' },
      { id: 'e2', source: 'inv', target: 'pdf' },
      { id: 'e3', source: 'pdf', target: 'mail' },
      { id: 'e4', source: 'mail', target: 'note' },
      { id: 'e5', source: 'note', target: 'e' },
    ],
  };
  const definition = await definitions.create(TEST_USER_ID, { name: 'Projekt-Rechnung', subject_type: 'project', graph });
  expect(await definitions.publish(definition.id, TEST_USER_ID)).toMatchObject({ ok: true });
  const runId = await engine.startRun({
    userId: TEST_USER_ID, definitionId: definition.id, subjectId: projectId, periodStart: '2026-10-01', periodEnd: '2026-10-31', test: true,
  });
  const run = (await engine.getRun(runId, TEST_USER_ID)) as WorkflowRun;
  expect(run.steps.filter((step) => step.status === 'failed').map((step) => `${step.node_id}: ${step.error}`)).toEqual([]);
  expect(run.status).toBe('completed');

  expect(sent).toHaveLength(1);
  expect(sent[0].to).toBe('owner@example.com');
  expect(sent[0].subject.startsWith('[Test] ')).toBe(true);
  const invoiceId = stepOf(run, 'inv')?.output?.invoiceId as string;
  expect((await db.query(`SELECT status FROM invoices WHERE id = $1`, [invoiceId])).rows[0].status).toBe('draft');
  const filed = await db.query(`SELECT title, invoice_id, document_type FROM client_documents WHERE id = $1`, [stepOf(run, 'pdf')?.output?.documentId]);
  expect(filed.rows[0]).toMatchObject({ invoice_id: invoiceId, document_type: 'other' });
  expect(filed.rows[0].title.startsWith('[Test] Rechnung ')).toBe(true);
  // The note sits in the task list and blocks nothing.
  const notice = run.tasks.find((task) => task.kind === 'notice')!;
  expect(notice).toMatchObject({ status: 'open' });
  expect(notice.title).toMatch(/^\[Test\] Rechnung .+ ist raus$/);
  const openBefore = await engine.countOpenTasks(TEST_USER_ID);
  await engine.settleTask(notice.id, TEST_USER_ID, 'dismiss');
  expect(await engine.countOpenTasks(TEST_USER_ID)).toBe(openBefore - 1);
}, 120000);

it('a run reaches only what its flow was published with', async () => {
  const api = createWorkflowApi({ userId: TEST_USER_ID, runId: 'run-x', permissions: { resources: { reports: 'read' }, capabilities: [] } });
  await expect(api.get('/api/reports/time-tracking', { start_date: '2026-10-01', end_date: '2026-10-31' })).resolves.toMatchObject({
    summary: expect.any(Object),
  });
  const refused = async (call: Promise<unknown>) => {
    const error = await call.catch((caught) => caught);
    expect(error).toBeInstanceOf(WorkflowApiError);
    return (error as WorkflowApiError).status;
  };
  expect(await refused(api.get('/api/invoices'))).toBe(403);
  expect(await refused(api.post('/api/email/send', { to: 'x@example.com', templateId }))).toBe(403);
  expect(await refused(api.get('/api/settings'))).toBe(403);
  expect(await refused(api.get('/api/workflows/definitions'))).toBe(403);
  expect(await refused(api.post('/api/workflows/tasks/abc/approve'))).toBe(403);
});

it('the workflow routes answer a signed-out caller with 401', async () => {
  const response = await fetch(`${process.env.INTERNAL_API_URL}/api/workflows/definitions`);
  expect(response.status).toBe(401);
});

// ── Who may use the workflow routes ──────────────────────────────────────────

describe('API tokens on the workflow routes', () => {
  let flowId: string;
  const secrets: Record<string, string> = {};

  const call = async (token: string, method: string, path: string, body?: unknown) => {
    const response = await fetch(`${process.env.INTERNAL_API_URL}/api/workflows${path}`, {
      method,
      headers: { Authorization: `Bearer ${secrets[token]}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  };

  beforeAll(async () => {
    await db.query(`DELETE FROM api_tokens WHERE user_id = $1`, [TEST_USER_ID]);
    const tokens: Record<string, any> = {
      looker: { resources: { workflows: 'read' }, capabilities: [] },
      starter: { resources: { workflows: 'write' }, capabilities: [] },
      full: { resources: { workflows: 'write', invoices: 'write', clients: 'write', templates: 'read' }, capabilities: ['email_send'] },
      other: { resources: { invoices: 'read' }, capabilities: [] },
    };
    for (const [name, permissions] of Object.entries(tokens)) {
      secrets[name] = (await apiTokenService.create(TEST_USER_ID, { name: `wf-${name}`, permissions })).secret;
    }
    const flows = await definitions.list(TEST_USER_ID);
    flowId = flows.find((flow) => flow.name === 'Projekt-Rechnung')!.id;
  });

  it('reading needs workflows:read', async () => {
    const list = await call('looker', 'GET', '/definitions');
    expect(list.status).toBe(200);
    expect(list.body.map((flow: any) => flow.name)).toEqual(expect.arrayContaining(['Projekt-Rechnung', 'Vermittler']));
    expect((await call('looker', 'GET', '/catalog')).body.actions.map((action: any) => action.key)).toEqual(
      expect.arrayContaining(['time.summarize', 'timesheet.generate', 'invoice.createDraft', 'invoice.pdf', 'email.send', 'invoice.markSent', 'document.link', 'notify.owner'])
    );
    expect((await call('looker', 'GET', '/templates?lang=de')).body[0]).toMatchObject({ key: 'signed-timesheet-invoice', name: 'Stundennachweis mit Unterschrift' });
    expect((await call('looker', 'GET', '/tasks/count')).body).toEqual({ open: expect.any(Number) });
    expect((await call('other', 'GET', '/definitions')).status).toBe(403);
    // Starting is a write.
    expect((await call('looker', 'POST', `/definitions/${flowId}/runs`, { subject_id: projectId })).status).toBe(403);
  });

  it('drawing, publishing and deleting flows needs a signed-in session', async () => {
    for (const [method, path, body] of [
      ['POST', '/definitions', { name: 'From a token', subject_type: 'none' }],
      ['PUT', `/definitions/${flowId}`, { name: 'Renamed' }],
      ['POST', `/definitions/${flowId}/publish`, {}],
      ['POST', `/definitions/${flowId}/status`, { status: 'archived' }],
    ] as const) {
      const response = await call('full', method, path, body);
      expect([method, path, response.status]).toEqual([method, path, 403]);
      expect(response.body.message).toContain('signed-in session');
    }
    // DELETE is beyond what the workflows permission offers at all.
    expect((await call('full', 'DELETE', `/definitions/${flowId}`)).status).toBe(403);
    expect((await definitions.get(flowId, TEST_USER_ID))?.name).toBe('Projekt-Rechnung');
  });

  it('a token starts a flow only if it holds what the flow acts with', async () => {
    const period = { subject_id: projectId, period_start: '2026-10-01', period_end: '2026-10-31', test: true };
    const refused = await call('starter', 'POST', `/definitions/${flowId}/runs`, period);
    expect(refused.status).toBe(403);
    expect(refused.body.required).toMatch(/^(invoices:write|clients:write|templates:read|email_send)$/);

    const started = await call('full', 'POST', `/definitions/${flowId}/runs`, period);
    expect(started.status).toBe(201);
    expect(started.body).toMatchObject({ status: 'completed', test_mode: true, subject_label: 'Mendix-Entwicklung' });
    expect((await call('full', 'GET', `/runs/${started.body.id}`)).body.steps.length).toBeGreaterThan(3);
    expect((await call('full', 'GET', `/runs?definition_id=${flowId}`)).body.length).toBeGreaterThanOrEqual(2);

    // A duplicate real run is refused with the id of the one that exists.
    const real = { ...period, test: false, period_start: '2026-07-01', period_end: '2026-07-31' };
    const first = await call('full', 'POST', `/definitions/${flowId}/runs`, real);
    expect(first.status).toBe(201);
    expect(await call('full', 'POST', `/definitions/${flowId}/runs`, real)).toMatchObject({
      status: 409,
      body: { code: 'RUN_EXISTS', run_id: first.body.id },
    });
    // July has no time entries: the draft invoice fails, the run is an incident the token can cancel.
    expect(first.body.status).toBe('incident');
    expect((await call('full', 'POST', `/runs/${first.body.id}/cancel`)).body.status).toBe('cancelled');
  });

  it('approving an action is for a person, and bad input is a 400', async () => {
    const tasks = await call('full', 'GET', '/tasks?status=all');
    expect(tasks.status).toBe(200);
    const anyTask = tasks.body[0];
    expect((await call('full', 'POST', `/tasks/${anyTask.id}/approve`)).status).toBe(403);
    expect((await call('full', 'POST', `/tasks/${anyTask.id}/skip`)).status).toBe(403);
    expect((await call('full', 'GET', '/tasks?status=sideways')).status).toBe(400);
    expect((await call('full', 'POST', `/definitions/${flowId}/runs`, { period_start: '2026-10-01' })).status).toBe(400);
    expect((await call('full', 'GET', '/runs/not-a-uuid')).status).toBe(404);
    expect((await call('full', 'POST', '/tasks/00000000-0000-4000-8000-000000000000/dismiss')).status).toBe(404);
  });
});

// ── Stage 2: an event raised by a real route starts a flow ───────────────────

it('cancelling an invoice through the API starts the flow that reacts to it', async () => {
  const invoiceFlow = async (name: string, start: Record<string, unknown>, action: Record<string, unknown>) => {
    const graph: WorkflowGraph = {
      nodes: [
        { id: 's', type: 'start', position: { x: 0, y: 0 }, data: start as any },
        { id: 'act', type: 'action', position: { x: 0, y: 0 }, data: action as any },
        { id: 'e', type: 'end', position: { x: 0, y: 0 }, data: { result: '{{invoice.number}}' } },
      ],
      edges: [
        { id: 'e1', source: 's', target: 'act' },
        { id: 'e2', source: 'act', target: 'e' },
      ],
    };
    const definition = await definitions.create(TEST_USER_ID, { name, subject_type: 'invoice', graph });
    expect(await definitions.publish(definition.id, TEST_USER_ID)).toMatchObject({ ok: true });
    return definition.id;
  };
  const cancelFlow = await invoiceFlow('Storno', { trigger: 'manual' }, { action: 'invoice.cancel', mode: 'auto', input: { invoiceId: { $ref: 'invoice.id' } } });
  const reactFlow = await invoiceFlow(
    'Nach Storno',
    { trigger: 'event', event: { type: 'invoice.cancelled' } },
    { action: 'invoice.pdf', mode: 'auto', input: { invoiceId: { $ref: 'invoice.id' }, kind: 'cancellation' } }
  );
  // The published permissions follow from the actions: cancelling needs the right to delete invoices.
  expect((await definitions.get(cancelFlow, TEST_USER_ID))?.published_permissions).toEqual({ resources: { invoices: 'delete' }, capabilities: [] });

  // The invoice the first test sent.
  const sent = await db.query(`SELECT id, invoice_number FROM invoices WHERE user_id = $1 AND status = 'sent' ORDER BY created_at LIMIT 1`, [TEST_USER_ID]);
  const invoice = sent.rows[0];
  await db.query(`DELETE FROM workflow_events`);

  const runId = await engine.startRun({ userId: TEST_USER_ID, definitionId: cancelFlow, subjectId: invoice.id });
  const cancelRun = (await engine.getRun(runId, TEST_USER_ID)) as WorkflowRun;
  expect(cancelRun.steps.filter((step) => step.status === 'failed').map((step) => step.error)).toEqual([]);
  expect(cancelRun.status).toBe('completed');
  expect((await db.query(`SELECT status FROM invoices WHERE id = $1`, [invoice.id])).rows[0].status).toBe('cancelled');

  // The route's write raised the event; the engine (nudged by the request, or here by hand) starts the reacting flow.
  await engine.processEvents();
  let reacted = await engine.listRuns(TEST_USER_ID, { definitionId: reactFlow });
  for (let attempt = 0; attempt < 60 && reacted[0]?.status !== 'completed' && reacted[0]?.status !== 'incident'; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    reacted = await engine.listRuns(TEST_USER_ID, { definitionId: reactFlow });
  }
  expect(reacted).toHaveLength(1);
  const reaction = (await engine.getRun(reacted[0].id, TEST_USER_ID)) as WorkflowRun;
  expect(reaction.steps.filter((step) => step.status === 'failed').map((step) => step.error)).toEqual([]);
  expect(reaction).toMatchObject({ status: 'completed', started_by: 'event', result: invoice.invoice_number });
  const filed = await db.query(`SELECT title, invoice_id, file_mimetype FROM client_documents WHERE id = $1`, [stepOf(reaction, 'act')?.output?.documentId]);
  expect(filed.rows[0]).toMatchObject({ title: `Stornorechnung ${invoice.invoice_number}`, invoice_id: invoice.id, file_mimetype: 'application/pdf' });
}, 120000);
