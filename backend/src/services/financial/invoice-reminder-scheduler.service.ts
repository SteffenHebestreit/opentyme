/**
 * @fileoverview Invoice overdue reminder scheduler.
 *
 * Runs once daily and, for each user who has opted in
 * (settings.overdue_reminders_enabled = true) and has SMTP configured, sends a
 * single digest email to the account owner listing their currently-overdue
 * invoices. It never emails clients and never modifies invoice data — it is a
 * read-only self-notification.
 *
 * Because the job runs at most once per day, at most one digest is sent per
 * user per day, so no per-invoice "reminded" tracking is required.
 *
 * @module services/financial/invoice-reminder-scheduler.service
 */

import cron, { ScheduledTask } from 'node-cron';
import { getDbClient } from '../../utils/database';
import { logger } from '../../utils/logger';
import { emailService, getUserSmtpConfig } from '../external/email.service';

interface OverdueInvoiceRow {
  id: string;
  invoice_number: string;
  client_name: string | null;
  due_date: string;
  total_amount: string;
  currency: string;
  days_overdue: number;
}

class InvoiceReminderSchedulerService {
  private cronJob: ScheduledTask | null = null;
  private pool = getDbClient();

  /**
   * Initialize the scheduler. Runs daily at 08:00 (server local time) by default;
   * override with the INVOICE_REMINDER_CRON environment variable.
   */
  public initialize(): void {
    const cronExpression = process.env.INVOICE_REMINDER_CRON || '0 8 * * *';

    if (!cron.validate(cronExpression)) {
      logger.error(`[InvoiceReminder] Invalid cron expression "${cronExpression}", scheduler not started`);
      return;
    }

    this.cronJob = cron.schedule(cronExpression, async () => {
      logger.info('[InvoiceReminder] Running overdue invoice reminder job...');
      try {
        await this.processOverdueReminders();
      } catch (error) {
        logger.error('[InvoiceReminder] Reminder job failed:', error);
      }
    });

    logger.info(`[InvoiceReminder] Scheduler initialized (cron: "${cronExpression}")`);
  }

  /** Stop the scheduler. */
  public stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      logger.info('[InvoiceReminder] Scheduler stopped');
    }
  }

  /**
   * Find opted-in users and send each a digest of their overdue invoices.
   */
  public async processOverdueReminders(): Promise<{ usersNotified: number; invoicesReported: number }> {
    let usersNotified = 0;
    let invoicesReported = 0;

    // Users who opted in to overdue reminders
    const usersResult = await this.pool.query(
      `SELECT user_id, company_email, smtp_from
       FROM settings
       WHERE overdue_reminders_enabled = true`
    );

    for (const userRow of usersResult.rows) {
      const userId = userRow.user_id;

      try {
        // Overdue = past due date and not yet fully paid / cancelled / draft
        const overdueResult = await this.pool.query<OverdueInvoiceRow>(
          `SELECT
             i.id,
             i.invoice_number,
             c.name AS client_name,
             TO_CHAR(i.due_date, 'YYYY-MM-DD') AS due_date,
             i.total_amount,
             i.currency,
             (CURRENT_DATE - i.due_date) AS days_overdue
           FROM invoices i
           LEFT JOIN clients c ON i.client_id = c.id
           WHERE i.user_id = $1
             AND i.due_date < CURRENT_DATE
             AND i.status IN ('sent', 'partially_paid', 'overdue')
           ORDER BY i.due_date ASC`,
          [userId]
        );

        if (overdueResult.rows.length === 0) {
          continue;
        }

        // Only attempt to email if the user has SMTP configured
        const smtpConfig = await getUserSmtpConfig(userId);
        if (!smtpConfig) {
          logger.info(`[InvoiceReminder] User ${userId} has ${overdueResult.rows.length} overdue invoice(s) but no SMTP configured — skipping`);
          continue;
        }

        const recipient = smtpConfig.from || userRow.smtp_from || userRow.company_email;
        if (!recipient) {
          logger.info(`[InvoiceReminder] User ${userId} has no recipient address — skipping`);
          continue;
        }

        const html = this.buildDigestHtml(overdueResult.rows);

        await emailService.sendEmail({
          userId,
          to: recipient,
          subject: `OpenTYME: ${overdueResult.rows.length} overdue invoice(s) need attention`,
          html,
        });

        usersNotified++;
        invoicesReported += overdueResult.rows.length;
        logger.info(`[InvoiceReminder] Sent digest to ${recipient} for ${overdueResult.rows.length} overdue invoice(s)`);
      } catch (error) {
        logger.error(`[InvoiceReminder] Failed to process reminders for user ${userId}:`, error);
        // Continue with other users
      }
    }

    logger.info(`[InvoiceReminder] Done: ${usersNotified} user(s) notified, ${invoicesReported} invoice(s) reported`);
    return { usersNotified, invoicesReported };
  }

  /**
   * Build the HTML body for the overdue-invoice digest email.
   */
  private buildDigestHtml(rows: OverdueInvoiceRow[]): string {
    const formatAmount = (amount: string, currency: string): string => {
      const num = Number(amount);
      return Number.isFinite(num) ? `${num.toFixed(2)} ${currency}` : `${amount} ${currency}`;
    };

    const rowsHtml = rows
      .map(
        (r) => `
        <tr>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;">${r.invoice_number}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;">${r.client_name || '—'}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;">${r.due_date}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;">${r.days_overdue}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;">${formatAmount(r.total_amount, r.currency)}</td>
        </tr>`
      )
      .join('');

    return `
      <div style="font-family:Arial,Helvetica,sans-serif;color:#222;">
        <h2 style="color:#6B8EAF;">Overdue Invoices</h2>
        <p>The following ${rows.length} invoice(s) are past their due date and have an outstanding balance:</p>
        <table style="border-collapse:collapse;width:100%;font-size:14px;">
          <thead>
            <tr style="background:#f0f0f0;">
              <th style="padding:6px 10px;text-align:left;">Invoice</th>
              <th style="padding:6px 10px;text-align:left;">Client</th>
              <th style="padding:6px 10px;text-align:left;">Due date</th>
              <th style="padding:6px 10px;text-align:right;">Days overdue</th>
              <th style="padding:6px 10px;text-align:right;">Amount</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        <p style="color:#888;font-size:12px;margin-top:16px;">
          You are receiving this because overdue-invoice reminders are enabled in your OpenTYME settings.
        </p>
      </div>`;
  }

  /** Manually trigger the reminder job (for testing or admin-initiated runs). */
  public async triggerManually(): Promise<{ usersNotified: number; invoicesReported: number }> {
    logger.info('[InvoiceReminder] Manual trigger initiated');
    return this.processOverdueReminders();
  }
}

export default new InvoiceReminderSchedulerService();
