/**
 * The workflow engine against a real database, with the API it calls and the
 * owner lookup replaced: a run of the shipped "signed timesheet, then invoice"
 * flow from start to end, and what keeps a run correct — approvals, due dates,
 * incidents, one run per subject and period, versions, restarts, schedules.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import crypto from 'crypto';
import { getDbClient } from '../../src/utils/database';
import { TEST_USER_ID } from '../setup';
import { ensureWorkflowSchema } from '../../src/services/workflow/workflow-schema';
import { WorkflowDefinitionService } from '../../src/services/workflow/workflow-definition.service';
import {
  RunExistsError,
  WorkflowEngine,
  WorkflowNotFoundError,
  WorkflowStateError,
} from '../../src/services/workflow/workflow-engine.service';
import { getWorkflowTemplate } from '../../src/services/workflow/workflow-templates';
import type { WorkflowApi } from '../../src/services/workflow/workflow-api';
import type { WorkflowGraph, WorkflowRun } from '../../src/types/workflow.types';

const db = getDbClient();
const definitions = new WorkflowDefinitionService();
const EMAIL_TEMPLATE = '22222222-2222-4222-8222-222222222222';
const OTHER_USER = '99999999-9999-4999-8999-999999999999';

// ── The API the actions call, as a recording stand-in ────────────────────────

interface ApiCall {
  method: string;
  path: string;
  body?: any;
  query?: any;
}

class FakeApi {
  calls: ApiCall[] = [];
  identities: any[] = [];
  hours = 42.5;
  /** Makes the next call to a path containing this text fail once. */
  failOn: string | null = null;
  invoiceStatus = 'draft';

  private record(method: string, path: string, extra: Partial<ApiCall> = {}) {
    this.calls.push({ method, path, ...extra });
    if (this.failOn && path.includes(this.failOn)) {
      this.failOn = null;
      throw new Error('The mail server refused the message.');
    }
  }

  client(): WorkflowApi {
    return {
      get: async (path: string, query?: any) => {
        this.record('GET', path, { query });
        if (path === '/api/reports/time-tracking') {
          return {
            entries: this.hours > 0 ? [{}, {}] : [],
            summary: { total_hours: this.hours, billable_hours: this.hours, billable_value: this.hours * 100 },
          } as any;
        }
        if (path.startsWith('/api/invoices/')) {
          return { client_id: 'client', status: this.invoiceStatus, currency: 'EUR', invoice_number: 'RE-2026-010' } as any;
        }
        if (path.startsWith('/api/email-templates/')) {
          return { template: { name: 'Stundennachweis', subject: 'Nachweis {{period.label}} / {{invoice.number}} / {{company.name}}' } } as any;
        }
        if (path.startsWith('/api/clients/documents/')) return { title: 'Stundennachweis Oktober' } as any;
        return {} as any;
      },
      getBinary: async (path: string, query?: any) => {
        this.record('GET', path, { query });
        return Buffer.from('%PDF-1.4 fake');
      },
      post: async (path: string, body?: any) => {
        this.record('POST', path, { body });
        if (path === '/api/invoices/generate-from-time-entries') {
          return { invoice: { id: '33333333-3333-4333-8333-333333333333', invoice_number: 'RE-2026-010', total_amount: '4250.00' } } as any;
        }
        if (path === '/api/email/send') return { success: true, messageId: `<${this.calls.length}@test>` } as any;
        return {} as any;
      },
      put: async (path: string, body?: any) => {
        this.record('PUT', path, { body });
        if (path.startsWith('/api/invoices/')) this.invoiceStatus = body.status;
        return {} as any;
      },
      patch: async (path: string, body?: any) => {
        this.record('PATCH', path, { body });
        return {} as any;
      },
      upload: async (path: string, fields: any, file: any) => {
        this.record('POST', path, { body: { ...fields, file: file.filename } });
        return { id: '44444444-4444-4444-8444-444444444444', file_filename: file.filename } as any;
      },
    };
  }

  sent(): ApiCall[] {
    return this.calls.filter((call) => call.path === '/api/email/send');
  }
}

let api: FakeApi;
let engine: WorkflowEngine;
let storedDocuments: any[];
let clientId: string;
let secondClientId: string;

function newEngine(): WorkflowEngine {
  return new WorkflowEngine(
    {
      resolveOwner: async () => ({ email: 'owner@example.com', name: 'Olivia Owner' }),
      mailOwner: async () => undefined,
      createApi: (identity) => {
        api.identities.push(identity);
        return api.client();
      },
      storeDocument: async (client, _user, data, file) => {
        storedDocuments.push({ client, data, file: file.originalname });
        return { id: '55555555-5555-4555-8555-555555555555', file_filename: file.originalname };
      },
    },
    definitions
  );
}

/** The shipped template with its email templates chosen, optionally changed, published. */
async function publishedFlow(change?: (graph: WorkflowGraph) => void, userId: string = TEST_USER_ID): Promise<string> {
  const graph = JSON.parse(JSON.stringify(getWorkflowTemplate('signed-timesheet-invoice', 'de')!.graph)) as WorkflowGraph;
  for (const node of graph.nodes) {
    if (node.type === 'action' && node.data.action === 'email.send') node.data.input.templateId = EMAIL_TEMPLATE;
  }
  change?.(graph);
  const definition = await definitions.create(userId, { name: `Flow ${crypto.randomUUID().slice(0, 8)}`, subject_type: 'client', graph });
  const published = await definitions.publish(definition.id, userId);
  if (!published?.ok) throw new Error(`Not publishable: ${JSON.stringify(published && !published.ok ? published.issues : published)}`);
  return definition.id;
}

const october = { periodStart: '2026-10-01', periodEnd: '2026-10-31' };

async function start(definitionId: string, extra: Record<string, unknown> = {}): Promise<WorkflowRun> {
  const runId = await engine.startRun({ userId: TEST_USER_ID, definitionId, subjectId: clientId, ...october, ...extra });
  return (await engine.getRun(runId, TEST_USER_ID)) as WorkflowRun;
}

const reload = async (run: WorkflowRun) => (await engine.getRun(run.id, TEST_USER_ID)) as WorkflowRun;
const openTask = (run: WorkflowRun, kind?: string) =>
  run.tasks.find((task) => task.status === 'open' && (!kind || task.kind === kind));
const stepOf = (run: WorkflowRun, nodeId: string) => [...run.steps].reverse().find((step) => step.node_id === nodeId);
const pdf = { buffer: Buffer.from('signed'), originalname: 'nachweis-unterschrieben.pdf', mimetype: 'application/pdf', size: 6 };

