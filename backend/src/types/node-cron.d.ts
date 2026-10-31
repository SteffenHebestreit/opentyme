declare module 'node-cron' {
  export interface ScheduledTask {
    start: () => void;
    stop: () => void;
    destroy: () => void;
    getStatus: () => 'scheduled' | 'running' | 'stopped' | 'destroyed';
    /** node-cron 4 task events, e.g. 'execution:missed' (see utils/cron-schedule.util). */
    on: (event: string, listener: (...args: any[]) => void) => void;
  }

  export function schedule(
    cronExpression: string,
    func: () => void,
    options?: {
      scheduled?: boolean;
      timezone?: string;
    }
  ): ScheduledTask;

  export function validate(cronExpression: string): boolean;
}
