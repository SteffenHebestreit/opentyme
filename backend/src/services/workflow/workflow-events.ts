/**
 * @fileoverview What can happen to a subject, and how it is recorded.
 *
 * An event is something a flow can start with or wait for. It belongs to a
 * subject type (an invoice is paid, an application gets an answer) and is a
 * row in `workflow_events` until the engine has handled it.
 *
 * OpenTyme's invoice events are written by a database trigger (see
 * workflow-schema.ts), which sees every writer of an invoice. Everything else
 * — above all addons — records its events with emitWorkflowEvent().
 *
 * @module services/workflow/workflow-events
 */

import type { WorkflowEventSpec, WorkflowLocalization, WorkflowOutputSpec } from '../../types/workflow.types';
import { getDbClient } from '../../utils/database';
import { logger } from '../../utils/logger';

export interface WorkflowEventDefinition extends WorkflowEventSpec {
  /**
   * For an event that is a state its subject reaches and keeps (paid,
   * cancelled): has it been reached already? A run that starts waiting for
   * such an event after the fact then continues instead of waiting forever.
   * Return true, or what the event would have carried (`{ status: 'paid' }`).
   */
  reached?: (userId: string, subjectId: string) => Promise<boolean | Record<string, unknown>>;
  /**
   * When the change behind the event was made, where the record knows better
   * than the moment the event was recorded. An event older than a day starts
   * no flow: rows a restore or an import writes are not something that just
   * happened. Without this, the time the event was recorded counts.
   */
  occurredAt?: (userId: string, subjectId: string) => Promise<Date | null>;
  /** Texts in other languages: `{ de: { title, description, outputs: { key: label } } }`. */
  i18n?: Record<string, WorkflowLocalization>;
}

const EVENT_KEY = /^[a-z][a-z0-9_.-]{0,59}$/;
const events = new Map<string, WorkflowEventDefinition>();

export function registerWorkflowEvent(event: WorkflowEventDefinition): void {
  if (!EVENT_KEY.test(event.key)) throw new Error(`"${event.key}" is not a valid workflow event key.`);
  if (events.has(event.key)) logger.warn(`[Workflow] Overwriting event ${event.key}`);
  events.set(event.key, event);
}

export function getWorkflowEvent(key: string | undefined): WorkflowEventDefinition | undefined {
  return key ? events.get(key) : undefined;
}

export function listWorkflowEvents(): WorkflowEventDefinition[] {
  return Array.from(events.values());
}

// ── Recording ────────────────────────────────────────────────────────────────

/** Set by the scheduler: have the engine look for events now instead of at its next tick. */
let nudge: () => void = () => undefined;
export function onWorkflowEventEmitted(listener: () => void): void {
  nudge = listener;
}

export interface EmittedWorkflowEvent {
  /** Owner of the subject — flows of this user react. */
  userId: string;
  /** A registered event key. */
  type: string;
  /** The subject the event happened to (a UUID). */
  subjectId: string;
  /** What the event carries; the keys its definition lists as `output`. */
  payload?: Record<string, unknown>;
}

/**
 * Records that something happened. Flows that start with the event get a run,
 * runs waiting for it continue — within moments, and after a restart if the
 * server stops first.
 */
export async function emitWorkflowEvent(event: EmittedWorkflowEvent): Promise<void> {
  const definition = events.get(event.type);
  if (!definition) throw new Error(`The workflow event "${event.type}" is not registered.`);
  await getDbClient().query(
    `INSERT INTO workflow_events (user_id, type, subject_type, subject_id, payload) VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [event.userId, event.type, definition.subject_type, event.subjectId, JSON.stringify(event.payload ?? {})]
  );
  nudge();
}

// ── OpenTyme's own events: what happens to an invoice ────────────────────────

const STATUS: WorkflowOutputSpec[] = [
  { key: 'status', type: 'string', label: 'Status of the invoice' },
  { key: 'previous_status', type: 'string', label: 'Status before' },
];

/** The invoice is in one of these statuses. */
const invoiceIs =
  (...statuses: string[]) =>
  async (userId: string, invoiceId: string): Promise<false | { status: string }> => {
    const result = await getDbClient().query(`SELECT status FROM invoices WHERE id = $1 AND user_id = $2`, [invoiceId, userId]);
    const status = result.rows[0]?.status;
    return statuses.includes(status) ? { status } : false;
  };

/** The invoice's own timestamp of the change: rows a restore or an import writes carry old ones. */
const invoiceTime =
  (which: 'created' | 'changed') =>
  async (userId: string, invoiceId: string): Promise<Date | null> => {
    const result = await getDbClient().query(`SELECT created_at, updated_at FROM invoices WHERE id = $1 AND user_id = $2`, [invoiceId, userId]);
    const row = result.rows[0];
    if (!row) return null;
    return new Date(which === 'created' ? row.created_at : (row.updated_at ?? row.created_at));
  };

const INVOICE_EVENTS: WorkflowEventDefinition[] = [
  {
    key: 'invoice.created',
    subject_type: 'invoice',
    title: 'Invoice created',
    description: 'A new invoice exists — written by hand, from time entries or from a recurring invoice.',
    output: [{ key: 'status', type: 'string', label: 'Status of the invoice' }],
  },
  {
    key: 'invoice.sent',
    subject_type: 'invoice',
    title: 'Invoice sent',
    description: 'The invoice was marked as sent.',
    output: STATUS,
    reached: invoiceIs('sent', 'partially_paid', 'paid', 'overdue'),
  },
  {
    key: 'invoice.partially_paid',
    subject_type: 'invoice',
    title: 'Part payment received',
    description: 'A payment covers part of the invoice.',
    output: STATUS,
    reached: invoiceIs('partially_paid', 'paid'),
  },
  {
    key: 'invoice.paid',
    subject_type: 'invoice',
    title: 'Invoice paid',
    description: 'The invoice is paid in full.',
    output: STATUS,
    reached: invoiceIs('paid'),
  },
  {
    key: 'invoice.cancelled',
    subject_type: 'invoice',
    title: 'Invoice cancelled',
    description: 'The invoice was cancelled.',
    output: STATUS,
    reached: invoiceIs('cancelled'),
  },
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

for (const event of INVOICE_EVENTS) {
  registerWorkflowEvent({ ...event, occurredAt: invoiceTime(event.key === 'invoice.created' ? 'created' : 'changed') });
}