beforeAll(async () => {
  await ensureWorkflowSchema(db);
  await db.query(`DELETE FROM workflow_definitions WHERE user_id IN ($1, $2)`, [TEST_USER_ID, OTHER_USER]);
  const insert = (name: string, email: string | null, billing: string | null) =>
    db.query(`INSERT INTO clients (user_id, name, email, billing_email) VALUES ($1, $2, $3, $4) RETURNING id`, [
      TEST_USER_ID, name, email, billing,
    ]);
  clientId = (await insert('Acme GmbH', 'kontakt@acme.example', 'rechnung@vermittler.example')).rows[0].id;
  secondClientId = (await insert('Globex AG', 'office@globex.example', null)).rows[0].id;
});

beforeEach(async () => {
  api = new FakeApi();
  storedDocuments = [];
  engine = newEngine();
  // Timers are global: what earlier tests left pending must not fire in this one.
  await db.query(`DELETE FROM workflow_timers WHERE fired_at IS NULL`);
});

// ── The whole flow ───────────────────────────────────────────────────────────

describe('signed timesheet, then invoice', () => {
  it('runs from the month end to the sent invoice, resting where a person is needed', async () => {
    const flow = await publishedFlow();
    let run = await start(flow);

    // 1. Hours summed, timesheet created and filed — then the mail waits for approval.
    expect(run.status).toBe('waiting');
    expect(run.subject_label).toBe('Acme GmbH');
    expect(stepOf(run, 'n_sum')?.output).toMatchObject({ totalHours: 42.5 });
    expect(stepOf(run, 'n_sheet')?.output).toMatchObject({ documentId: '44444444-4444-4444-8444-444444444444' });
    const sheetUpload = api.calls.find((call) => call.path === `/api/clients/${clientId}/documents`);
    expect(sheetUpload?.body).toMatchObject({ document_type: 'timesheet', period_start: '2026-10-01', period_end: '2026-10-31' });
    expect(api.calls.find((call) => call.path === '/api/reports/time-tracking/pdf')?.query).toMatchObject({
      client_id: clientId, hide_prices: 'true', start_date: '2026-10-01', end_date: '2026-10-31',
    });
    expect(api.sent()).toHaveLength(0);

    const approval = openTask(run, 'approval')!;
    expect(approval.payload.preview).toEqual(
      expect.arrayContaining([
        { key: 'to', label: 'Recipient', value: 'kontakt@acme.example' },
        { key: 'template', label: 'Template', value: 'Stundennachweis' },
        { key: 'attachments', label: 'Attachments', value: 'Stundennachweis Oktober' },
      ])
    );

    // 2. Approved: the mail goes out once, with the timesheet, to the client's contact.
    await engine.settleTask(approval.id, TEST_USER_ID, 'approve');
    run = await reload(run);
    expect(api.sent()).toHaveLength(1);
    expect(api.sent()[0].body).toMatchObject({
      to: 'kontakt@acme.example',
      templateId: EMAIL_TEMPLATE,
      attachments: [{ type: 'document', documentId: '44444444-4444-4444-8444-444444444444' }],
    });
    expect(api.sent()[0].body.variables).toMatchObject({ 'client.name': 'Acme GmbH', 'period.label': '2026-10' });

    // 3. The upload task waits, with a due date.
    const upload = openTask(run, 'upload')!;
    expect(upload.title).toBe('Unterschriebenen Stundennachweis hochladen: Acme GmbH, 2026-10');
    expect(upload.due_at).not.toBeNull();
    expect(upload.payload).toEqual({ documentType: 'timesheet_signed' });
    await expect(engine.settleTask(upload.id, TEST_USER_ID, 'complete')).rejects.toThrow('Choose the file');

    await engine.settleTask(upload.id, TEST_USER_ID, 'complete', { file: pdf });
    run = await reload(run);
    expect(storedDocuments).toEqual([
      {
        client: clientId,
        file: 'nachweis-unterschrieben.pdf',
        data: expect.objectContaining({ document_type: 'timesheet_signed', period_start: '2026-10-01', title: 'nachweis-unterschrieben' }),
      },
    ]);

    // 4. Draft invoice created, the signed sheet tied to it; the review task waits.
    expect(stepOf(run, 'n_invoice')?.output).toMatchObject({ invoiceNumber: 'RE-2026-010', total: 4250 });
    expect(api.calls.find((call) => call.method === 'PUT' && call.path.startsWith('/api/clients/documents/'))).toMatchObject({
      path: '/api/clients/documents/55555555-5555-4555-8555-555555555555',
      body: { invoice_id: '33333333-3333-4333-8333-333333333333' },
    });
    const review = openTask(run, 'confirm')!;
    expect(review.title).toBe('Rechnung RE-2026-010 prüfen: Acme GmbH');
    await engine.settleTask(review.id, TEST_USER_ID, 'complete', { comment: 'passt' });
    run = await reload(run);

    // 5. The invoice mail waits for approval, then goes to the billing address and marks the invoice as sent.
    const invoiceApproval = openTask(run, 'approval')!;
    expect(invoiceApproval.payload.preview).toEqual(
      expect.arrayContaining([
        { key: 'to', label: 'Recipient', value: 'rechnung@vermittler.example' },
        // The subject as it will read; what only the send route fills in stays a placeholder.
        { key: 'subject', label: 'Subject', value: 'Nachweis 2026-10 / RE-2026-010 / {{company.name}}' },
        { key: 'attachments', label: 'Attachments', value: 'invoice-RE-2026-010.pdf, Stundennachweis Oktober' },
        { key: 'afterwards', label: 'Afterwards', value: 'The invoice is marked as sent.', valueKey: 'invoiceMarkedSent' },
      ])
    );
    await engine.settleTask(invoiceApproval.id, TEST_USER_ID, 'approve');
    run = await reload(run);

    expect(api.sent()).toHaveLength(2);
    expect(api.sent()[1].body).toMatchObject({
      to: 'rechnung@vermittler.example',
      attachments: [
        { type: 'invoice', invoiceId: '33333333-3333-4333-8333-333333333333' },
        { type: 'document', documentId: '55555555-5555-4555-8555-555555555555' },
      ],
    });
    expect(api.invoiceStatus).toBe('sent');
    expect(run.status).toBe('completed');
    expect(run.result).toBe('Rechnung RE-2026-010 versendet');
    expect(run.ended_at).not.toBeNull();
    expect(run.tasks.every((task) => task.status === 'done')).toBe(true);

    // Every call was made with the flow's permissions, as the run's owner.
    expect(api.identities.every((identity) => identity.userId === TEST_USER_ID && identity.runId === run.id)).toBe(true);
    expect(api.identities[0].permissions).toEqual({
      resources: { reports: 'read', clients: 'write', invoices: 'write', templates: 'read' },
      capabilities: ['email_send'],
    });
  });

  it('ends at once when the month has no hours', async () => {
    api.hours = 0;
    const run = await start(await publishedFlow());
    expect(run.status).toBe('completed');
    expect(run.result).toBe('Keine Stunden im Zeitraum 2026-10');
    expect(run.steps.map((step) => step.node_id)).toEqual(['n_start', 'n_sum', 'n_gw', 'n_end_empty']);
    expect(stepOf(run, 'n_gw')?.outcome).toBe('e_no');
    expect(api.calls.some((call) => call.path.includes('/pdf'))).toBe(false);
  });
});

