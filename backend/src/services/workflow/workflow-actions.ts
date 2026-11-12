/**
 * @fileoverview The catalog of actions a flow can run, and the registry they
 * live in.
 *
 * An action is one feature of OpenTyme, shaped as a task ("create a draft
 * invoice from the period's time entries") rather than as an API call. It
 * declares its input and output for the editor, the permissions it needs —
 * a flow's runs act with the sum of its actions' needs and nothing more —
 * and does its work through the run's API client.
 *
 * Addons add their own with registerWorkflowAction().
 *
 * @module services/workflow/workflow-actions
 */

import type {
  CapabilityKey,
  PermissionLevel,
  ResourceKey,
} from '../auth/api-token-permissions';
import type {
  WorkflowActionSpec,
  WorkflowCatalog,
  WorkflowEventSpec,
  WorkflowOutputSpec,
  WorkflowSubjectType,
  WorkflowTaskKind,
  WorkflowValue,
  WorkflowVariableSpec,
} from '../../types/workflow.types';
import { ClientDocumentType } from '../../models/business/client-document.model';
import { logger } from '../../utils/logger';
import type { WorkflowApi } from './workflow-api';
import { getPath } from './workflow-expression';

export interface WorkflowPermissionNeed {
  resources?: Array<{ key: ResourceKey; level: PermissionLevel }>;
  capabilities?: CapabilityKey[];
}

export interface WorkflowActionContext {
  userId: string;
  runId: string;
  /** Test run: nothing may reach a client, nothing may become final. */
  testMode: boolean;
  /** The run's data: subject, period, owner, earlier steps. */
  data: Record<string, unknown>;
  /** OpenTyme's own API, called with the run's permissions. */
  api: WorkflowApi;
  /** Opens a notice in the owner's task list (blocks nothing). */
  notify: (title: string, description?: string) => Promise<void>;
  /** Mails the owner through the system mailer. */
  mailOwner: (subject: string, text: string) => Promise<void>;
}

export interface WorkflowPreviewRow {
  /** What the row is about — an input field's key, or a row of its own like `attachments`. */
  key?: string;
  /** English fallback for the row's name. */
  label: string;
  value: string;
  /** Set when the value is a fixed sentence the UI can translate. */
  valueKey?: string;
}

export interface WorkflowActionDefinition extends WorkflowActionSpec {
  /** What the action needs for this configuration (unresolved input, as drawn). */
  needs: (config: Record<string, WorkflowValue>) => WorkflowPermissionNeed;
  /** Cross-field check at publish time; returns a message when the configuration cannot work. */
  check?: (config: Record<string, WorkflowValue>) => string | null;
  /** What an approval task shows before the action runs. Defaults to the resolved input. */
  preview?: (input: Record<string, unknown>, ctx: WorkflowActionContext) => Promise<WorkflowPreviewRow[]>;
  execute: (input: Record<string, unknown>, ctx: WorkflowActionContext) => Promise<Record<string, unknown>>;
}

// ── Registry ─────────────────────────────────────────────────────────────────

const actions = new Map<string, WorkflowActionDefinition>();

export function registerWorkflowAction(action: WorkflowActionDefinition): void {
  if (actions.has(action.key)) logger.warn(`[Workflow] Overwriting action ${action.key}`);
  actions.set(action.key, action);
}

export function getWorkflowAction(key: string): WorkflowActionDefinition | undefined {
  return actions.get(key);
}

export function listWorkflowActions(): WorkflowActionDefinition[] {
  return Array.from(actions.values());
}

// ── Input helpers ────────────────────────────────────────────────────────────

function text(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() === '' ? undefined : value.trim();
  if (typeof value === 'number') return String(value);
  return undefined;
}

function required(input: Record<string, unknown>, key: string, what: string): string {
  const value = text(input[key]);
  if (!value) throw new Error(`${what} is missing.`);
  return value;
}

function flag(value: unknown): boolean {
  return value === true || value === 'true';
}

