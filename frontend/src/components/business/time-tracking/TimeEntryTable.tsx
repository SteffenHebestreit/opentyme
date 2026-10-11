/**
 * @fileoverview Time entry table component for displaying and managing time tracking records.
 * 
 * Displays time entries in a comprehensive table format with duration calculation,
 * billable status indicators, and action buttons for editing, deleting, and stopping
 * active timers. Supports both completed and in-progress time entries.
 * 
 * Features:
 * - 7-column table: Task, Project, Duration, Billable, Start, End, Actions
 * - Duration formatting: Displays as "Xh Ym" (e.g., "2h 30m")
 * - Auto-calculation: Calculates duration from start/end times if not explicitly set
 * - Active timer indication: Highlights in-progress entries with special styling
 * - Billable badges: Green for billable, gray for non-billable with hourly rate display
 * - DateTime formatting: "MMM d, yyyy · h:mm a" format
 * - Action buttons: Edit and Delete as labelled icon buttons
 * - Loading states: Shows a spinner during delete operations
 * - Responsive design: Horizontal scroll on small screens
 * - Empty state: Returns null when no entries to display
 * 
 * @module components/business/time-tracking/TimeEntryTable
 */

import { FC, useMemo } from 'react';
import { ChevronRight, Loader2, Pencil, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TimeEntry } from '../../../api/types';
import { Table, Column } from '../../common/Table';
import { cn } from '../../../lib/cn';

/** Small square icon button used for the row actions. */
const iconButtonClass =
  'inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:pointer-events-none disabled:opacity-50 ' +
  'dark:text-gray-400';

/**
 * Props for the TimeEntryTable component.
 * 
 * @interface TimeEntryTableProps
 * @property {TimeEntry[]} entries - Array of time entries to display in the table
 * @property {(entry: TimeEntry) => void} onEdit - Handler for edit button click
 * @property {(entry: TimeEntry) => void} onDelete - Handler for delete button click
 * @property {(entry: TimeEntry) => void} [onStop] - Optional handler for stopping active timers
 * @property {string | null} [isDeletingId] - ID of entry currently being deleted (for loading state)
 * @property {string | null} [isStoppingId] - ID of entry currently being stopped (for loading state)
 */
interface TimeEntryTableProps {
  entries: TimeEntry[];
  onEdit: (entry: TimeEntry) => void;
  onDelete: (entry: TimeEntry) => void;
  isDeletingId?: string | null;
}

/**
 * Calculates and formats the duration of a time entry.
 * 
 * Uses duration_minutes if available, otherwise calculates from start_time and end_time.
 * For active timers (no end_time), calculates duration from start_time to now.
 * 
 * @function
 * @param {TimeEntry} entry - The time entry to calculate duration for
 * @returns {string} Formatted duration string (e.g., "2h 30m", "45m", "0m") or "—" if invalid
 * @example
 * formatDuration({ duration_minutes: 150 }) // Returns: "2h 30m"
 * formatDuration({ start_time: '2024-01-01T10:00:00Z', end_time: '2024-01-01T10:45:00Z' })
 * // Returns: "45m"
 */
const formatDuration = (entry: TimeEntry): string => {
  const { duration_minutes: durationMinutes, start_time: startTime, end_time: endTime } = entry;

  if (typeof durationMinutes === 'number' && !Number.isNaN(durationMinutes)) {
    return humanizeMinutes(durationMinutes);
  }

  if (startTime) {
    const start = new Date(startTime);
    const end = endTime ? new Date(endTime) : new Date();
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      const diff = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
      return humanizeMinutes(diff);
    }
  }

  return '—';
};

/**
 * Converts minutes to human-readable format.
 * 
 * Converts total minutes to "Xh Ym" format, omitting zero values.
 * 
 * @function
 * @param {number} minutesTotal - Total minutes to format
 * @returns {string} Formatted duration (e.g., "2h 30m", "45m", "3h", "0m")
 * @example
 * humanizeMinutes(150) // Returns: "2h 30m"
 * humanizeMinutes(45) // Returns: "45m"
 * humanizeMinutes(120) // Returns: "2h"
 * humanizeMinutes(0) // Returns: "0m"
 */
const humanizeMinutes = (minutesTotal: number): string => {
  if (!Number.isFinite(minutesTotal) || minutesTotal <= 0) {
    return '0m';
  }
  const hours = Math.floor(minutesTotal / 60);
  const minutes = minutesTotal % 60;
  const parts = [] as string[];
  if (hours) {
    parts.push(`${hours}h`);
  }
  if (minutes) {
    parts.push(`${minutes}m`);
  }
  if (parts.length === 0) {
    return '0m';
  }
  return parts.join(' ');
};