// ── Approvals ────────────────────────────────────────────────────────────────

describe('approvals', () => {
  it('runs exactly what was shown, once', async () => {
    let run = await start(await publishedFlow());
    const approval = openTask(run, 'approval')!;
    // The client's address changes after the preview was shown — the approved mail still goes where it said.
    await db.query(`UPDATE workflow_runs SET context = jsonb_set(context, '{client,email}', '"changed@example.com"') WHERE id = $1`, [run.id]);
    await Promise.all([
      engine.settleTask(approval.id, TEST_USER_ID, 'approve'),
      engine.settleTask(approval.id, TEST_USER_ID, 'approve').catch((error) => error),
    ]);
    run = await reload(run);
    expect(api.sent()).toHaveLength(1);
    expect(api.sent()[0].body.to).toBe('kontakt@acme.example');
    await expect(engine.settleTask(approval.id, TEST_USER_ID, 'approve')).rejects.toBeInstanceOf(WorkflowStateError);
  });

  it('skipping sends nothing and moves on', async () => {
    let run = await start(await publishedFlow());
    await engine.settleTask(openTask(run, 'approval')!.id, TEST_USER_ID, 'skip');
    run = await reload(run);
    expect(api.sent()).toHaveLength(0);
    expect(stepOf(run, 'n_mail_sheet')?.status).toBe('skipped');
    expect(openTask(run, 'upload')).toBeDefined();
  });

  it('a task can only be settled the way its kind allows, and only by its owner', async () => {
    const run = await start(await publishedFlow());
    const approval = openTask(run, 'approval')!;
    await expect(engine.settleTask(approval.id, TEST_USER_ID, 'complete')).rejects.toThrow('cannot be settled that way');
    await expect(engine.settleTask(approval.id, OTHER_USER, 'approve')).rejects.toBeInstanceOf(WorkflowNotFoundError);
    expect(await engine.getRun(run.id, OTHER_USER)).toBeNull();
    expect(await engine.listTasks(OTHER_USER, {})).toEqual([]);
  });
});

// ── Due dates ────────────────────────────────────────────────────────────────

describe('due dates', () => {
  it('reminds the client when the upload is overdue and opens the task again', async () => {
    let run = await start(await publishedFlow());
    await engine.settleTask(openTask(run, 'approval')!.id, TEST_USER_ID, 'approve');
    run = await reload(run);
    const firstUpload = openTask(run, 'upload')!;

    // Nothing is due yet.
    expect(await engine.fireDueTimers()).toBe(0);
    const inSixDays = new Date(Date.now() + 6 * 86_400_000);
    expect(await engine.fireDueTimers(inSixDays)).toBe(1);
    run = await reload(run);

    expect(run.tasks.find((task) => task.id === firstUpload.id)?.status).toBe('expired');
    expect(stepOf(run, 'n_remind')?.status).toBe('completed');
    // The reminder is set to "auto": sent without asking, with the timesheet attached again.
    expect(api.sent()).toHaveLength(2);
    const secondUpload = openTask(run, 'upload')!;
    expect(secondUpload.id).not.toBe(firstUpload.id);
    expect(run.status).toBe('waiting');

    // Uploading now continues the run; the stale timer of the first task is gone.
    await engine.settleTask(secondUpload.id, TEST_USER_ID, 'complete', { file: pdf });
    expect(await engine.fireDueTimers(new Date(Date.now() + 30 * 86_400_000))).toBe(0);
    expect(openTask(await reload(run), 'confirm')).toBeDefined();
  });

  it('a wait holds the run until its time has passed', async () => {
    const flow = await publishedFlow((graph) => {
      graph.nodes.push({ id: 'n_wait', type: 'wait', position: { x: 0, y: 0 }, data: { days: 2 } });
      graph.edges = graph.edges.filter((edge) => edge.id !== 'e_start');
      graph.edges.push({ id: 'e_a', source: 'n_start', target: 'n_wait' }, { id: 'e_b', source: 'n_wait', target: 'n_sum' });
    });
    let run = await start(flow);
    expect(run.status).toBe('waiting');
    expect(run.current_node_label).toBe('Wait');
    expect(await engine.fireDueTimers(new Date(Date.now() + 86_400_000))).toBe(0);
    expect(await engine.fireDueTimers(new Date(Date.now() + 3 * 86_400_000))).toBe(1);
    run = await reload(run);
    expect(stepOf(run, 'n_wait')?.status).toBe('completed');
    expect(openTask(run, 'approval')).toBeDefined();
  });
});

// ── Incidents ────────────────────────────────────────────────────────────────

