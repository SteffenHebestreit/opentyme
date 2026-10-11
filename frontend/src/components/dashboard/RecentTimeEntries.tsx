import { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Clock, Timer } from 'lucide-react';
import { TimeEntry } from '../../api/types';
import { formatDistanceToNow } from '../../utils/date';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import { Card, CardHeader } from '../common/Card';
import { EmptyState } from '../common/EmptyState';
import { ViewAllLink } from './DashboardSection';

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
 * Card listing the most recent time entries on the dashboard.
 *
 * Each row shows:
 * - Description (or "No description provided")
 * - Project name (brand colour) and client name
 * - Task and billable/non-billable chips
 * - Duration (e.g., "2h 30m") and relative time since the entry
 *
 * Header links to the full time-entry list; an empty list shows an
 * intentional empty state with a "Log time" action.
 *
 * @component
 * @example
 * <RecentTimeEntries entries={dashboardData.recentTimeEntries} />
 *
 * @param {RecentTimeEntriesProps} props - Component props
 * @returns {JSX.Element} Card with recent time entries or an empty state
 */
export const RecentTimeEntries: FC<RecentTimeEntriesProps> = ({ entries }) => {
  const { t } = useTranslation('dashboard');
  const navigate = useNavigate();

  return (
    <Card className="flex h-full flex-col">
      <CardHeader
        title={t('recentTimeEntries.title')}
        action={<ViewAllLink to="/time-entries">{t('recentTimeEntries.viewAll')}</ViewAllLink>}
      />

      {entries.length === 0 ? (
        <EmptyState
          compact
          className="flex-1"
          icon={Clock}
          title={t('recentTimeEntries.noEntries')}
          description={t('recentTimeEntries.startTracking')}
          action={
            <Button
              type="button"
              variant="secondary"
              size="sm"
              leftIcon={<Timer className="h-4 w-4" />}
              onClick={() => navigate('/time-entries')}
            >
              {t('quickActions.logTime')}
            </Button>
          }
        />
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-800/70">
          {entries.map((entry) => {
            const project = entry.project_name ?? t('recentTimeEntries.unassigned');
            const client = entry.client_name ?? '—';
            const duration = formatDuration(entry.duration_minutes);

            return (
              <li
                key={entry.id}
                className="flex items-start justify-between gap-4 px-6 py-3.5 transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.02]"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                    {entry.description || t('recentTimeEntries.noDescription')}
                  </p>
                  <p className="mt-0.5 truncate text-sm text-gray-500 dark:text-gray-400">
                    <span className="font-medium text-brand-600 dark:text-brand-400">{project}</span>
                    <span className="mx-1.5 text-gray-300 dark:text-gray-600" aria-hidden="true">·</span>
                    <span>{client}</span>
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {entry.task_name ? (
                      <Badge size="sm" variant="gray">
                        {t('recentTimeEntries.task')} · {entry.task_name}
                      </Badge>
                    ) : null}
                    <Badge size="sm" variant={entry.billable ? 'green' : 'gray'} dot>
                      {entry.billable ? t('recentTimeEntries.billable') : t('recentTimeEntries.nonBillable')}
                    </Badge>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold tabular-nums text-gray-900 dark:text-white">{duration}</p>
                  <p className="mt-0.5 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                    {formatDistanceToNow(entry.start_time)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
};