/**
 * Formats a date using locale-aware formatting.
 * 
 * @function
 * @param {string | null} value - ISO 8601 date string to format
 * @param {string} locale - Locale code (e.g., 'de-DE', 'en-US')
 * @returns {string} Formatted date string (e.g., "15.01.2024" for de-DE) or "—" if invalid
 */
const formatDate = (value: string | null, locale: string = 'de-DE'): string => {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleDateString(locale);
};

/**
 * Formats a time range or single time using locale-aware formatting.
 * 
 * @function
 * @param {string | null} startTime - ISO 8601 start time string
 * @param {string | null} endTime - ISO 8601 end time string (optional for active entries)
 * @param {string} locale - Locale code (e.g., 'de-DE', 'en-US')
 * @returns {string} Formatted time range (e.g., "09:00 - 12:30") or single time
 */
const formatTimeRange = (startTime: string | null | undefined, endTime: string | null | undefined, locale: string = 'de-DE'): string => {
  if (!startTime) {
    return '—';
  }
  
  const start = new Date(startTime);
  if (Number.isNaN(start.getTime())) {
    return '—';
  }
  
  const startTimeStr = start.toLocaleTimeString(locale, { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false 
  });
  
  if (!endTime) {
    return `${startTimeStr} - ...`;
  }
  
  const end = new Date(endTime);
  if (Number.isNaN(end.getTime())) {
    return startTimeStr;
  }
  
  const endTimeStr = end.toLocaleTimeString(locale, { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false 
  });
  
  return `${startTimeStr} - ${endTimeStr}`;
};

/**
 * Start (and end, when known) of an entry as "HH:mm – HH:mm".
 * Falls back to the legacy start/end timestamps.
 */
const formatEntryTime = (entry: TimeEntry, locale: string): string => {
  if (entry.entry_time) {
    const start = entry.entry_time.slice(0, 5);
    const end = entry.entry_end_time ? entry.entry_end_time.slice(0, 5) : '';
    return end ? `${start} – ${end}` : start;
  }
  return formatTimeRange(entry.start_time, entry.end_time, locale);
};

/**
 * Calculates duration in hours for sorting purposes.
 */
const getDurationInHours = (entry: TimeEntry): number => {
  if (entry.duration_hours && !isNaN(entry.duration_hours)) {
    return entry.duration_hours;
  }
  if (entry.duration_minutes && !isNaN(entry.duration_minutes)) {
    return entry.duration_minutes / 60;
  }
  if (entry.start_time) {
    const start = new Date(entry.start_time);
    const end = entry.end_time ? new Date(entry.end_time) : new Date();
    if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
      const diffMs = end.getTime() - start.getTime();
      return diffMs / (1000 * 60 * 60);
    }
  }
  return 0;
};

/**
 * Calculates total duration in hours for a list of entries.
 */
const getTotalDurationInHours = (items: TimeEntry[]): number => {
  return items.reduce((total, entry) => total + getDurationInHours(entry), 0);
};

/**
 * Table component for displaying time entry records with actions.
 * 
 * Displays time entries grouped by date and project with collapsible rows showing
 * aggregated totals. Individual entries can be expanded to show details.
 * 
 * @component
 */