describe('incidents', () => {
  it('a failed action stops the run until the user retries it', async () => {
    api.failOn = '/api/email/send';
    let run = await start(await publishedFlow());
    await engine.settleTask(openTask(run, 'approval')!.id, TEST_USER_ID, 'approve');
    run = await reload(run);
    expect(run.status).toBe('incident');
    const failed = stepOf(run, 'n_mail_sheet')!;
    // An error from outside the engine has no code: its text is all there is.
    expect(failed).toMatchObject({ status: 'failed', error: 'The mail server refused the message.', error_code: null });
    expect(run.current_node_label).toBe('Nachweis an Kunde zur Unterschrift');

    // A retry asks for approval again — the first one was for an attempt that did not go out.
    await engine.retryStep(run.id, failed.id, TEST_USER_ID);
    run = await reload(run);
    expect(run.status).toBe('waiting');
    expect(stepOf(run, 'n_mail_sheet')?.attempt).toBe(2);
    await engine.settleTask(openTask(run, 'approval')!.id, TEST_USER_ID, 'approve');
    run = await reload(run);
    expect(api.sent()).toHaveLength(2); // the refused one and the one that went out
    expect(openTask(run, 'upload')).toBeDefined();
  });

  it('a failed step can be skipped, or the run cancelled', async () => {
    api.failOn = 'generate-from-time-entries';
    const flow = await publishedFlow((graph) => {
      // Straight to the invoice: no mail, no upload.
      graph.edges = graph.edges.filter((edge) => edge.id !== 'e_sheet');
      graph.edges.push({ id: 'e_short', source: 'n_sheet', target: 'n_invoice' });
      graph.nodes = graph.nodes.filter((node) => !['n_mail_sheet', 'n_upload', 'n_remind', 'n_link'].includes(node.id));
      graph.edges = graph.edges.filter((edge) => !['e_mail_sheet', 'e_upload', 'e_timeout', 'e_remind', 'e_link'].includes(edge.id));
      graph.edges = graph.edges.map((edge) => (edge.id === 'e_invoice' ? { ...edge, target: 'n_review' } : edge));
      const mail = graph.nodes.find((node) => node.id === 'n_mail_invoice') as any;
      mail.data.input.attachDocumentIds = [];
    });
    let run = await start(flow);
    expect(run.status).toBe('incident');
    const failed = stepOf(run, 'n_invoice')!;
    await expect(engine.skipStep(run.id, failed.id, OTHER_USER)).rejects.toBeInstanceOf(WorkflowNotFoundError);

    await engine.skipStep(run.id, failed.id, TEST_USER_ID);
    run = await reload(run);
    expect(stepOf(run, 'n_invoice')?.status).toBe('skipped');
    // The skipped step has no result, so what refers to it is empty.
    expect(openTask(run, 'confirm')?.title).toBe('Rechnung  prüfen: Acme GmbH');

    await engine.cancelRun(run.id, TEST_USER_ID);
    run = await reload(run);
    expect(run.status).toBe('cancelled');
    expect(run.tasks.every((task) => task.status !== 'open')).toBe(true);
    await expect(engine.cancelRun(run.id, TEST_USER_ID)).rejects.toBeInstanceOf(WorkflowStateError);
  });

  it('input that is empty for this run is an incident, and a retry reads the client again', async () => {
    const flow = await publishedFlow();
    // Globex has no billing address but a contact address; remove that too.
    await db.query(`UPDATE clients SET email = NULL WHERE id = $1`, [secondClientId]);
    let run = await start(flow, { subjectId: secondClientId });
    expect(run.status).toBe('incident');
    const failed = stepOf(run, 'n_mail_sheet')!;
    expect(failed.error).toBe('"Recipient" is empty for this run.');
    // The code and what it is about travel with the step, so the UI can say it in the user's language.
    expect(failed).toMatchObject({ error_code: 'INPUT_EMPTY', error_params: { action: 'email.send', field: 'to', label: 'Recipient' } });

    await db.query(`UPDATE clients SET email = 'office@globex.example' WHERE id = $1`, [secondClientId]);
    await engine.retryStep(run.id, failed.id, TEST_USER_ID);
    run = await reload(run);
    expect(run.status).toBe('waiting');
    expect(openTask(run, 'approval')?.payload.preview).toEqual(
      expect.arrayContaining([{ key: 'to', label: 'Recipient', value: 'office@globex.example' }])
    );
  });

  it('rejecting a review without a wired "rejected" exit cancels the run', async () => {
    const flow = await publishedFlow();
    let run = await start(flow, { periodStart: '2026-09-01', periodEnd: '2026-09-30' });
    await engine.settleTask(openTask(run, 'approval')!.id, TEST_USER_ID, 'skip');
    run = await reload(run);
    await engine.settleTask(openTask(run, 'upload')!.id, TEST_USER_ID, 'complete', { file: pdf });
    run = await reload(run);
    const review = openTask(run, 'confirm')!;
    expect(review.payload).toEqual({ rejectCancelsRun: true });
    await engine.settleTask(review.id, TEST_USER_ID, 'reject', { comment: 'Stunden stimmen nicht' });
    run = await reload(run);
    expect(run).toMatchObject({ status: 'cancelled', result: 'Rejected' });
    expect(run.tasks.find((task) => task.id === review.id)).toMatchObject({
      status: 'rejected',
      result: { comment: 'Stunden stimmen nicht', decision: 'reject' },
    });
  });
});

// ── One run per subject and period; test runs; versions ──────────────────────