function isSet(value: WorkflowValue | undefined): boolean {
  if (value === undefined || value === null || value === '' || value === false) return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function round2(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}

const testPrefix = (ctx: WorkflowActionContext): string => (ctx.testMode ? '[Test] ' : '');

/** The client a document is filed under: the given one, or the project's. */
async function resolveClientId(input: Record<string, unknown>, ctx: WorkflowActionContext): Promise<string> {
  const clientId = text(input.clientId);
  if (clientId) return clientId;
  const projectId = text(input.projectId);
  if (!projectId) throw new Error('Neither a client nor a project is given.');
  const project = await ctx.api.get<{ client_id?: string }>(`/api/projects/${projectId}`);
  if (!project?.client_id) throw new Error('The project has no client.');
  return project.client_id;
}

interface TimeReport {
  entries: unknown[];
  summary: { total_hours: number; billable_hours: number; billable_value: number };
}

function periodQuery(input: Record<string, unknown>) {
  return {
    start_date: required(input, 'start', 'The start of the period'),
    end_date: required(input, 'end', 'The end of the period'),
    client_id: text(input.clientId),
    project_id: text(input.projectId),
  };
}

async function markInvoiceSent(ctx: WorkflowActionContext, invoiceId: string): Promise<string> {
  const invoice = await ctx.api.get<{ client_id: string; status: string; currency: string }>(`/api/invoices/${invoiceId}`);
  if (invoice.status !== 'draft') return invoice.status;
  // The update route needs client_id and would default a missing currency, so both go along unchanged.
  await ctx.api.put(`/api/invoices/${invoiceId}`, {
    client_id: invoice.client_id,
    currency: invoice.currency,
    status: 'sent',
  });
  return 'sent';
}

/** Scalars of the run's data as `client.name`-style template variables. */
function templateVariables(data: Record<string, unknown>): Record<string, string> {
  const variables: Record<string, string> = {};
  for (const group of ['client', 'project', 'invoice', 'period', 'owner']) {
    const values = getPath(data, group);
    if (!values || typeof values !== 'object') continue;
    for (const [key, value] of Object.entries(values as Record<string, unknown>)) {
      if (value !== null && value !== undefined && typeof value !== 'object') variables[`${group}.${key}`] = String(value);
    }
  }
  return variables;
}

function idList(value: unknown): string[] {
  const list = Array.isArray(value) ? value : value === null || value === undefined ? [] : [value];
  return list.map((item) => text(item)).filter((item): item is string => !!item);
}

// ── Built-in actions (stage 1: billing) ──────────────────────────────────────

const clientField = { key: 'clientId', type: 'client' as const, label: 'Client', default: { $ref: 'client.id' } };
const projectField = { key: 'projectId', type: 'project' as const, label: 'Project (optional)' };
const startField = { key: 'start', type: 'date' as const, label: 'From', required: true, default: { $ref: 'period.start' } };
const endField = { key: 'end', type: 'date' as const, label: 'Until', required: true, default: { $ref: 'period.end' } };

const needsClientOrProject = (config: Record<string, WorkflowValue>): string | null =>
  isSet(config.clientId) || isSet(config.projectId) ? null : 'Choose a client or a project.';

/** The PDFs an invoice has, and what the filed copy is called. */
const INVOICE_DOCUMENTS: Record<string, { route: string; title: string; file: string }> = {
  invoice: { route: 'pdf', title: 'Rechnung', file: 'invoice' },
  cancellation: { route: 'storno-pdf', title: 'Stornorechnung', file: 'cancellation' },
  correction: { route: 'correction-pdf', title: 'Rechnungskorrektur', file: 'correction' },
};

const BUILT_IN: WorkflowActionDefinition[] = [
  {
    key: 'time.summarize',
    category: 'time',
    title: 'Summarise time entries',
    description: 'Adds up the hours logged in the period, e.g. to skip a month without work.',
    effect: 'read',
    defaultMode: 'auto',
    input: [clientField, projectField, startField, endField],
    output: [
      { key: 'totalHours', type: 'number', label: 'Hours in total' },
      { key: 'billableHours', type: 'number', label: 'Billable hours' },
      { key: 'entryCount', type: 'number', label: 'Number of entries' },
      { key: 'billableValue', type: 'number', label: 'Billable value' },
    ],
    needs: () => ({ resources: [{ key: 'reports', level: 'read' }] }),
    execute: async (input, ctx) => {
      const report = await ctx.api.get<TimeReport>('/api/reports/time-tracking', periodQuery(input));
      return {
        totalHours: round2(report.summary?.total_hours),
        billableHours: round2(report.summary?.billable_hours),
        entryCount: report.entries?.length ?? 0,
        billableValue: round2(report.summary?.billable_value),
      };
    },
  },
  {
    key: 'timesheet.generate',
    category: 'time',
    title: 'Create timesheet',
    description: "Creates the period's timesheet as a PDF and files it with the client's documents.",
    effect: 'write',
    defaultMode: 'auto',
    input: [
      clientField,
      projectField,
      startField,
      endField,
      { key: 'hidePrices', type: 'boolean', label: 'Without rates and amounts', default: true },
      { key: 'lang', type: 'select', label: 'Language', options: ['de', 'en'], default: 'de' },
      { key: 'title', type: 'string', label: 'Document title (optional)' },
    ],
    output: [
      { key: 'documentId', type: 'document', label: 'Timesheet' },
      { key: 'filename', type: 'string', label: 'File name' },
      { key: 'totalHours', type: 'number', label: 'Hours in total' },
    ],
    needs: (config) => ({
      resources: [
        { key: 'reports', level: 'read' },
        { key: 'clients', level: 'write' },
        ...(isSet(config.clientId) ? [] : [{ key: 'projects' as const, level: 'read' as const }]),
      ],
    }),
    check: needsClientOrProject,
    execute: async (input, ctx) => {
      const clientId = await resolveClientId(input, ctx);
      const query = periodQuery(input);
      const lang = text(input.lang) === 'en' ? 'en' : 'de';
      const report = await ctx.api.get<TimeReport>('/api/reports/time-tracking', query);
      const pdf = await ctx.api.getBinary('/api/reports/time-tracking/pdf', {
        ...query,
        lang,
        hide_prices: flag(input.hidePrices) ? 'true' : 'false',
      });
      const fallbackTitle = `${lang === 'en' ? 'Timesheet' : 'Stundennachweis'} ${query.start_date} – ${query.end_date}`;
      const document = await ctx.api.upload<{ id: string; file_filename: string }>(
        `/api/clients/${clientId}/documents`,
        {
          title: `${testPrefix(ctx)}${text(input.title) ?? fallbackTitle}`.slice(0, 255),
          document_type: ClientDocumentType.TIMESHEET,
          project_id: query.project_id,
          period_start: query.start_date,
          period_end: query.end_date,
        },
        {
          field: 'document',
          buffer: pdf,
          filename: `timesheet-${query.start_date}_${query.end_date}.pdf`,
          contentType: 'application/pdf',
        }
      );
      return {
        documentId: document.id,
        filename: document.file_filename,
        totalHours: round2(report.summary?.total_hours),
      };
    },
  },
  {
    key: 'invoice.createDraft',
    category: 'invoice',
    title: 'Create draft invoice',
    description: "Creates a draft invoice from the period's billable time entries.",
    effect: 'write',
    defaultMode: 'auto',
    input: [clientField, projectField, startField, endField, { key: 'headline', type: 'string', label: 'Headline (optional)' }],
    output: [
      { key: 'invoiceId', type: 'invoice', label: 'Invoice' },
      { key: 'invoiceNumber', type: 'string', label: 'Invoice number' },
      { key: 'total', type: 'number', label: 'Total' },
    ],
    needs: () => ({ resources: [{ key: 'invoices', level: 'write' }] }),
    check: needsClientOrProject,
    execute: async (input, ctx) => {
      const query = periodQuery(input);
      const created = await ctx.api.post<{ invoice: { id: string; invoice_number: string; total_amount: unknown } }>(
        '/api/invoices/generate-from-time-entries',
        {
          client_id: query.client_id ?? null,
          project_id: query.project_id ?? null,
          start_date: query.start_date,
          end_date: query.end_date,
          ...(text(input.headline) ? { invoice_headline: text(input.headline) } : {}),
        }
      );
      return {
        invoiceId: created.invoice.id,
        invoiceNumber: created.invoice.invoice_number,
        total: round2(created.invoice.total_amount),
      };
    },
  },
  {
    key: 'invoice.pdf',
    category: 'invoice',
    title: 'File invoice PDF',
    description: "Creates the invoice's PDF — or its cancellation or correction document — and files it with the client's documents.",
    effect: 'write',
    defaultMode: 'auto',
    input: [
      { key: 'invoiceId', type: 'invoice', label: 'Invoice', required: true },
      { key: 'kind', type: 'select', label: 'Document', options: ['invoice', 'cancellation', 'correction'], default: 'invoice' },
      { key: 'zugferd', type: 'boolean', label: 'As e-invoice (ZUGFeRD)', default: false },
    ],
    output: [
      { key: 'documentId', type: 'document', label: 'Invoice PDF' },
      { key: 'filename', type: 'string', label: 'File name' },
    ],
    needs: () => ({
      resources: [
        { key: 'invoices', level: 'read' },
        { key: 'clients', level: 'write' },
      ],
    }),
    execute: async (input, ctx) => {
      const invoiceId = required(input, 'invoiceId', 'The invoice');
      const invoice = await ctx.api.get<{ client_id: string; invoice_number: string }>(`/api/invoices/${invoiceId}`);
      const kind = INVOICE_DOCUMENTS[text(input.kind) ?? 'invoice'] ?? INVOICE_DOCUMENTS.invoice;
      const pdf = await ctx.api.getBinary(
        `/api/invoices/${invoiceId}/${kind.route}`,
        kind === INVOICE_DOCUMENTS.invoice && flag(input.zugferd) ? { zugferd: 'true' } : {}
      );
      const document = await ctx.api.upload<{ id: string; file_filename: string }>(
        `/api/clients/${invoice.client_id}/documents`,
        {
          title: `${testPrefix(ctx)}${kind.title} ${invoice.invoice_number}`.slice(0, 255),
          document_type: ClientDocumentType.OTHER,
          invoice_id: invoiceId,
        },
        { field: 'document', buffer: pdf, filename: `${kind.file}-${invoice.invoice_number}.pdf`, contentType: 'application/pdf' }
      );
      return { documentId: document.id, filename: document.file_filename };
    },
  },
  {
    key: 'email.send',
    category: 'communication',
    title: 'Send email',
    description: 'Sends an email from a template, with an invoice and filed documents attached.',
    effect: 'external',
    defaultMode: 'approval',
    input: [
      { key: 'to', type: 'email', label: 'Recipient', required: true, default: { $ref: 'client.invoice_email' } },
      { key: 'templateId', type: 'emailTemplate', label: 'Email template', required: true },
      { key: 'attachInvoiceId', type: 'invoice', label: 'Attach invoice (optional)' },
      { key: 'attachDocumentIds', type: 'documents', label: 'Attach documents (optional)' },
      { key: 'markInvoiceSent', type: 'boolean', label: 'Mark the invoice as sent afterwards', default: false },
    ],
    output: [
      { key: 'messageId', type: 'string', label: 'Message id' },
      { key: 'to', type: 'email', label: 'Recipient' },
    ],
    needs: (config) => ({
      capabilities: ['email_send'],
      resources: [
        { key: 'templates', level: 'read' },
        ...(isSet(config.attachInvoiceId)
          ? [{ key: 'invoices' as const, level: isSet(config.markInvoiceSent) ? ('write' as const) : ('read' as const) }]
          : []),
        ...(isSet(config.attachDocumentIds) ? [{ key: 'clients' as const, level: 'read' as const }] : []),
      ],
    }),
    check: (config) =>
      isSet(config.markInvoiceSent) && !isSet(config.attachInvoiceId)
        ? 'To mark an invoice as sent, attach that invoice.'
        : null,
    preview: async (input, ctx) => {
      const rows: WorkflowPreviewRow[] = [];
      const to = text(input.to) ?? '';
      if (ctx.testMode) {
        rows.push({ key: 'to', label: 'Recipient', value: String(getPath(ctx.data, 'owner.email') ?? '') });
        rows.push({ key: 'insteadOf', label: 'Test run: instead of', value: to });
      } else {
        rows.push({ key: 'to', label: 'Recipient', value: to });
      }
      const invoiceId = text(input.attachInvoiceId);
      const invoice = invoiceId
        ? await ctx.api.get<{ invoice_number?: string }>(`/api/invoices/${invoiceId}`).catch(() => null)
        : null;
      const templateId = text(input.templateId);
      if (templateId) {
        const found = await ctx.api
          .get<{ template?: { name?: string; subject?: string } }>(`/api/email-templates/${templateId}`)
          .catch(() => null);
        const template = found?.template;
        rows.push({ key: 'template', label: 'Template', value: template?.name ?? templateId });
        if (template?.subject) {
          // As it will read: the run's data filled in; what only the send route knows stays a placeholder.
          const known: Record<string, string> = {
            ...templateVariables(ctx.data),
            ...(invoice?.invoice_number ? { 'invoice.number': invoice.invoice_number } : {}),
          };
          const subject = template.subject.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (placeholder, name: string) => known[name] ?? placeholder);
          rows.push({ key: 'subject', label: 'Subject', value: `${testPrefix(ctx)}${subject}` });
        }
      }
      const attachments: string[] = [];
      if (invoiceId) {
        // The name the PDF is attached under.
        attachments.push(`invoice-${invoice?.invoice_number ?? invoiceId}.pdf`);
      }
      for (const documentId of idList(input.attachDocumentIds)) {
        const document = await ctx.api
          .get<{ title?: string; file_filename?: string }>(`/api/clients/documents/${documentId}`)
          .catch(() => null);
        attachments.push(document?.title ?? document?.file_filename ?? documentId);
      }
      rows.push({ key: 'attachments', label: 'Attachments', value: attachments.length > 0 ? attachments.join(', ') : '—' });
      if (flag(input.markInvoiceSent) && invoiceId && !ctx.testMode) {
        rows.push({ key: 'afterwards', label: 'Afterwards', value: 'The invoice is marked as sent.', valueKey: 'invoiceMarkedSent' });
      }
      return rows;
    },
    execute: async (input, ctx) => {
      const ownerEmail = text(getPath(ctx.data, 'owner.email'));
      if (ctx.testMode && !ownerEmail) throw new Error('A test run mails you instead of the client, but your account has no email address.');
      const to = ctx.testMode ? (ownerEmail as string) : required(input, 'to', 'The recipient');
      const invoiceId = text(input.attachInvoiceId);
      const attachments: Array<Record<string, string>> = [];
      if (invoiceId) attachments.push({ type: 'invoice', invoiceId });
      for (const documentId of idList(input.attachDocumentIds)) attachments.push({ type: 'document', documentId });

      const sent = await ctx.api.post<{ messageId?: string }>('/api/email/send', {
        to,
        templateId: required(input, 'templateId', 'The email template'),
        variables: templateVariables(ctx.data),
        attachments,
        ...(ctx.testMode ? { subjectPrefix: '[Test] ' } : {}),
      });
      if (flag(input.markInvoiceSent) && invoiceId && !ctx.testMode) await markInvoiceSent(ctx, invoiceId);
      return { messageId: sent?.messageId ?? null, to };
    },
  },
  {
    key: 'invoice.markSent',
    category: 'invoice',
    title: 'Mark invoice as sent',
    description: 'Sets a draft invoice to "sent" (e.g. after uploading it to a portal yourself).',
    effect: 'write',
    defaultMode: 'auto',
    input: [{ key: 'invoiceId', type: 'invoice', label: 'Invoice', required: true }],
    output: [{ key: 'status', type: 'string', label: 'Status' }],
    needs: () => ({ resources: [{ key: 'invoices', level: 'write' }] }),
    execute: async (input, ctx) => {
      const invoiceId = required(input, 'invoiceId', 'The invoice');
      if (ctx.testMode) return { status: 'draft', skipped: 'test run' };
      return { status: await markInvoiceSent(ctx, invoiceId) };
    },
  },
  {
    key: 'invoice.cancel',
    category: 'invoice',
    title: 'Cancel invoice',
    description: 'Cancels the invoice. This cannot be undone.',
    // Not "write": like a mail, a cancellation is not something to repeat or to run unseen.
    effect: 'external',
    defaultMode: 'approval',
    input: [{ key: 'invoiceId', type: 'invoice', label: 'Invoice', required: true }],
    output: [{ key: 'status', type: 'string', label: 'Status' }],
    needs: () => ({ resources: [{ key: 'invoices', level: 'delete' }] }),
    execute: async (input, ctx) => {
      const invoiceId = required(input, 'invoiceId', 'The invoice');
      const invoice = await ctx.api.get<{ status: string }>(`/api/invoices/${invoiceId}`);
      if (invoice.status === 'cancelled') return { status: 'cancelled' };
      if (ctx.testMode) return { status: invoice.status, skipped: 'test run' };
      await ctx.api.patch(`/api/invoices/${invoiceId}/cancel`);
      return { status: 'cancelled' };
    },
  },
  {
    key: 'document.link',
    category: 'documents',
    title: 'Assign document',
    description: 'Ties a filed document to an invoice and sets its type.',
    effect: 'write',
    defaultMode: 'auto',
    input: [
      { key: 'documentId', type: 'document', label: 'Document', required: true },
      { key: 'invoiceId', type: 'invoice', label: 'Invoice (optional)' },
      { key: 'documentType', type: 'documentType', label: 'Type (optional)' },
    ],
    output: [{ key: 'documentId', type: 'document', label: 'Document' }],
    needs: () => ({ resources: [{ key: 'clients', level: 'write' }] }),
    check: (config) =>
      isSet(config.invoiceId) || isSet(config.documentType) ? null : 'Choose an invoice or a type to assign.',
    execute: async (input, ctx) => {
      const documentId = required(input, 'documentId', 'The document');
      await ctx.api.put(`/api/clients/documents/${documentId}`, {
        ...(text(input.invoiceId) ? { invoice_id: text(input.invoiceId) } : {}),
        ...(text(input.documentType) ? { document_type: text(input.documentType) } : {}),
      });
      return { documentId };
    },
  },
  {
    key: 'notify.owner',
    category: 'communication',
    title: 'Notify me',
    description: 'Puts a note into your task list, and mails it to you if you like.',
    effect: 'write',
    defaultMode: 'auto',
    input: [
      { key: 'message', type: 'text', label: 'Message', required: true },
      { key: 'email', type: 'boolean', label: 'Also by email', default: false },
    ],
    output: [],
    needs: () => ({}),
    execute: async (input, ctx) => {
      const message = required(input, 'message', 'The message');
      const [title, ...rest] = message.split('\n');
      await ctx.notify(`${testPrefix(ctx)}${title}`.slice(0, 500), rest.join('\n').trim() || undefined);
      if (flag(input.email)) await ctx.mailOwner(`${testPrefix(ctx)}${title}`.slice(0, 200), message);
      return {};
    },
  },
];

