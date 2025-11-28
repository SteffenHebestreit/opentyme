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
 * - Action buttons: Edit, Delete, and Stop timer (for active entries)
 * - Loading states: Shows loading text during delete/stop operations
 * - Responsive design: Horizontal scroll on small screens
 * - Empty state: Returns null when no entries to display
 * 
 * @module components/business/time-tracking/TimeEntryTable
 */

import { FC, useMemo } from 'react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { TimeEntry } from '../../../api/types';
import { Button } from '../../common/Button';
import { Table, Column } from '../../common/Table';

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
  onStop?: (entry: TimeEntry) => void;
  isDeletingId?: string | null;
  isStoppingId?: string | null;
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
  onStop,
  isDeletingId,
  isStoppingId,
}) => {
  const { t } = useTranslation('time-tracking');
  const userLocale = navigator.language || 'de-DE';

  const columns: Column<TimeEntry>[] = useMemo(() => [
    {
      key: 'date',
      accessorKey: 'entry_date',
      header: t('table.date'),
      render: (entry) => (
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {entry.entry_time || formatTimeRange(entry.start_time, entry.end_time, userLocale)}
        </div>
      ),
      sortable: true,
      groupSortValue: (_, items) => items[0]?.entry_date || items[0]?.start_time || '',
    },
    {
      key: 'client',
      accessorKey: 'client_name',
      header: t('table.client'),
      render: (entry) => (
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {entry.client_name || '—'}
        </div>
      ),
      sortable: true,
      groupSortValue: (_, items) => items[0]?.client_name || '',
    },
    {
      key: 'project',
      accessorKey: 'task_name',
      header: t('table.project'),
      render: (entry) => (
        <>
          <div className="font-medium text-gray-900 dark:text-white">
            {entry.task_name || t('timer.untitledTask')}
          </div>
          {entry.description ? (
            <p className="mt-1 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
              {entry.description}
            </p>
          ) : null}
        </>
      ),
      sortable: true,
      sortValue: (entry) => entry.task_name || t('timer.untitledTask'),
      groupSortValue: (_, items) => items[0]?.task_name || t('timer.untitledTask'),
    },
    {
      key: 'duration',
      accessorKey: 'duration_hours',
      header: t('table.duration'),
      render: (entry) => (
        <div className="text-gray-700 dark:text-gray-300">
          {entry.duration_hours && !isNaN(entry.duration_hours) ? `${entry.duration_hours.toFixed(2)}h` : formatDuration(entry)}
        </div>
      ),
      sortable: true,
      sortValue: (entry) => getDurationInHours(entry),
      groupSortValue: (_, items) => getTotalDurationInHours(items),
    },
    {
      key: 'actions',
      header: t('table.actions'),
      align: 'right',
      render: (entry) => (
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onEdit(entry)}
          >
            {t('edit')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="danger"
            onClick={() => onDelete(entry)}
            disabled={isDeletingId === entry.id}
          >
            {isDeletingId === entry.id ? t('deleting') : t('delete')}
          </Button>
        </div>
      ),
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

  const groupHeaderRender = (groupKey: string, groupItems: TimeEntry[], isExpanded: boolean, toggle: () => void) => {
    // Calculate group metadata
    const firstEntry = groupItems[0];
    const date = firstEntry.entry_date || (firstEntry.start_time ? new Date(firstEntry.start_time).toISOString().split('T')[0] : 'unknown');
    const projectName = firstEntry.project_name || t('timer.activeProject');
    const clientName = firstEntry.client_name;
    
    const totalDuration = getTotalDurationInHours(groupItems);

    return (
      <>
        <td className="px-6 py-4 align-middle">
          <svg
            className={clsx('h-5 w-5 text-gray-500 dark:text-gray-400 transition-transform', {
              'rotate-90': isExpanded,
            })}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </td>
        <td className="px-6 py-4 align-middle">
          <div className="font-medium text-gray-900 dark:text-white">
            {formatDate(date, userLocale)}
          </div>
        </td>
        <td className="px-6 py-4 align-middle">
          <div className="text-gray-700 dark:text-gray-300">
            {clientName || '—'}
          </div>
        </td>
        <td className="px-6 py-4 align-middle">
          <div className="font-medium text-gray-900 dark:text-white">
            {projectName}
          </div>
        </td>
        <td className="px-6 py-4 align-middle">
          <div className="font-semibold text-gray-900 dark:text-white">
            {totalDuration.toFixed(2)}h
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {groupItems.length} {groupItems.length === 1 ? 'Eintrag' : 'Einträge'}
          </p>
        </td>
        <td className="px-6 py-4 text-right align-middle">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {isExpanded ? 'Einklappen' : 'Erweitern'}
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