describe('runs', () => {
  it('starts only once per flow, client and period', async () => {
    const flow = await publishedFlow();
    const first = await start(flow);
    const again = await engine.startRun({ userId: TEST_USER_ID, definitionId: flow, subjectId: clientId, ...october }).catch((error) => error);
    expect(again).toBeInstanceOf(RunExistsError);
    expect(again.runId).toBe(first.id);

    // Another client, another period, or the cancelled run's slot: all fine.
    await start(flow, { subjectId: secondClientId });
    await start(flow, { periodStart: '2026-11-01', periodEnd: '2026-11-30' });
    await engine.cancelRun(first.id, TEST_USER_ID);
    await start(flow);
    expect(await engine.listRuns(TEST_USER_ID, { definitionId: flow })).toHaveLength(4);
    expect(await engine.listRuns(TEST_USER_ID, { definitionId: flow, status: 'active' })).toHaveLength(3);
    expect(await engine.listRuns(TEST_USER_ID, { definitionId: flow, subjectId: secondClientId })).toHaveLength(1);
  });

  it('a test run mails the owner, leaves the invoice a draft and does not block the real run', async () => {
    const flow = await publishedFlow();
    let run = await start(flow, { test: true });
    expect(run.test_mode).toBe(true);
    const approval = openTask(run, 'approval')!;
    expect(approval.title.startsWith('[Test] ')).toBe(true);
    expect(approval.payload.preview).toEqual(
      expect.arrayContaining([
        { key: 'to', label: 'Recipient', value: 'owner@example.com' },
        { key: 'insteadOf', label: 'Test run: instead of', value: 'kontakt@acme.example' },
      ])
    );
    await engine.settleTask(approval.id, TEST_USER_ID, 'approve');
    run = await reload(run);
    await engine.settleTask(openTask(run, 'upload')!.id, TEST_USER_ID, 'complete', { file: pdf });
    run = await reload(run);
    await engine.settleTask(openTask(run, 'confirm')!.id, TEST_USER_ID, 'complete');
    run = await reload(run);
    await engine.settleTask(openTask(run, 'approval')!.id, TEST_USER_ID, 'approve');
    run = await reload(run);

    expect(run.status).toBe('completed');
    expect(api.sent().map((call) => call.body)).toEqual([
      expect.objectContaining({ to: 'owner@example.com', subjectPrefix: '[Test] ' }),
      expect.objectContaining({ to: 'owner@example.com', subjectPrefix: '[Test] ' }),
    ]);
    expect(api.invoiceStatus).toBe('draft');
    expect(api.calls.find((call) => call.path === `/api/clients/${clientId}/documents`)?.body.title.startsWith('[Test] ')).toBe(true);
    expect(storedDocuments[0].data.title.startsWith('[Test] ')).toBe(true);

    // The real run for the same client and period still starts, and so does a second test.
    await start(flow);
    await start(flow, { test: true });
  });

  it('keeps executing the version it started with', async () => {
    const flow = await publishedFlow();
    let run = await start(flow);
    // Version 2 drops the review; the run under way still gets it.
    const draft = (await definitions.get(flow, TEST_USER_ID))!;
    const graph = draft.graph;
    graph.nodes = graph.nodes.filter((node) => node.id !== 'n_review');
    graph.edges = graph.edges.filter((edge) => edge.id !== 'e_review').map((edge) => (edge.id === 'e_link' ? { ...edge, target: 'n_mail_invoice' } : edge));
    await definitions.update(flow, TEST_USER_ID, { graph });
    expect((await definitions.get(flow, TEST_USER_ID))!.has_unpublished_changes).toBe(true);
    const published = await definitions.publish(flow, TEST_USER_ID);
    expect(published).toMatchObject({ ok: true, definition: { published_version: 2, has_unpublished_changes: false } });

    expect(run.version).toBe(1);
    await engine.settleTask(openTask(run, 'approval')!.id, TEST_USER_ID, 'skip');
    run = await reload(run);
    await engine.settleTask(openTask(run, 'upload')!.id, TEST_USER_ID, 'complete', { file: pdf });
    run = await reload(run);
    expect(openTask(run, 'confirm')).toBeDefined();
    expect(run.graph.nodes.some((node) => node.id === 'n_review')).toBe(true);

    const fresh = await start(flow, { subjectId: secondClientId });
    expect(fresh.version).toBe(2);
    expect(fresh.graph.nodes.some((node) => node.id === 'n_review')).toBe(false);
  });

  it('refuses what cannot start', async () => {
    const draft = await definitions.create(TEST_USER_ID, { name: 'Unpublished', subject_type: 'client' });
    await expect(engine.startRun({ userId: TEST_USER_ID, definitionId: draft.id, subjectId: clientId })).rejects.toThrow('Publish the flow');
    const flow = await publishedFlow();
    await expect(engine.startRun({ userId: TEST_USER_ID, definitionId: flow })).rejects.toThrow('Choose the client');
    await expect(engine.startRun({ userId: TEST_USER_ID, definitionId: flow, subjectId: crypto.randomUUID() })).rejects.toBeInstanceOf(WorkflowNotFoundError);
    await expect(engine.startRun({ userId: OTHER_USER, definitionId: flow, subjectId: clientId })).rejects.toBeInstanceOf(WorkflowNotFoundError);
    await expect(
      engine.startRun({ userId: TEST_USER_ID, definitionId: flow, subjectId: clientId, periodStart: '2026-10-31', periodEnd: '2026-10-01' })
    ).rejects.toThrow('ends before it starts');
    await definitions.setStatus(flow, TEST_USER_ID, 'archived');
    await expect(engine.startRun({ userId: TEST_USER_ID, definitionId: flow, subjectId: clientId })).rejects.toThrow('archived');
  });
});

// ── Restarts ─────────────────────────────────────────────────────────────────

describe('after a restart', () => {
  it('does not repeat an action that may have taken effect, but resumes everything else', async () => {
    const flow = await publishedFlow();
    let mail = await start(flow);
    await engine.settleTask(openTask(mail, 'approval')!.id, TEST_USER_ID, 'approve');
    mail = await reload(mail);
    // Simulate the process dying while the invoice mail was being sent …
    await engine.settleTask(openTask(mail, 'upload')!.id, TEST_USER_ID, 'complete', { file: pdf });
    mail = await reload(mail);
    await engine.settleTask(openTask(mail, 'confirm')!.id, TEST_USER_ID, 'complete');
    mail = await reload(mail);
    const sending = stepOf(mail, 'n_mail_invoice')!;
    await db.query(`UPDATE workflow_steps SET status = 'running' WHERE id = $1`, [sending.id]);
    await db.query(`UPDATE workflow_tasks SET status = 'done' WHERE step_id = $1`, [sending.id]);

    // … and another run while it was only adding up hours (a read).
    const read = await start(flow, { subjectId: secondClientId });
    const sum = stepOf(read, 'n_sum')!;
    await db.query(`DELETE FROM workflow_steps WHERE run_id = $1 AND seq > $2`, [read.id, sum.seq]);
    await db.query(`DELETE FROM workflow_tasks WHERE run_id = $1`, [read.id]);
    await db.query(`UPDATE workflow_steps SET status = 'running', output = NULL, outcome = NULL WHERE id = $1`, [sum.id]);

    const sentBefore = api.sent().length;
    engine = newEngine(); // a fresh process
    await engine.recover();

    mail = await reload(mail);
    expect(api.sent()).toHaveLength(sentBefore);
    expect(mail.status).toBe('incident');
    expect(stepOf(mail, 'n_mail_invoice')).toMatchObject({ status: 'failed' });
    expect(stepOf(mail, 'n_mail_invoice')?.error).toContain('The server stopped while this step was running');
    expect(stepOf(mail, 'n_mail_invoice')?.error_code).toBe('INTERRUPTED');

    const resumed = await reload(read);
    expect(stepOf(resumed, 'n_sum')?.status).toBe('completed');
    expect(resumed.status).toBe('waiting');
    expect(openTask(resumed, 'approval')).toBeDefined();
  });
});

// ── Flows and schedules ──────────────────────────────────────────────────────

