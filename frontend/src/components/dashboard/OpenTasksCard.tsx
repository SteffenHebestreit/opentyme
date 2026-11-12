/**
 * Dashboard tile: how many workflow tasks are waiting and the most urgent
 * ones. Renders nothing while there are none (or the list can't be loaded) —
 * most days the dashboard doesn't need it.
 */
import { FC } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarClock, ListChecks } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useWorkflowTasks } from '../../hooks/api/useWorkflows';
import { byUrgency } from '../workflows/tasks/taskOrder';
import { formatDate } from '../../utils/date';
import { DashboardSection, ViewAllLink } from './DashboardSection';

/** How many tasks the tile lists before pointing to the full list. */
const VISIBLE_TASKS = 3;

export const OpenTasksCard: FC = () => {
  const { t } = useTranslation('workflows');
  const { data, isError } = useWorkflowTasks('open');
  if (isError || !data || data.length === 0) return null;
  const tasks = byUrgency(data);

  return (
    <DashboardSection title={t('tasks.dashboard.title')} aside={<ViewAllLink to="/tasks">{t('tasks.dashboard.viewAll')}</ViewAllLink>}>
      <div className="surface flex flex-col gap-4 p-5 sm:flex-row sm:items-start">
        <div className="flex shrink-0 items-center gap-3 sm:w-44">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
            <ListChecks className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-2xl font-semibold tabular-nums text-gray-900 dark:text-white">{tasks.length}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('tasks.dashboard.open', { count: tasks.length })}</p>
          </div>
        </div>
        <ul className="min-w-0 flex-1 divide-y divide-gray-100 dark:divide-gray-800">
          {tasks.slice(0, VISIBLE_TASKS).map((task) => {
            const overdue = !!task.due_at && new Date(task.due_at).getTime() < Date.now();
            return (
              <li key={task.id} className="py-2 first:pt-0 last:pb-0">
                <Link
                  to="/tasks"
                  className="group flex items-center justify-between gap-3 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-gray-900 group-hover:text-brand-700 dark:text-white dark:group-hover:text-brand-300">
                      {task.title}
                    </span>
                    <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                      {[task.definition_name, task.subject_label].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  {task.due_at && (
                    <span className={cn('inline-flex shrink-0 items-center gap-1 text-xs', overdue ? 'font-medium text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400')}>
                      <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                      {formatDate(task.due_at)}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </DashboardSection>
  );
};
