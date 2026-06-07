/**
 * @fileoverview Recurring invoice (retainer) service.
 *
 * Manages recurring-invoice schedule templates and generates DRAFT invoices on
 * their cadence. Generated invoices are always created as drafts so the owner
 * reviews them before sending — nothing is dispatched automatically.
 *
 * @module services/financial/recurring-invoice.service
 */

import { getDbClient } from '../../utils/database';
import { logger } from '../../utils/logger';
import { InvoiceService } from './invoice.service';
import {
  CreateRecurringInvoiceDto,
  UpdateRecurringInvoiceDto,
  RecurringInvoice,
  RecurringInvoiceFrequency,
} from '../../models/financial/recurring-invoice.model';

/** Return today's date as a YYYY-MM-DD string (server local date). */
function todayStr(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split('T')[0];
}

/**
 * node-pg returns `date` columns as JS Date objects; normalise them to
 * YYYY-MM-DD strings so the string-based occurrence math and API output stay
 * consistent.
 */
function toDateStr(val: any): string | null {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().split('T')[0];
  return String(val).split('T')[0];
}

/** Normalise a recurring_invoices row's date columns to YYYY-MM-DD strings. */
function mapRow(row: any): RecurringInvoice {
  if (!row) return row;
  return {
    ...row,
    start_date: toDateStr(row.start_date) as string,
    end_date: toDateStr(row.end_date),
    next_occurrence: toDateStr(row.next_occurrence),
  };
}

/** Add N days to a YYYY-MM-DD string, returning a YYYY-MM-DD string. */
function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

/**
 * Advance a YYYY-MM-DD date by one period of the given frequency.
 * Clamps the day-of-month to the target month's last day (e.g. Jan 31 -> Feb 28).
 */
function advanceOccurrence(dateStr: string, frequency: RecurringInvoiceFrequency): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const day = d.getUTCDate();
  let monthsToAdd = 0;
  if (frequency === 'monthly') monthsToAdd = 1;
  else if (frequency === 'quarterly') monthsToAdd = 3;
  else monthsToAdd = 12;

  // Move to the first of the target month, then clamp the day.
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + monthsToAdd, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().split('T')[0];
}

/**
 * Compute the first occurrence at or after today, starting from start_date.
 * Avoids back-dating: a schedule never generates invoices for periods that
 * predate its creation.
 */
function calculateInitialNextOccurrence(startDate: string, frequency: RecurringInvoiceFrequency): string {
  let occ = startDate;
  const today = todayStr();
  // Guard against pathological inputs with a generous iteration cap.
  let guard = 0;
  while (occ < today && guard < 1200) {
    occ = advanceOccurrence(occ, frequency);
    guard++;
  }
  return occ;
}

export class RecurringInvoiceService {
  private db = getDbClient();
  private invoiceService = new InvoiceService();

  /**
   * Create a recurring invoice schedule. The initial next_occurrence is set to
   * the first occurrence at or after today so no historical invoices are generated.
   */
  async create(data: CreateRecurringInvoiceDto): Promise<RecurringInvoice> {
    const nextOccurrence = calculateInitialNextOccurrence(data.start_date, data.frequency);

    const query = `
      INSERT INTO recurring_invoices (
        user_id, client_id, project_id, title, frequency, start_date, end_date,
        next_occurrence, is_active, currency, tax_rate_id, payment_terms_days,
        invoice_headline, notes, line_items
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `;
    const values = [
      data.user_id,
      data.client_id,
      data.project_id || null,
      data.title,
      data.frequency,
      data.start_date,
      data.end_date || null,
      nextOccurrence,
      data.is_active ?? true,
      data.currency || 'EUR',
      data.tax_rate_id || null,
      data.payment_terms_days ?? 30,
      data.invoice_headline || null,
      data.notes || null,
      JSON.stringify(data.line_items || []),
    ];

    const result = await this.db.query(query, values);
    return mapRow(result.rows[0]);
  }

