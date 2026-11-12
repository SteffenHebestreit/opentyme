import type { WorkflowTask } from '../../../api/types/workflow.types';

/**
 * Open tasks in the order they want attention: by due date (soonest first,
 * tasks without one last), then oldest first.
 */
export function byUrgency(tasks: WorkflowTask[]): WorkflowTask[] {
  const time = (value: string | null) => (value ? new Date(value).getTime() : Number.POSITIVE_INFINITY);
  return [...tasks].sort((a, b) => time(a.due_at) - time(b.due_at) || time(a.created_at) - time(b.created_at));
}

/** Settled tasks, most recently settled first. */
export function byRecency(tasks: WorkflowTask[]): WorkflowTask[] {
  const time = (task: WorkflowTask) => new Date(task.completed_at ?? task.created_at).getTime();
  return [...tasks].sort((a, b) => time(b) - time(a));
}
