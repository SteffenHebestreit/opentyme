/**
 * @fileoverview Recurring invoice scheduler.
 *
 * Runs daily and generates draft invoices for every active recurring-invoice
 * schedule that has become due. Generated invoices are drafts, so the owner
 * always reviews them before sending.
 *
 * @module services/financial/recurring-invoice-scheduler.service
 */

import cron, { ScheduledTask } from 'node-cron';
import { recurringInvoiceService } from './recurring-invoice.service';
import { logger } from '../../utils/logger';

class RecurringInvoiceSchedulerService {
  private cronJob: ScheduledTask | null = null;

  /**
   * Initialize the scheduler. Runs daily at 06:00 (server local time) by default;
   * override with the RECURRING_INVOICE_CRON environment variable.
   */
  public initialize(): void {
    const cronExpression = process.env.RECURRING_INVOICE_CRON || '0 6 * * *';

    if (!cron.validate(cronExpression)) {
      logger.error(`[RecurringInvoice] Invalid cron expression "${cronExpression}", scheduler not started`);
      return;
    }

    this.cronJob = cron.schedule(cronExpression, async () => {
      logger.info('[RecurringInvoice] Running recurring invoice generation...');
      try {
        const result = await recurringInvoiceService.generateDueInvoices();
        logger.info(
          `[RecurringInvoice] Done: ${result.invoicesGenerated} draft invoice(s) from ${result.schedulesProcessed} schedule(s)`
        );
      } catch (error) {
        logger.error('[RecurringInvoice] Generation job failed:', error);
      }
    });

    logger.info(`[RecurringInvoice] Scheduler initialized (cron: "${cronExpression}")`);
  }

  /** Stop the scheduler. */
  public stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      logger.info('[RecurringInvoice] Scheduler stopped');
    }
  }

  /** Manually trigger a generation pass across all schedules (for testing/admin). */
  public async triggerManually(): Promise<{ schedulesProcessed: number; invoicesGenerated: number }> {
    logger.info('[RecurringInvoice] Manual trigger initiated');
    return recurringInvoiceService.generateDueInvoices();
  }
}

export default new RecurringInvoiceSchedulerService();