for (const action of BUILT_IN) registerWorkflowAction(action);

// ── Catalog ──────────────────────────────────────────────────────────────────

const COMMON_VARIABLES: WorkflowVariableSpec[] = [
  { path: 'period.start', type: 'date', label: 'Period: first day' },
  { path: 'period.end', type: 'date', label: 'Period: last day' },
  { path: 'period.label', type: 'string', label: 'Period: name (e.g. 2026-10)' },
  { path: 'owner.email', type: 'email', label: 'My email address' },
  { path: 'owner.name', type: 'string', label: 'My name' },
  { path: 'today', type: 'date', label: 'Today' },
];

const CLIENT_VARIABLES: WorkflowVariableSpec[] = [
  { path: 'client.id', type: 'client', label: 'Client' },
  { path: 'client.name', type: 'string', label: 'Client: name' },
  { path: 'client.invoice_email', type: 'email', label: 'Client: invoice email address' },
  { path: 'client.email', type: 'email', label: 'Client: contact email address' },
  { path: 'client.contact_person', type: 'string', label: 'Client: contact person' },
];

const PROJECT_VARIABLES: WorkflowVariableSpec[] = [
  { path: 'project.id', type: 'project', label: 'Project' },
  { path: 'project.name', type: 'string', label: 'Project: name' },
];

