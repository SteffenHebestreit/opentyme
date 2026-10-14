import { FC, useEffect, useMemo, useState } from 'react';
import { Loader2, Pause, Square, Trash2 } from 'lucide-react';
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
 * - Quiet "live" styling: pulsing violet dot, violet-tinted border
 * - Dark mode support
 *
 * **Timer Display:**
 * - Tabular figures so the digits do not jitter
 * - Large 4xl font size
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
 * @property {() => void} onDelete - Callback when Delete button clicked
 * @property {boolean} isPausing - Whether pause action is in progress
 * @property {boolean} isStopping - Whether stop action is in progress
 * @property {boolean} isDeleting - Whether delete action is in progress
 * @property {string | null} [error] - Error from the last pause/stop attempt
 */
interface ActiveTimerCardProps {
  entry: TimeEntry;
  onPause: () => void;
  onStop: () => void;
  onDelete: () => void;
  isPausing: boolean;
  isStopping: boolean;
  isDeleting: boolean;
  error?: string | null;
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

export const ActiveTimerCard: FC<ActiveTimerCardProps> = ({ entry, onPause, onStop, onDelete, isPausing, isStopping, isDeleting, error }) => {
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

  const projectName = entry.project_name ?? t('timer.activeProject');
  const subtitle = [entry.task_name || t('timer.untitledTask'), entry.client_name].filter(Boolean).join(' · ');

  return (
    <section
      className="surface animate-fade-in border-violet-200 bg-gradient-to-br from-violet-50/60 via-white to-white p-5 sm:p-6 dark:border-violet-500/25 dark:from-violet-500/[0.06] dark:via-gray-900 dark:to-gray-900"
      aria-labelledby="active-timer-project"
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-500 opacity-60 [animation-duration:2s]" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-violet-500" />
            </span>
            <span className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-violet-700 dark:text-violet-300">
              {t('timer.running')}
            </span>
          </div>
          {/* Truncated to one line: the title keeps long names readable on hover */}
          <h2
            id="active-timer-project"
            title={projectName}
            className="mt-2 truncate text-lg font-semibold tracking-tight text-gray-900 dark:text-white"
          >
            {projectName}
          </h2>
          <p className="mt-0.5 truncate text-sm text-gray-600 dark:text-gray-300" title={subtitle}>
            {subtitle}
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {t('timer.started')} {formatDate(entry.date_start || entry.start_time, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
          </p>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between lg:justify-end lg:gap-6">
          <div
            role="timer"
            aria-label={t('timer.elapsed')}
            className="text-4xl font-semibold tabular-nums tracking-tight text-gray-900 dark:text-white"
          >
            {elapsed}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={onPause}
              disabled={isPausing || isStopping || isDeleting}
              isLoading={isPausing}
              leftIcon={<Pause className="h-4 w-4" />}
            >
              {isPausing ? t('timer.pausing') : t('timer.pause')}
            </Button>
            <Button
              type="button"
              onClick={onStop}
              disabled={isStopping || isDeleting}
              isLoading={isStopping}
              leftIcon={<Square className="h-3.5 w-3.5 fill-current" />}
            >
              {isStopping ? t('timer.stopping') : t('timer.stop')}
            </Button>
            <button
              type="button"
              onClick={onDelete}
              disabled={isDeleting || isStopping || isPausing}
              aria-label={isDeleting ? t('deleting') : t('timer.discard')}
              title={t('timer.discard')}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:pointer-events-none disabled:opacity-50 dark:text-gray-400 dark:hover:bg-red-500/10 dark:hover:text-red-400"
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </div>

      {error ? (
        <p className="mt-4 animate-fade-in text-sm font-medium text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
};