export const TimeEntryTable: FC<TimeEntryTableProps> = ({
  entries,
  onEdit,
  onDelete,
  isDeletingId,
}) => {
  const { t } = useTranslation('time-tracking');
  const userLocale = navigator.language || 'de-DE';

  const columns: Column<TimeEntry>[] = useMemo(() => [
    {
      key: 'date',
      accessorKey: 'entry_date',
      header: t('table.date'),
      render: (entry) => (
        <span className="whitespace-nowrap tabular-nums text-gray-600 dark:text-gray-400">
          {formatEntryTime(entry, userLocale)}
        </span>
      ),
      sortable: true,
      groupSortValue: (_, items) => items[0]?.entry_date || items[0]?.start_time || '',
    },
    {
      key: 'client',
      accessorKey: 'client_name',
      header: t('table.client'),
      render: (entry) => (
        <span className="text-gray-600 dark:text-gray-400">
          {entry.client_name || '—'}
        </span>
      ),
      sortable: true,
      groupSortValue: (_, items) => items[0]?.client_name || '',
    },
    {
      key: 'project',
      accessorKey: 'task_name',
      header: t('table.project'),
      render: (entry) => (
        <div className="min-w-[12rem]">
          <div className="font-medium text-gray-900 dark:text-white">
            {entry.task_name || t('timer.untitledTask')}
          </div>
          {entry.description ? (
            <p className="mt-0.5 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
              {entry.description}
            </p>
          ) : null}
        </div>
      ),
      sortable: true,
      sortValue: (entry) => entry.task_name || t('timer.untitledTask'),
      groupSortValue: (_, items) => items[0]?.task_name || t('timer.untitledTask'),
    },
    {
      key: 'duration',
      accessorKey: 'duration_hours',
      header: t('table.duration'),
      align: 'right',
      render: (entry) => (
        <span className="whitespace-nowrap tabular-nums text-gray-700 dark:text-gray-300">
          {entry.duration_hours && !isNaN(entry.duration_hours) ? `${entry.duration_hours.toFixed(2)}h` : formatDuration(entry)}
        </span>
      ),
      sortable: true,
      sortValue: (entry) => getDurationInHours(entry),
      groupSortValue: (_, items) => getTotalDurationInHours(items),
    },
    {
      key: 'actions',
      header: <span className="sr-only">{t('table.actions')}</span>,
      align: 'right',
      render: (entry) => {
        const isDeleting = isDeletingId === entry.id;
        return (
          <div className="flex justify-end gap-1">
            <button
              type="button"
              onClick={() => onEdit(entry)}
              aria-label={t('edit')}
              title={t('edit')}
              className={cn(iconButtonClass, 'hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-white/5 dark:hover:text-white')}
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(entry)}
              disabled={isDeleting}
              aria-label={isDeleting ? t('deleting') : t('delete')}
              title={t('delete')}
              className={cn(iconButtonClass, 'hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400')}
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>
        );
      },
    },
  ], [t, userLocale, onEdit, onDelete, isDeletingId]);

  const groupBy = (entry: TimeEntry) => {
    const date = entry.entry_date || (entry.start_time ? new Date(entry.start_time).toISOString().split('T')[0] : 'unknown');
    const projectId = entry.project_id || 'unknown';
    return `${date}-${projectId}`;
  };

  const groupSort = (a: [string, TimeEntry[]], b: [string, TimeEntry[]]) => {
    return b[0].localeCompare(a[0]);
  };

  const groupHeaderRender = (_groupKey: string, groupItems: TimeEntry[], isExpanded: boolean, _toggle: () => void) => {
    // Calculate group metadata
    const firstEntry = groupItems[0];
    const date = firstEntry.entry_date || (firstEntry.start_time ? new Date(firstEntry.start_time).toISOString().split('T')[0] : 'unknown');
    const projectName = firstEntry.project_name || t('timer.activeProject');
    const clientName = firstEntry.client_name;
    
    const totalDuration = getTotalDurationInHours(groupItems);

    return (
      <>
        <td className="px-4 py-3 align-middle">
          <ChevronRight
            className={cn(
              'h-4 w-4 text-gray-400 transition-transform duration-200 dark:text-gray-500',
              isExpanded && 'rotate-90'
            )}
            aria-hidden="true"
          />
        </td>
        <td className="whitespace-nowrap px-4 py-3 align-middle font-medium tabular-nums text-gray-900 dark:text-white">
          {formatDate(date, userLocale)}
        </td>
        <td className="px-4 py-3 align-middle text-gray-600 dark:text-gray-400">
          {clientName || '—'}
        </td>
        <td className="px-4 py-3 align-middle font-medium text-gray-900 dark:text-white">
          {projectName}
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-right align-middle">
          <div className="font-semibold tabular-nums text-gray-900 dark:text-white">
            {totalDuration.toFixed(2)}h
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {t('table.entryCount', { count: groupItems.length })}
          </div>
        </td>
        <td className="px-4 py-3 pr-5 text-right align-middle">
          <span className="hidden text-xs text-gray-500 sm:inline dark:text-gray-400">
            {isExpanded ? t('table.collapse') : t('table.expand')}
          </span>
        </td>
      </>
    );
  };

  return (
    <Table
      data={entries}
      columns={columns}
      groupBy={groupBy}
      groupHeaderRender={groupHeaderRender}
      groupSort={groupSort}
      pageSize={10}
    />
  );
};