const INVOICE_VARIABLES: WorkflowVariableSpec[] = [
  { path: 'invoice.id', type: 'invoice', label: 'Invoice' },
  { path: 'invoice.number', type: 'string', label: 'Invoice: number' },
  { path: 'invoice.total', type: 'number', label: 'Invoice: total' },
  { path: 'invoice.status', type: 'string', label: 'Invoice: status' },
];

export const SUBJECT_VARIABLES: Record<WorkflowSubjectType, WorkflowVariableSpec[]> = {
  client: [...CLIENT_VARIABLES, ...COMMON_VARIABLES],
  project: [...PROJECT_VARIABLES, ...CLIENT_VARIABLES, ...COMMON_VARIABLES],
  invoice: [...INVOICE_VARIABLES, ...CLIENT_VARIABLES, ...PROJECT_VARIABLES, ...COMMON_VARIABLES],
  none: COMMON_VARIABLES,
};

const EVENT_STATUS: WorkflowOutputSpec[] = [
  { key: 'status', type: 'string', label: 'Status of the invoice' },
  { key: 'previous_status', type: 'string', label: 'Status before' },
];

/** What can happen to an invoice. Recorded by the database trigger in workflow-schema.ts. */
export const WORKFLOW_EVENTS: WorkflowEventSpec[] = [
  {
    key: 'invoice.created',
    subject_type: 'invoice',
    title: 'Invoice created',
    description: 'A new invoice exists — written by hand, from time entries or from a recurring invoice.',
    output: [{ key: 'status', type: 'string', label: 'Status of the invoice' }],
  },
  { key: 'invoice.sent', subject_type: 'invoice', title: 'Invoice sent', description: 'The invoice was marked as sent.', output: EVENT_STATUS },
  {
    key: 'invoice.partially_paid',
    subject_type: 'invoice',
    title: 'Part payment received',
    description: 'A payment covers part of the invoice.',
    output: EVENT_STATUS,
  },
  { key: 'invoice.paid', subject_type: 'invoice', title: 'Invoice paid', description: 'The invoice is paid in full.', output: EVENT_STATUS },
  { key: 'invoice.cancelled', subject_type: 'invoice', title: 'Invoice cancelled', description: 'The invoice was cancelled.', output: EVENT_STATUS },
  {
    key: 'invoice.corrected',
    subject_type: 'invoice',
    title: 'Invoice corrected',
    description: 'A correction of the invoice was saved.',
    output: [
      { key: 'status', type: 'string', label: 'Status of the invoice' },
      { key: 'reason', type: 'string', label: 'Reason for the correction' },
    ],
  },
];

export function getWorkflowEvent(key: string | undefined): WorkflowEventSpec | undefined {
  return WORKFLOW_EVENTS.find((event) => event.key === key);
}

export const TASK_OUTPUTS: Record<WorkflowTaskKind, WorkflowOutputSpec[]> = {
  confirm: [{ key: 'comment', type: 'string', label: 'Comment' }],
  upload: [
    { key: 'documentId', type: 'document', label: 'Uploaded document' },
    { key: 'filename', type: 'string', label: 'File name' },
  ],
  form: [],
};

export const WORKFLOW_DOCUMENT_TYPES: string[] = Object.values(ClientDocumentType);

function toSpec(action: WorkflowActionDefinition): WorkflowActionSpec {
  const { key, category, title, description, effect, defaultMode, input, output } = action;
  return { key, category, title, description, effect, defaultMode, input, output };
}

export function buildWorkflowCatalog(): WorkflowCatalog {
  return {
    actions: listWorkflowActions().map(toSpec),
    events: WORKFLOW_EVENTS,
    variables: SUBJECT_VARIABLES,
    taskOutputs: TASK_OUTPUTS,
    documentTypes: WORKFLOW_DOCUMENT_TYPES,
  };
}
