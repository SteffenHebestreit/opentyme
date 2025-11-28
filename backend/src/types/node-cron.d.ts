declare module 'node-cron' {
  export interface ScheduledTask {
    start: () => void;
    stop: () => void;
    destroy: () => void;
    getStatus: () => 'scheduled' | 'running' | 'stopped' | 'destroyed';
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
