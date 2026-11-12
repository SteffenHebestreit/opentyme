/**
 * @fileoverview The workflow engine's clock.
 *
 * Once a minute it fires the timers that are due — task due dates, waits and
 * scheduled starts. Timers are rows, so what came due while the server was
 * down fires on the first tick after it is back.
 *
 * @module services/workflow/workflow-scheduler
 */

import { ScheduledTask } from 'node-cron';
import { scheduleCron } from '../../utils/cron-schedule.util';
import { logger } from '../../utils/logger';
import { workflowEngine } from './workflow-engine.service';

class WorkflowSchedulerService {
  private cronJob: ScheduledTask | null = null;
  private ticking = false;

  public initialize(): void {
    this.cronJob = scheduleCron('[Workflow]', '* * * * *', () => this.tick());
    logger.info('[Workflow] Timer tick scheduled (every minute)');
  }

  /** One pass over the due timers; a pass still under way is not doubled. */
  public async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const fired = await workflowEngine.fireDueTimers();
      if (fired > 0) logger.info(`[Workflow] Fired ${fired} timer(s)`);
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

  public stop(): void {
    this.cronJob?.stop();
    this.cronJob = null;
  }
}

export const workflowScheduler = new WorkflowSchedulerService();
export default workflowScheduler;
