/**
 * @fileoverview The workflow engine's clock.
 *
 * Once a minute it fires the timers that are due — task due dates, waits and
 * scheduled starts — and handles the events recorded since. Both are rows, so
 * what came due or happened while the server was down is picked up on the
 * first tick after it is back. nudge() looks for events right away, for the
 * requests that are likely to have raised one.
 *
 * @module services/workflow/workflow-scheduler
 */

import { ScheduledTask } from 'node-cron';
import { scheduleCron } from '../../utils/cron-schedule.util';
import { logger } from '../../utils/logger';
import { workflowEngine } from './workflow-engine.service';
import { onWorkflowEventEmitted } from './workflow-events';

class WorkflowSchedulerService {
  private cronJob: ScheduledTask | null = null;
  private ticking = false;
  private nudged: NodeJS.Timeout | null = null;

  public initialize(): void {
    this.cronJob = scheduleCron('[Workflow]', '* * * * *', () => this.tick());
    // What an addon records with emitWorkflowEvent() does not wait for the next tick either.
    onWorkflowEventEmitted(() => this.nudge());
    logger.info('[Workflow] Timer tick scheduled (every minute)');
  }

  /** One pass over the due timers; a pass still under way is not doubled. */
  public async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const fired = await workflowEngine.fireDueTimers();
      if (fired > 0) logger.info(`[Workflow] Fired ${fired} timer(s)`);
      const events = await workflowEngine.processEvents();
      if (events > 0) logger.info(`[Workflow] Handled ${events} event(s)`);
    } catch (error) {
      logger.error('[Workflow] Timer tick failed:', error);
    } finally {
      this.ticking = false;
    }
  }

  /**
   * Picks up runs a restart interrupted. Call once the server is listening:
   * resumed actions call the API over loopback.
   */
  public async recover(): Promise<void> {
    try {
      await workflowEngine.recover();
    } catch (error) {
      logger.error('[Workflow] Could not recover interrupted runs:', error);
    }
  }

  /**
   * An invoice or a payment was just written: handle the events it raised now
   * rather than at the next tick. Several writes in a row share one look.
   */
  public nudge(): void {
    if (this.nudged) return;
    this.nudged = setTimeout(() => {
      this.nudged = null;
      workflowEngine
        .processEvents()
        .then((events) => {
          if (events > 0) logger.info(`[Workflow] Handled ${events} event(s)`);
        })
        .catch((error) => logger.debug(`[Workflow] Looking for events failed: ${error instanceof Error ? error.message : error}`));
    }, 300);
    // Never keeps the process (or a test run) alive.
    this.nudged.unref();
  }

  public stop(): void {
    this.cronJob?.stop();
    this.cronJob = null;
  }
}

export const workflowScheduler = new WorkflowSchedulerService();
export default workflowScheduler;