describe('flows', () => {
  it('publishes only valid drafts and numbers the versions', async () => {
    const draft = await definitions.create(TEST_USER_ID, { template: 'signed-timesheet-invoice', lang: 'de' });
    expect(draft).toMatchObject({ name: 'Stundennachweis mit Unterschrift', status: 'draft', published_version: null, has_unpublished_changes: true });
    const refused = await definitions.publish(draft.id, TEST_USER_ID);
    expect(refused).toMatchObject({ ok: false });
    expect(refused && !refused.ok && refused.issues.map((issue) => issue.code)).toEqual(['MISSING_INPUT', 'MISSING_INPUT', 'MISSING_INPUT']);
    expect(await definitions.publish(draft.id, OTHER_USER)).toBeNull();
    expect(await definitions.get(draft.id, OTHER_USER)).toBeNull();
    expect(await definitions.update(draft.id, OTHER_USER, { name: 'Mine now' })).toBeNull();
    expect(await definitions.remove(draft.id, OTHER_USER)).toBe('not_found');
  });

  it('cannot be deleted while a run is under way', async () => {
    const flow = await publishedFlow();
    const run = await start(flow, { periodStart: '2026-08-01', periodEnd: '2026-08-31' });
    expect((await definitions.list(TEST_USER_ID)).find((item) => item.id === flow)?.active_runs).toBe(1);
    expect(await definitions.remove(flow, TEST_USER_ID)).toBe('active_runs');
    await engine.cancelRun(run.id, TEST_USER_ID);
    expect(await definitions.remove(flow, TEST_USER_ID)).toBe('deleted');
    expect(await engine.getRun(run.id, TEST_USER_ID)).toBeNull();
  });

  it('starts scheduled flows for each listed client, once per period, and plans the next start', async () => {
    const flow = await publishedFlow((graph) => {
      const startNode = graph.nodes.find((node) => node.id === 'n_start') as any;
      startNode.data = {
        label: 'Monatsende',
        trigger: 'schedule',
        schedule: { dayOfMonth: 'last', period: 'current_month', subjectIds: [clientId, secondClientId, crypto.randomUUID()] },
      };
    });
    const summary = (await definitions.list(TEST_USER_ID)).find((item) => item.id === flow)!;
    expect(summary.next_run_at).not.toBeNull();
    const due = new Date(summary.next_run_at as string);
    expect(due.getUTCHours()).toBe(6);

    // The run for Acme was already started by hand for that month.
    const period = {
      periodStart: new Date(Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), 1)).toISOString().slice(0, 10),
      periodEnd: due.toISOString().slice(0, 10),
    };
    await start(flow, period);

    expect(await engine.fireDueTimers(new Date(due.getTime() + 60_000))).toBe(1);
    const runs = await engine.listRuns(TEST_USER_ID, { definitionId: flow });
    expect(runs.map((run) => [run.subject_label, run.started_by, run.period_start]).sort()).toEqual(
      [
        ['Acme GmbH', 'manual', period.periodStart],
        ['Globex AG', 'schedule', period.periodStart],
      ].sort()
    );
    // The unknown client in the list stopped nothing, and the next month is planned.
    const next = (await definitions.list(TEST_USER_ID)).find((item) => item.id === flow)!;
    expect(new Date(next.next_run_at as string).getTime()).toBeGreaterThan(due.getTime());

    // Pausing drops the pending start; activating plans it again.
    expect((await definitions.setStatus(flow, TEST_USER_ID, 'paused')) as any).toMatchObject({ status: 'paused', next_run_at: null });
    expect(((await definitions.setStatus(flow, TEST_USER_ID, 'active')) as any).next_run_at).not.toBeNull();
  });
});

// ── Forms ────────────────────────────────────────────────────────────────────

describe('forms', () => {
  async function formFlow(): Promise<string> {
    const graph: WorkflowGraph = {
      nodes: [
        { id: 's', type: 'start', position: { x: 0, y: 0 }, data: { trigger: 'manual' } },
        {
          id: 'f', type: 'task', position: { x: 0, y: 0 },
          data: {
            kind: 'form', title: 'Bestelldaten für {{client.name}}',
            fields: [
              { key: 'po', label: 'Bestellnummer', type: 'text', required: true },
              { key: 'hours', label: 'Stunden', type: 'number' },
              { key: 'doc', label: 'Dokument', type: 'text' },
            ],
          },
        },
        { id: 'g', type: 'gateway', position: { x: 0, y: 0 }, data: {} },
        {
          id: 'link', type: 'action', position: { x: 0, y: 0 },
          data: { action: 'document.link', mode: 'auto', input: { documentId: { $ref: 'steps.f.doc' }, documentType: 'other' } },
        },
        { id: 'big', type: 'end', position: { x: 0, y: 0 }, data: { result: 'Groß: {{steps.f.po}}' } },
        { id: 'e', type: 'end', position: { x: 0, y: 0 }, data: { result: 'Bestellung {{steps.f.po}}' } },
      ],
      edges: [
        { id: 'e1', source: 's', target: 'f' },
        { id: 'e2', source: 'f', target: 'g' },
        { id: 'e_big', source: 'g', target: 'big', condition: { match: 'all', rules: [{ left: 'steps.f.hours', op: 'gte', right: 100 }] } },
        { id: 'e_else', source: 'g', target: 'link' },
        { id: 'e4', source: 'link', target: 'e' },
      ],
    };
    const definition = await definitions.create(TEST_USER_ID, { name: `Form ${crypto.randomUUID().slice(0, 8)}`, subject_type: 'client', graph });
    const published = await definitions.publish(definition.id, TEST_USER_ID);
    if (!published?.ok) throw new Error(JSON.stringify(published));
    return definition.id;
  }

  it('checks the values and branches on them', async () => {
    const run = await start(await formFlow());
    const form = openTask(run, 'form')!;
    expect(form.title).toBe('Bestelldaten für Acme GmbH');
    await expect(engine.settleTask(form.id, TEST_USER_ID, 'complete', { values: { hours: 5 } })).rejects.toThrow('"Bestellnummer" is required.');
    await expect(engine.settleTask(form.id, TEST_USER_ID, 'complete', { values: { po: 'PO-1', hours: 'viele' } })).rejects.toThrow('must be a number');
    // The refused attempts left the task open.
    await engine.settleTask(form.id, TEST_USER_ID, 'complete', { values: { po: 'PO-77', hours: '120', extra: 'ignored' } });
    const done = await reload(run);
    expect(stepOf(done, 'f')?.output).toEqual({ po: 'PO-77', hours: 120, doc: null });
    expect(stepOf(done, 'g')?.outcome).toBe('e_big');
    expect(done).toMatchObject({ status: 'completed', result: 'Groß: PO-77' });
  });

  it('a value that ends up in an API path must be an id', async () => {
    let run = await start(await formFlow(), { subjectId: secondClientId });
    await engine.settleTask(openTask(run, 'form')!.id, TEST_USER_ID, 'complete', { values: { po: 'PO-2', doc: '../../invoices/abc' } });
    run = await reload(run);
    expect(run.status).toBe('incident');
    expect(stepOf(run, 'link')).toMatchObject({ error: '"Document" is not a valid id for this run.', error_code: 'INPUT_NOT_ID' });
    expect(api.calls.some((call) => call.method === 'PUT')).toBe(false);
  });
});

// ── Stage 2: events ──────────────────────────────────────────────────────────

