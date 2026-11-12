/**
 * @fileoverview What a flow can be about, and the registry those subjects
 * live in.
 *
 * A subject is the record a run is started for: it is loaded once at the
 * start (scoped to the flow's owner), named in lists, and contributes run
 * data (`client.name`, `invoice.number` …) that nodes can refer to. OpenTyme's
 * own subjects — client, project, invoice — are registered here like any
 * other; an addon adds its own with registerWorkflowSubject() and the engine,
 * the validation and the editor pick it up from the registry.
 *
 * `none` is not a subject but the absence of one: a flow started by hand
 * that is about nothing in particular.
 *
 * @module services/workflow/workflow-subjects
 */

import type { WorkflowLocalization, WorkflowSubjectSpec, WorkflowVariableSpec } from '../../types/workflow.types';
import { getDbClient } from '../../utils/database';
import { logger } from '../../utils/logger';

export interface WorkflowSubjectOption {
  id: string;
  label: string;
}

export interface LoadedWorkflowSubject {
  id: string;
  /** How the subject is named in lists of runs and tasks. */
  label: string;
  /** Run data, keyed by its first path segment: `{ client: { id, name, … } }`. */
  blocks: Record<string, unknown>;
}

export interface WorkflowSubjectDefinition extends WorkflowSubjectSpec {
  /** Run data a run about this subject has, besides what every run has. Paths start with a key of `blocks`. */
  variables: WorkflowVariableSpec[];
  /** The subject for its owner — null when it does not exist or is not theirs. Ids are UUIDs. */
  load: (userId: string, id: string) => Promise<LoadedWorkflowSubject | null>;
  /** The owner's subjects for pickers (start dialog, scheduled starts), newest or most relevant first. */
  options: (userId: string, search?: string) => Promise<WorkflowSubjectOption[]>;
  /** Titles in other languages: `{ de: { title: 'Bewerbung' } }`. */
  i18n?: Record<string, WorkflowLocalization>;
}

/** Subject keys: lower case, addons prefix theirs (`applications.application`). */
const SUBJECT_KEY = /^[a-z][a-z0-9_.-]{0,59}$/;
const OPTION_LIMIT = 200;

const subjects = new Map<string, WorkflowSubjectDefinition>();

export function registerWorkflowSubject(subject: WorkflowSubjectDefinition): void {
  if (!SUBJECT_KEY.test(subject.key) || subject.key === 'none') {
    throw new Error(`"${subject.key}" is not a valid workflow subject key.`);
  }
  if (subjects.has(subject.key)) logger.warn(`[Workflow] Overwriting subject ${subject.key}`);
  subjects.set(subject.key, subject);
}

export function getWorkflowSubject(key: string | undefined): WorkflowSubjectDefinition | undefined {
  return key ? subjects.get(key) : undefined;
}

export function listWorkflowSubjects(): WorkflowSubjectDefinition[] {
  return Array.from(subjects.values());
}

/** Whether flows can be about this: a registered subject, or nothing (`none`). */
export function isWorkflowSubjectType(key: unknown): key is string {
  return key === 'none' || (typeof key === 'string' && subjects.has(key));
}

// ── Run data ─────────────────────────────────────────────────────────────────

/** What every run has, whatever it is about. */
export const COMMON_VARIABLES: WorkflowVariableSpec[] = [
  { path: 'period.start', type: 'date', label: 'Period: first day' },
  { path: 'period.end', type: 'date', label: 'Period: last day' },
  { path: 'period.label', type: 'string', label: 'Period: name (e.g. 2026-10)' },
  { path: 'owner.email', type: 'email', label: 'My email address' },
  { path: 'owner.name', type: 'string', label: 'My name' },
  { path: 'today', type: 'date', label: 'Today' },
];

/** The run data of a flow about `subjectType` — undefined when that subject is not registered. */
export function subjectVariables(subjectType: string): WorkflowVariableSpec[] | undefined {
  if (subjectType === 'none') return COMMON_VARIABLES;
  const subject = subjects.get(subjectType);
  return subject ? [...subject.variables, ...COMMON_VARIABLES] : undefined;
}

// ── OpenTyme's own subjects ──────────────────────────────────────────────────

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

const CLIENT_COLUMNS = `c.id AS client_id, c.name AS client_name, c.email AS client_email,
  c.billing_email AS client_billing_email, c.contact_person AS client_contact_person`;