  /** List all recurring schedules for a user, newest first, with client/project names. */
  async findAllByUser(userId: string): Promise<RecurringInvoice[]> {
    const query = `
      SELECT ri.*, c.name AS client_name, p.name AS project_name
      FROM recurring_invoices ri
      LEFT JOIN clients c ON ri.client_id = c.id
      LEFT JOIN projects p ON ri.project_id = p.id
      WHERE ri.user_id = $1
      ORDER BY ri.created_at DESC
    `;
    const result = await this.db.query(query, [userId]);
    return result.rows.map(mapRow);
  }

  /** Fetch a single schedule scoped to its owner, or null. */
  async findById(id: string, userId: string): Promise<RecurringInvoice | null> {
    const query = `
      SELECT ri.*, c.name AS client_name, p.name AS project_name
      FROM recurring_invoices ri
      LEFT JOIN clients c ON ri.client_id = c.id
      LEFT JOIN projects p ON ri.project_id = p.id
      WHERE ri.id = $1 AND ri.user_id = $2
    `;
    const result = await this.db.query(query, [id, userId]);
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  /** Update a schedule. Recomputes next_occurrence when cadence/start changes or on reactivation. */
  async update(id: string, userId: string, data: UpdateRecurringInvoiceDto): Promise<RecurringInvoice | null> {
    const existing = await this.findById(id, userId);
    if (!existing) return null;

    const fields: string[] = [];
    const values: any[] = [];
    let i = 1;

    const set = (col: string, val: any) => {
      fields.push(`${col} = $${i++}`);
      values.push(val);
    };

    if (data.client_id !== undefined) set('client_id', data.client_id);
    if (data.project_id !== undefined) set('project_id', data.project_id || null);
    if (data.title !== undefined) set('title', data.title);
    if (data.frequency !== undefined) set('frequency', data.frequency);
    if (data.start_date !== undefined) set('start_date', data.start_date);
    if (data.end_date !== undefined) set('end_date', data.end_date || null);
    if (data.is_active !== undefined) set('is_active', data.is_active);
    if (data.currency !== undefined) set('currency', data.currency);
    if (data.tax_rate_id !== undefined) set('tax_rate_id', data.tax_rate_id || null);
    if (data.payment_terms_days !== undefined) set('payment_terms_days', data.payment_terms_days);
    if (data.invoice_headline !== undefined) set('invoice_headline', data.invoice_headline || null);
    if (data.notes !== undefined) set('notes', data.notes || null);
    if (data.line_items !== undefined) set('line_items', JSON.stringify(data.line_items));

    // Recompute next_occurrence when the cadence or start date changes, or when a
    // previously-ended schedule is reactivated.
    const cadenceChanged = data.start_date !== undefined || data.frequency !== undefined;
    const reactivated = data.is_active === true && !existing.is_active;
    if (cadenceChanged || reactivated) {
      const startDate = data.start_date ?? existing.start_date;
      const frequency = (data.frequency ?? existing.frequency) as RecurringInvoiceFrequency;
      set('next_occurrence', calculateInitialNextOccurrence(startDate, frequency));
    }

    if (fields.length === 0) return existing;

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id, userId);

    const query = `
      UPDATE recurring_invoices SET ${fields.join(', ')}
      WHERE id = $${i++} AND user_id = $${i}
      RETURNING *
    `;
    const result = await this.db.query(query, values);
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  /** Delete a schedule. Does not touch already-generated invoices. */
  async delete(id: string, userId: string): Promise<boolean> {
    const result = await this.db.query(
      'DELETE FROM recurring_invoices WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Generate draft invoices for a single schedule, catching up any occurrences
   * due on or before today. Advances next_occurrence and deactivates the schedule
   * once it passes its end date.
   *
   * @returns The ids of the invoices generated (may be empty)
   */
  async generateForSchedule(schedule: RecurringInvoice): Promise<string[]> {
    const generatedIds: string[] = [];
    const today = todayStr();
    // Normalise in case a raw DB row (with Date objects) is passed in.
    let occ = toDateStr(schedule.next_occurrence);
    const endDate = toDateStr(schedule.end_date);

    if (!occ) return generatedIds;

    let guard = 0;
    while (occ && occ <= today && guard < 1200) {
      guard++;

      // Stop once we pass the end date.
      if (endDate && occ > endDate) {
        await this.db.query(
          'UPDATE recurring_invoices SET next_occurrence = NULL, is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
          [schedule.id]
        );
        return generatedIds;
      }

      const invoiceId = await this.generateInvoice(schedule, occ);
      generatedIds.push(invoiceId);

      occ = advanceOccurrence(occ, schedule.frequency);
    }

    // Persist the advanced occurrence (or deactivate if it now exceeds the end date).
    if (endDate && occ && occ > endDate) {
      await this.db.query(
        `UPDATE recurring_invoices
         SET next_occurrence = NULL, is_active = false, last_generated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [schedule.id]
      );
    } else {
      await this.db.query(
        `UPDATE recurring_invoices
         SET next_occurrence = $1,
             last_generated_at = CASE WHEN $2 > 0 THEN CURRENT_TIMESTAMP ELSE last_generated_at END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [occ, generatedIds.length, schedule.id]
      );
    }

    return generatedIds;
  }

  /**
   * Create one draft invoice for the given occurrence date using the schedule's
   * stored line items, tax rate, headline and notes.
   */
  private async generateInvoice(schedule: RecurringInvoice, occurrenceDate: string): Promise<string> {
    const dueDate = addDays(occurrenceDate, schedule.payment_terms_days);

    const invoice = await this.invoiceService.create({
      user_id: schedule.user_id,
      client_id: schedule.client_id,
      project_id: schedule.project_id,
      status: 'draft',
      issue_date: new Date(`${occurrenceDate}T00:00:00Z`),
      due_date: new Date(`${dueDate}T00:00:00Z`),
      currency: schedule.currency,
      tax_rate_id: schedule.tax_rate_id,
      invoice_headline: schedule.invoice_headline,
      notes: schedule.notes,
    });

    const items = (schedule.line_items || []).map((li) => ({
      time_entry_id: null,
      description: li.description,
      quantity: Number(li.quantity),
      unit_price: Number(li.unit_price),
      total_price: Number(li.quantity) * Number(li.unit_price),
      rate_type: li.rate_type || 'hourly',
    }));

    if (items.length > 0) {
      await this.invoiceService.addLineItems(invoice.id, items as any);
    }

    logger.info(
      `[RecurringInvoice] Generated draft invoice ${invoice.id} from schedule ${schedule.id} for ${occurrenceDate}`
    );
    return invoice.id;
  }

  /**
   * Find every active schedule that is due and generate its invoices.
   * Used by the daily scheduler. Continues past individual failures.
   *
   * @returns Totals across all processed schedules
   */
  async generateDueInvoices(): Promise<{ schedulesProcessed: number; invoicesGenerated: number }> {
    const today = todayStr();
    const dueResult = await this.db.query(
      `SELECT * FROM recurring_invoices
       WHERE is_active = true
         AND next_occurrence IS NOT NULL
         AND next_occurrence <= $1
         AND (end_date IS NULL OR next_occurrence <= end_date)
       ORDER BY next_occurrence ASC`,
      [today]
    );

    let schedulesProcessed = 0;
    let invoicesGenerated = 0;

    for (const schedule of dueResult.rows as RecurringInvoice[]) {
      try {
        const ids = await this.generateForSchedule(schedule);
        schedulesProcessed++;
        invoicesGenerated += ids.length;
      } catch (error) {
        logger.error(`[RecurringInvoice] Failed to generate for schedule ${schedule.id}:`, error);
        // Continue with the rest
      }
    }

    return { schedulesProcessed, invoicesGenerated };
  }

  /**
   * Manually trigger generation for a single owned schedule (admin/UI "generate now").
   *
   * @returns The generated invoice ids, or null if the schedule is not found
   */
  async generateNow(id: string, userId: string): Promise<string[] | null> {
    const schedule = await this.findById(id, userId);
    if (!schedule) return null;
    return this.generateForSchedule(schedule);
  }
}

export const recurringInvoiceService = new RecurringInvoiceService();