describe('events', () => {
  async function newInvoice(client: string = clientId, status = 'draft', createdDaysAgo = 0): Promise<string> {
    const inserted = await db.query(
      `INSERT INTO invoices (user_id, client_id, invoice_number, issue_date, due_date, status, created_at, updated_at)
       VALUES ($1, $2, $3, CURRENT_DATE, CURRENT_DATE + 14, $4, CURRENT_TIMESTAMP - make_interval(days => $5), CURRENT_TIMESTAMP - make_interval(days => $5))
       RETURNING id`,
      [TEST_USER_ID, client, `T-${crypto.randomUUID().slice(0, 8)}`, status, createdDaysAgo]
    );
    return inserted.rows[0].id;
  }
  const setStatus = (invoiceId: string, status: string) => db.query(`UPDATE invoices SET status = $2 WHERE id = $1`, [invoiceId, status]);
  const eventsOf = async (invoiceId: string) =>
    (await db.query(`SELECT type, payload FROM workflow_events WHERE subject_id = $1 ORDER BY created_at, type`, [invoiceId])).rows;

  /** A flow about an invoice: start → note to the owner → end. */
  async function invoiceFlow(start: Record<string, unknown>, middle: any[] = [], result = '{{event.type}}'): Promise<string> {
    const chain = ['s', ...middle.map((node) => node.id), 'note', 'e'];
    const graph: WorkflowGraph = {
      nodes: [
        { id: 's', type: 'start', position: { x: 0, y: 0 }, data: start as any },
        ...middle,
        { id: 'note', type: 'action', position: { x: 0, y: 0 }, data: { action: 'notify.owner', mode: 'auto', input: { message: 'Rechnung {{invoice.number}}', email: false } } },
        { id: 'e', type: 'end', position: { x: 0, y: 0 }, data: { result } },
      ],
      edges: chain.slice(1).map((target, index) => ({ id: `c${index}`, source: chain[index], target })),
    };
    const definition = await definitions.create(TEST_USER_ID, { name: `Event ${crypto.randomUUID().slice(0, 8)}`, subject_type: 'invoice', graph });
    const published = await definitions.publish(definition.id, TEST_USER_ID);
    if (!published?.ok) throw new Error(JSON.stringify(published));
    return definition.id;
  }
  const runsOf = (flow: string) => engine.listRuns(TEST_USER_ID, { definitionId: flow });

  beforeEach(async () => {
    // Events are global, like timers: what earlier tests raised must not be handled here.
    await db.query(`DELETE FROM workflow_events`);
    await db.query(`UPDATE workflow_definitions SET status = 'archived' WHERE user_id = $1 AND subject_type = 'invoice'`, [TEST_USER_ID]);
  });

  it('the database records what happens to an invoice, whoever writes it', async () => {
    const invoiceId = await newInvoice();
    await setStatus(invoiceId, 'sent');
    await db.query(`UPDATE invoices SET notes = 'unverändert wichtig' WHERE id = $1`, [invoiceId]);
    await db.query(`UPDATE invoices SET correction_date = CURRENT_TIMESTAMP, correction_reason = 'Stunden korrigiert' WHERE id = $1`, [invoiceId]);
    await setStatus(invoiceId, 'paid');
    await setStatus(invoiceId, 'paid');
    expect(await eventsOf(invoiceId)).toEqual([
      { type: 'invoice.created', payload: { status: 'draft' } },
      { type: 'invoice.sent', payload: { status: 'sent', previous_status: 'draft' } },
      { type: 'invoice.corrected', payload: { status: 'sent', reason: 'Stunden korrigiert' } },
      { type: 'invoice.paid', payload: { status: 'paid', previous_status: 'sent' } },
    ]);
  });

  it('starts the flows that begin with the event — once, and only for the chosen clients', async () => {
    const onSent = await invoiceFlow({ trigger: 'event', event: { type: 'invoice.sent' } }, [], '{{event.type}} nach {{event.previous_status}}');
    const onSentElsewhere = await invoiceFlow({ trigger: 'event', event: { type: 'invoice.sent', clientIds: [secondClientId] } });
    const onPaid = await invoiceFlow({ trigger: 'event', event: { type: 'invoice.paid' } });

    const invoiceId = await newInvoice();
    await setStatus(invoiceId, 'sent');
    expect(await engine.processEvents()).toBe(2); // created + sent
    expect(await engine.processEvents()).toBe(0);

    const started = await runsOf(onSent);
    expect(started).toHaveLength(1);
    expect(started[0]).toMatchObject({ status: 'completed', started_by: 'event', subject_type: 'invoice', subject_id: invoiceId, result: 'invoice.sent nach draft' });
    expect(await runsOf(onSentElsewhere)).toHaveLength(0);
    expect(await runsOf(onPaid)).toHaveLength(0);
    // The note names the invoice the event was about.
    const run = (await engine.getRun(started[0].id, TEST_USER_ID))!;
    expect(run.tasks[0]).toMatchObject({ kind: 'notice', title: `Rechnung ${run.subject_label}` });

    // Paid later: the other flow gets its run; a paused flow would not.
    await definitions.setStatus(onSent, TEST_USER_ID, 'paused');
    await setStatus(invoiceId, 'paid');
    await setStatus(invoiceId, 'sent');
    await engine.processEvents();
    expect(await runsOf(onPaid)).toHaveLength(1);
    expect(await runsOf(onSent)).toHaveLength(1);
  });

  it('does not treat old invoices as news (a restore, an import)', async () => {
    const onCreated = await invoiceFlow({ trigger: 'event', event: { type: 'invoice.created' } });
    await newInvoice(clientId, 'sent', 3);
    const fresh = await newInvoice();
    await engine.processEvents();
    const runs = await runsOf(onCreated);
    expect(runs.map((run) => run.subject_id)).toEqual([fresh]);
  });

  it('a run waits for an event on its invoice and goes on with what happened', async () => {
    const wait = { id: 'w', type: 'wait', position: { x: 0, y: 0 }, data: { mode: 'event', event: 'invoice.paid', timeoutDays: 30 } };
    const flow = await invoiceFlow({ trigger: 'manual' }, [wait], 'bezahlt, vorher {{steps.w.previous_status}}');
    // A second end for "not paid in time".
    const draft = (await definitions.get(flow, TEST_USER_ID))!;
    draft.graph.nodes.push({ id: 'late', type: 'end', position: { x: 0, y: 0 }, data: { result: 'nicht bezahlt' } });
    draft.graph.edges.push({ id: 'c_late', source: 'w', target: 'late', sourceHandle: 'timeout' });
    await definitions.update(flow, TEST_USER_ID, { graph: draft.graph });
    expect(await definitions.publish(flow, TEST_USER_ID)).toMatchObject({ ok: true });
    const startFor = async (invoiceId: string) =>
      (await engine.getRun(await engine.startRun({ userId: TEST_USER_ID, definitionId: flow, subjectId: invoiceId }), TEST_USER_ID))!;

    // 1. Waits, ignores other events, continues when the invoice is paid.
    const invoiceId = await newInvoice(clientId, 'sent');
    let run = await startFor(invoiceId);
    expect(run).toMatchObject({ status: 'waiting', current_node_label: 'Wait' });
    await db.query(`UPDATE invoices SET correction_date = CURRENT_TIMESTAMP WHERE id = $1`, [invoiceId]);
    await engine.processEvents();
    expect((await reload(run)).status).toBe('waiting');
    await setStatus(invoiceId, 'paid');
    await engine.processEvents();
    run = await reload(run);
    expect(run).toMatchObject({ status: 'completed', result: 'bezahlt, vorher sent' });
    expect(stepOf(run, 'w')?.output).toMatchObject({ event: 'invoice.paid', status: 'paid', previous_status: 'sent' });

    // 2. Already paid when the run gets there: nothing to wait for.
    const paid = await startFor(await newInvoice(secondClientId, 'paid'));
    expect(paid.status).toBe('completed');
    expect(stepOf(paid, 'w')?.output).toMatchObject({ alreadyHappened: true });

    // 3. Not paid in time: out through "timeout" — and a payment after that changes nothing.
    const slowInvoice = await newInvoice(clientId, 'sent');
    let slow = await startFor(slowInvoice);
    expect(await engine.fireDueTimers(new Date(Date.now() + 31 * 86_400_000))).toBe(1);
    slow = await reload(slow);
    expect(slow).toMatchObject({ status: 'completed', result: 'nicht bezahlt' });
    expect(stepOf(slow, 'w')?.outcome).toBe('timeout');
    await setStatus(slowInvoice, 'paid');
    await engine.processEvents();
    expect((await reload(slow)).steps).toHaveLength(slow.steps.length);
  });
});