interface Row {
  [column: string]: unknown;
}

const clientBlock = (row: Row) => ({
  id: row.client_id,
  name: row.client_name,
  email: row.client_email ?? '',
  // Where invoices go: the billing address if there is one, else the contact address.
  invoice_email: row.client_billing_email || row.client_email || '',
  contact_person: row.client_contact_person ?? '',
});

const like = (search?: string): string => `%${(search ?? '').trim().replace(/[%_\\]/g, '\\$&')}%`;

registerWorkflowSubject({
  key: 'client',
  title: 'Client',
  schedulable: true,
  variables: CLIENT_VARIABLES,
  load: async (userId, id) => {
    const result = await getDbClient().query(`SELECT ${CLIENT_COLUMNS} FROM clients c WHERE c.id = $1 AND c.user_id = $2`, [id, userId]);
    const row = result.rows[0] as Row | undefined;
    return row ? { id, label: String(row.client_name), blocks: { client: clientBlock(row) } } : null;
  },
  options: async (userId, search) => {
    const result = await getDbClient().query(
      `SELECT id, name FROM clients WHERE user_id = $1 AND name ILIKE $2 ORDER BY lower(name) LIMIT ${OPTION_LIMIT}`,
      [userId, like(search)]
    );
    return result.rows.map((row) => ({ id: row.id, label: row.name }));
  },
});

registerWorkflowSubject({
  key: 'project',
  title: 'Project',
  schedulable: true,
  variables: [...PROJECT_VARIABLES, ...CLIENT_VARIABLES],
  load: async (userId, id) => {
    const result = await getDbClient().query(
      `SELECT p.id, p.name, ${CLIENT_COLUMNS} FROM projects p JOIN clients c ON c.id = p.client_id
       WHERE p.id = $1 AND p.user_id = $2`,
      [id, userId]
    );
    const row = result.rows[0] as Row | undefined;
    if (!row) return null;
    return { id, label: String(row.name), blocks: { project: { id: row.id, name: row.name }, client: clientBlock(row) } };
  },
  options: async (userId, search) => {
    const result = await getDbClient().query(
      `SELECT p.id, p.name, c.name AS client_name FROM projects p JOIN clients c ON c.id = p.client_id
       WHERE p.user_id = $1 AND (p.name ILIKE $2 OR c.name ILIKE $2) ORDER BY lower(p.name) LIMIT ${OPTION_LIMIT}`,
      [userId, like(search)]
    );
    return result.rows.map((row) => ({ id: row.id, label: `${row.name} · ${row.client_name}` }));
  },
});

registerWorkflowSubject({
  key: 'invoice',
  title: 'Invoice',
  // A scheduled start runs for a fixed list of subjects; invoices come and go.
  schedulable: false,
  variables: [...INVOICE_VARIABLES, ...CLIENT_VARIABLES, ...PROJECT_VARIABLES],
  load: async (userId, id) => {
    const result = await getDbClient().query(
      `SELECT i.id, i.invoice_number, i.total_amount, i.status, i.project_id, p.name AS project_name, ${CLIENT_COLUMNS}
       FROM invoices i JOIN clients c ON c.id = i.client_id LEFT JOIN projects p ON p.id = i.project_id
       WHERE i.id = $1 AND i.user_id = $2`,
      [id, userId]
    );
    const row = result.rows[0] as Row | undefined;
    if (!row) return null;
    return {
      id,
      label: String(row.invoice_number),
      blocks: {
        invoice: { id: row.id, number: row.invoice_number, total: Number(row.total_amount), status: row.status },
        client: clientBlock(row),
        ...(row.project_id ? { project: { id: row.project_id, name: row.project_name } } : {}),
      },
    };
  },
  options: async (userId, search) => {
    const result = await getDbClient().query(
      `SELECT i.id, i.invoice_number, c.name AS client_name FROM invoices i JOIN clients c ON c.id = i.client_id
       WHERE i.user_id = $1 AND (i.invoice_number ILIKE $2 OR c.name ILIKE $2)
       ORDER BY i.issue_date DESC, i.invoice_number DESC LIMIT ${OPTION_LIMIT}`,
      [userId, like(search)]
    );
    return result.rows.map((row) => ({ id: row.id, label: `${row.invoice_number} · ${row.client_name}` }));
  },
});
