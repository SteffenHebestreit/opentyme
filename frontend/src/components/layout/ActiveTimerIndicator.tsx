import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { format, subDays } from 'date-fns';
import { useTimeEntries } from '../../hooks/api/useTimeEntries';
import { cn } from '../../lib/cn';

const pad = (value: number) => String(value).padStart(2, '0');

const formatElapsed = (start: Date, now: number) => {
  const seconds = Math.max(0, Math.floor((now - start.getTime()) / 1000));
  return `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor((seconds % 3600) / 60))}:${pad(seconds % 60)}`;
};

/**
 * A running timer, visible from every page: pulsing dot, elapsed time and the
 * project. Links to time tracking, where it can be paused or stopped.
 */
export function ActiveTimerIndicator() {
  const { t } = useTranslation('common');
  const { pathname } = useLocation();

  // A timer is dated the day it was started — today's and yesterday's entries
  // cover one left running overnight without loading the whole history.
  const today = format(new Date(), 'yyyy-MM-dd');
  const range = useMemo(
    () => ({ start_date: format(subDays(new Date(`${today}T12:00:00`), 1), 'yyyy-MM-dd'), end_date: today }),
    [today]
  );
  const { data: entries } = useTimeEntries(range);

  const running = useMemo(
    () => (entries ?? []).find((entry) => entry.date_start && !entry.entry_end_time),
    [entries]
  );
  const start = useMemo(() => {
    if (!running?.date_start) return null;
    const parsed = new Date(running.date_start);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }, [running?.date_start]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!start) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [start]);

  if (!running || !start) return null;

  const onTimePage = pathname.startsWith('/time-entries');

  return (
    <Link
      to="/time-entries"
      className={cn(
        'group flex h-8 animate-pop-in items-center gap-2 rounded-full border border-violet-500/25 bg-violet-50 pl-2.5 pr-3 text-sm transition-colors',
        'hover:border-violet-500/40 hover:bg-violet-100/70 dark:bg-violet-500/10 dark:hover:bg-violet-500/15',
        onTimePage && 'pointer-events-none'
      )}
      title={t('shell.timerRunning', 'Timer running')}
    >
      <span className="relative flex h-2 w-2" aria-hidden="true">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-500 opacity-60 [animation-duration:2s]" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-violet-500" />
      </span>
      <span className="font-mono text-[13px] font-medium tabular-nums text-violet-700 dark:text-violet-300">
        {formatElapsed(start, now)}
      </span>
      {running.project_name && (
        <span className="hidden max-w-[10rem] truncate text-xs text-violet-700/80 lg:inline dark:text-violet-300/80">
          {running.project_name}
        </span>
      )}
    </Link>
  );
}
