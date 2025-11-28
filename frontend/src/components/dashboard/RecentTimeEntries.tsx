import { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { TimeEntry } from '../../api/types';
import { formatDistanceToNow } from '../../utils/date';
import clsx from 'clsx';

/**
 * Props for the RecentTimeEntries component.
 * 
 * @interface RecentTimeEntriesProps
 * @property {TimeEntry[]} entries - Array of recent time entry records
 */
interface RecentTimeEntriesProps {
  entries: TimeEntry[];
}

/**
 * Formats duration from minutes to human-readable format.
 * 
 * @param {number | null | undefined} minutes - Duration in minutes
 * @returns {string} Formatted duration (e.g., "2h 30m", "45m", "3h")
 * 
 * @example
 * formatDuration(150) // "2h 30m"
 * formatDuration(45)  // "45m"
 * formatDuration(120) // "2h"
 * formatDuration(null) // "—"
 */
function formatDuration(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) {
    return '—';
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours === 0) {
    return `${remainingMinutes}m`;
  }
  if (remainingMinutes === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${remainingMinutes}m`;
}

/**
 * Displays a list of recent time entries from the dashboard.
 * 
 * Features:
 * - Entry cards with hover effects
 * - Description, project name (highlighted), and client name
 * - Duration formatted as hours and minutes
 * - Relative timestamp ("2 hours ago")
 * - Empty state with dashed border
 * - Dark mode support
 * - Responsive layout
 * 
 * Each entry shows:
 * - Description (or "No description provided")
 * - Project name in indigo color
 * - Client name
 * - Duration (e.g., "2h 30m")
 * - Relative time since entry
 * 
 * @component
 * @example
 * // With entries
 * <RecentTimeEntries entries={dashboardData.recentTimeEntries} />
 * 
 * @example
 * // Empty state
 * <RecentTimeEntries entries={[]} />
 * 
 * @param {RecentTimeEntriesProps} props - Component props
 * @returns {JSX.Element} List of recent time entry cards or empty state
 */
export const RecentTimeEntries: FC<RecentTimeEntriesProps> = ({ entries }) => {
  const { t } = useTranslation('dashboard');
  
  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
        {t('recentTimeEntries.noEntries')}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {entries.map((entry) => {
        const project = entry.project_name ?? t('recentTimeEntries.unassigned');
        const client = entry.client_name ?? '—';
        const duration = formatDuration(entry.duration_minutes);

        return (
          <div
            key={entry.id}
            className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition hover:border-indigo-200 hover:shadow-md dark:border-gray-800 dark:bg-gray-900 dark:hover:border-indigo-500/40"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {entry.description || t('recentTimeEntries.noDescription')}
                </p>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  <span className="font-medium text-indigo-600 dark:text-indigo-300">{project}</span>
                  <span className="mx-2 text-gray-300 dark:text-gray-600">•</span>
                  <span>{client}</span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{duration}</p>
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                  {formatDistanceToNow(entry.start_time)}
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
              {entry.task_name ? (
                <span className="rounded-full bg-gray-100 px-2 py-1 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                  {t('recentTimeEntries.task')} • {entry.task_name}
                </span>
              ) : null}
              <span
                className={clsx(
                  'rounded-full px-2 py-1',
                  entry.billable
                    ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
                )}
              >
                {entry.billable ? t('recentTimeEntries.billable') : t('recentTimeEntries.nonBillable')}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
