/**
 * @fileoverview node-cron scheduling that never silently drops a run.
 *
 * node-cron 4 treats a run as "missed" and SKIPS it when its timer fires one
 * second or more after the scheduled time (event loop busy, VM briefly paused,
 * ...). All it does is log "missed execution ... Possible blocking IO or high
 * CPU" and emit `execution:missed`. On the production VM this dropped the
 * nightly backup and the recurring-expense run (2026-10-31 02:00), the project
 * rate sync and, earlier, the recurring-invoice and reminder runs.
 *
 * scheduleCron() runs the job anyway when node-cron reports a missed run: at
 * most one catch-up at a time and never while a run of the same job is still
 * going.
 *
 * @module utils/cron-schedule.util
 */

import cron, { ScheduledTask } from 'node-cron';
import { logger } from './logger';

/**
 * Schedule a job with node-cron and catch up runs that node-cron skipped.
 *
 * @param name - Label for log messages, e.g. "[RecurringInvoice]"
 * @param expression - A cron expression already checked with cron.validate()
 * @param job - The job; errors are handled like a normal node-cron task
 * @returns The node-cron task (stop() works as usual)
 */
export function scheduleCron(
  name: string,
  expression: string,
  job: () => void | Promise<void>
): ScheduledTask {
  let active = 0;
  const run = async (): Promise<void> => {
    active++;
    try {
      await job();
    } finally {
      active--;
    }
  };

  const task = cron.schedule(expression, run);

  task.on('execution:missed', () => {
    if (active > 0) {
      logger.warn(`${name} node-cron missed a scheduled run; not catching up, a run is still in progress`);
      return;
    }
    logger.warn(`${name} node-cron missed the scheduled run (timer fired late); running it now`);
    run().catch((error) => logger.error(`${name} Catch-up run failed:`, error));
  });

  return task;
}