// ── Stage 2: parallel branches ───────────────────────────────────────────────

describe('parallel branches', () => {
  const confirm = (id: string) => ({ id, type: 'task' as const, position: { x: 0, y: 0 }, data: { kind: 'confirm' as const, title: `Aufgabe ${id}` } });

  async function publish(graph: WorkflowGraph): Promise<string> {
    const definition = await definitions.create(TEST_USER_ID, { name: `Parallel ${crypto.randomUUID().slice(0, 8)}`, subject_type: 'none', graph });
    const published = await definitions.publish(definition.id, TEST_USER_ID);
    if (!published?.ok) throw new Error(JSON.stringify(published));
    return definition.id;
  }
  const startRun = async (flow: string) =>
    (await engine.getRun(await engine.startRun({ userId: TEST_USER_ID, definitionId: flow, ...october, periodStart: undefined, periodEnd: undefined, test: true }), TEST_USER_ID))!;
  const openTaskOf = (run: WorkflowRun, nodeId: string) => run.tasks.find((task) => task.status === 'open' && task.node_id === nodeId)!;

  it('runs both branches and goes on when both have arrived', async () => {
    const flow = await publish({
      nodes: [
        { id: 's', type: 'start', position: { x: 0, y: 0 }, data: { trigger: 'manual' } },
        { id: 'split', type: 'gateway', position: { x: 0, y: 0 }, data: { mode: 'parallel' } },
        confirm('a'),
        confirm('b'),
        { id: 'join', type: 'gateway', position: { x: 0, y: 0 }, data: { mode: 'parallel' } },
        { id: 'e', type: 'end', position: { x: 0, y: 0 }, data: { result: 'beide erledigt' } },
      ],
      edges: [
        { id: 'e1', source: 's', target: 'split' },
        { id: 'e_a', source: 'split', target: 'a' },
        { id: 'e_b', source: 'split', target: 'b' },
        { id: 'e_a2', source: 'a', target: 'join' },
        { id: 'e_b2', source: 'b', target: 'join' },
        { id: 'e2', source: 'join', target: 'e' },
      ],
    });
    let run = await startRun(flow);
    expect(run.status).toBe('waiting');
    expect(run.tasks.filter((task) => task.status === 'open').map((task) => task.node_id).sort()).toEqual(['a', 'b']);

    await engine.settleTask(openTaskOf(run, 'b').id, TEST_USER_ID, 'complete');
    run = await reload(run);
    // One branch is through; the join waits for the other.
    expect(run.status).toBe('waiting');
    expect(stepOf(run, 'join')).toMatchObject({ status: 'waiting', input: { arrived: ['e_b2'] } });
    expect(run.steps.some((step) => step.node_id === 'e')).toBe(false);

    await engine.settleTask(openTaskOf(run, 'a').id, TEST_USER_ID, 'complete');
    run = await reload(run);
    expect(run).toMatchObject({ status: 'completed', result: 'beide erledigt' });
    expect(run.steps.filter((step) => step.node_id === 'join')).toHaveLength(1);
    expect(run.steps.map((step) => step.seq)).toEqual([...run.steps.map((step) => step.seq)].sort((x, y) => x - y));
    expect(new Set(run.steps.map((step) => step.seq)).size).toBe(run.steps.length);
  });

  it('an end closes its branch; the run ends with the last one', async () => {
    const flow = await publish({
      nodes: [
        { id: 's', type: 'start', position: { x: 0, y: 0 }, data: { trigger: 'manual' } },
        { id: 'split', type: 'gateway', position: { x: 0, y: 0 }, data: { mode: 'parallel' } },
        confirm('a'),
        confirm('b'),
        { id: 'end_a', type: 'end', position: { x: 0, y: 0 }, data: { result: 'A fertig' } },
        { id: 'end_b', type: 'end', position: { x: 0, y: 0 }, data: {} },
      ],
      edges: [
        { id: 'e1', source: 's', target: 'split' },
        { id: 'e_a', source: 'split', target: 'a' },
        { id: 'e_b', source: 'split', target: 'b' },
        { id: 'e_a2', source: 'a', target: 'end_a' },
        { id: 'e_b2', source: 'b', target: 'end_b' },
      ],
    });
    let run = await startRun(flow);
    await engine.settleTask(openTaskOf(run, 'a').id, TEST_USER_ID, 'complete');
    run = await reload(run);
    expect(run.status).toBe('waiting');
    expect(openTaskOf(run, 'b')).toBeDefined();
    await engine.settleTask(openTaskOf(run, 'b').id, TEST_USER_ID, 'complete');
    run = await reload(run);
    // The branch that ended without a result does not erase the other's.
    expect(run).toMatchObject({ status: 'completed', result: 'A fertig' });
  });
});
