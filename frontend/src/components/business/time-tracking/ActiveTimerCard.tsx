import { FC, useEffect, useMemo, useState } from 'react';
import { PlayCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TimeEntry } from '../../../api/types';
import { Button } from '../../common/Button';
import { formatDate } from '../../../utils/date';

/**
 * Active timer card component showing running time entry.
 *
 * **Features:**
 * - Real-time elapsed time display (HH:MM:SS format)
 * - Updates every second
 * - Project, task, and client information
 * - Start time display
 * - Pause and Stop buttons
 * - Loading states for actions
 * - Indigo-themed styling for active state
 * - Dark mode support
 *
 * **Timer Display:**
 * - Mono font for easy reading
 * - Large 3xl font size
 * - Format: HH:MM:SS (e.g., "02:45:30")
 * - Auto-updates every second
 *
 * @component
 * @example
 * <ActiveTimerCard
 *   entry={activeTimer}
 *   onPause={handlePauseTimer}
 *   onStop={handleStopTimer}
 *   isPausing={false}
 *   isStopping={false}
 * />
 *
 * @example
 * // With loading states
 * <ActiveTimerCard
 *   entry={runningEntry}
 *   onPause={async () => {
 *     setIsPausing(true);
 *     await pauseTimer(runningEntry.id);
 *     setIsPausing(false);
 *   }}
 *   onStop={async () => {
 *     setIsStopping(true);
 *     await stopTimer(runningEntry.id);
 *     setIsStopping(false);
 *   }}
 *   isPausing={isPausing}
 *   isStopping={isStopping}
 * />
 */

/**
 * Props for the ActiveTimerCard component.
 *
 * @interface ActiveTimerCardProps
 * @property {TimeEntry} entry - Active time entry with start_time
 * @property {() => void} onPause - Callback when Pause button clicked
 * @property {() => void} onStop - Callback when Stop button clicked
 * @property {boolean} isPausing - Whether pause action is in progress
 * @property {boolean} isStopping - Whether stop action is in progress
 */
interface ActiveTimerCardProps {
  entry: TimeEntry;
  onPause: () => void;
  onStop: () => void;
  isPausing: boolean;
  isStopping: boolean;
}

/**
 * Formats elapsed time from start date to now as HH:MM:SS.
 *
 * @param {Date} start - Timer start time
 * @returns {string} Formatted elapsed time
 */
const formatElapsed = (start: Date): string => {
  const diffMs = Date.now() - start.getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) {
    return '00:00:00';
  }
  const totalSeconds = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSeconds / 3600)
    .toString()
    .padStart(2, '0');
  const minutes = Math.floor((totalSeconds % 3600) / 60)
    .toString()
    .padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
};

export const ActiveTimerCard: FC<ActiveTimerCardProps> = ({ entry, onPause, onStop, isPausing, isStopping }) => {
  const { t } = useTranslation('time-tracking');
  
  const startDate = useMemo(() => {
    // Use date_start for active timers (primary), fall back to start_time (legacy)
    const timeValue = entry.date_start || entry.start_time;
    if (!timeValue) {
      return null;
    }
    const parsed = new Date(timeValue);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    return parsed;
  }, [entry.date_start, entry.start_time]);

  const [elapsed, setElapsed] = useState(() => (startDate ? formatElapsed(startDate) : '00:00:00'));

  useEffect(() => {
    if (!startDate) {
      return;
    }
    setElapsed(formatElapsed(startDate));
    const interval = window.setInterval(() => {
      setElapsed(formatElapsed(startDate));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [startDate]);

  if (!startDate) {
    return null;
  }

  return (
    <div className="flex flex-col justify-between gap-4 rounded-2xl border border-indigo-200 bg-indigo-50/70 p-6 shadow-sm dark:border-indigo-500/40 dark:bg-indigo-500/10 md:flex-row md:items-center">
      <div className="flex flex-1 items-start gap-4">
        <span className="mt-1 inline-flex h-10 w-10 flex-none items-center justify-center rounded-full bg-indigo-600 text-white">
          <PlayCircle className="h-6 w-6" />
        </span>
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-indigo-600 dark:text-indigo-300">
            {t('timer.running')}
          </p>
          <h3 className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">{entry.project_name ?? t('timer.activeProject')}</h3>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
            {entry.task_name || t('timer.untitledTask')}
            {entry.client_name ? ` · ${entry.client_name}` : ''}
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {t('timer.started')} {formatDate(entry.date_start || entry.start_time, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
          </p>
        </div>
      </div>
      <div className="flex flex-col items-end gap-4">
        <div className="text-3xl font-mono font-semibold text-indigo-700 dark:text-indigo-200">{elapsed}</div>
        <div className="flex items-center gap-3">
          <Button type="button" variant="secondary" onClick={onPause} disabled={isPausing || isStopping}>
            {isPausing ? t('timer.pausing') : t('timer.pause')}
          </Button>
          <Button type="button" variant="danger" onClick={onStop} disabled={isStopping}>
            {isStopping ? t('timer.stopping') : t('timer.stop')}
          </Button>
        </div>
      </div>
    </div>
  );
};
