/**
 * @fileoverview Daily hours visualization component.
 * 
 * Displays worked hours for a selected date in a timeline format using Chart.js,
 * showing 24-hour timeline with color-coded projects.
 * 
 * Features:
 * - Visual 24-hour timeline
 * - Shows worked time entries with project colors
 * - Displays total hours worked
 * - Hover tooltips with task details
 * - Clickable date to change the displayed date
 * 
 * @module components/business/time-tracking/DailyHoursChart
 */

import React, { FC, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TimeEntry, Project } from '../../../api/types';
import { Clock, ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions,
  TooltipItem,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { useChartTheme } from '../../../hooks/ui/useChartTheme';
import { getChartThemeColors, getDefaultChartOptions, getSeriesCss, getSeriesFill, projectSlotsForDay } from '../../../utils/chartConfig';
import { AnimatedNumber } from '../../common/AnimatedNumber';
import { cn } from '../../../lib/cn';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

interface DailyHoursChartProps {
  /** All time entries (will be filtered by selected date) */
  timeEntries: TimeEntry[];
  /** Available projects for color mapping */
  projects: Project[];
  /** Selected date (YYYY-MM-DD format) - defaults to today */
  selectedDate?: string;
  /** Callback when date changes */
  onDateChange?: (date: string) => void;
}

/**
 * Converts HH:mm time string to minutes from midnight.
 */
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/** One worked period drawn on the timeline. */
interface TimelineSegment {
  x: [number, number];
  y: string;
  projectName: string;
  taskName: string | null;
  startTime: string;
  endTime?: string | null;
}

const formatHours = (value: number) => `${value.toFixed(2)}h`;

export const DailyHoursChart: FC<DailyHoursChartProps> = ({
  timeEntries,
  projects: _projects,
  selectedDate,
  onDateChange,
}) => {
  const { t, i18n } = useTranslation('time-tracking');
  const theme = useChartTheme();
  
  // Get today's date in Europe/Berlin timezone
  const today = useMemo(() => {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Berlin' });
  }, []);
  
  // Internal state for date when no external control
  const [internalDate, setInternalDate] = useState(today);
  
  // Reference for the hidden date input
  const dateInputRef = React.useRef<HTMLInputElement>(null);
  
  // Use selectedDate prop if provided, otherwise use internal state
  const currentDate = selectedDate !== undefined ? (selectedDate || today) : internalDate;
  const isToday = currentDate === today;
  
  // Handle date change
  const handleDateChange = (newDate: string) => {
    if (onDateChange) {
      onDateChange(newDate);
    } else {
      setInternalDate(newDate);
    }
  };
  
  // Navigate to previous/next day
  const navigateDay = (direction: 'prev' | 'next') => {
    const [year, month, day] = currentDate.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() + (direction === 'next' ? 1 : -1));
    // Format as YYYY-MM-DD without timezone conversion
    const newYear = date.getFullYear();
    const newMonth = String(date.getMonth() + 1).padStart(2, '0');
    const newDay = String(date.getDate()).padStart(2, '0');
    const newDate = `${newYear}-${newMonth}-${newDay}`;
    handleDateChange(newDate);
  };
  
  // Open date picker
  const openDatePicker = () => {
    dateInputRef.current?.showPicker();
  };

  // Filter entries for the selected date
  const filteredEntries = useMemo(() => {
    return timeEntries.filter(entry => 
      entry.entry_date === currentDate || entry.entry_date?.startsWith(currentDate)
    );
  }, [timeEntries, currentDate]);
  
  const totalHours = useMemo(() => {
    return filteredEntries.reduce((sum, entry) => sum + (entry.duration_hours || 0), 0);
  }, [filteredEntries]);
  
  // Format date for display
  const displayDate = useMemo(() => {
    const [year, month, day] = currentDate.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    if (isToday) {
      return t('charts.dailyHours.today');
    }
    return date.toLocaleDateString(i18n.language === 'de' ? 'de-DE' : 'en-US', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }, [currentDate, isToday, t, i18n.language]);
  
  // Palette slot per project, in order of the day's first entry (shared with the time slot picker)
  const projectSlots = useMemo(
    () =>
      projectSlotsForDay(
        filteredEntries.map(e => ({ project_name: e.project_name || t('charts.unknownProject'), entry_time: e.entry_time }))
      ),
    [filteredEntries, t]
  );

  // Prepare data for horizontal stacked bar chart
  const chartData = useMemo(() => {
    // Group entries by project
    const projectGroups = new Map<string, TimeEntry[]>();
    
    filteredEntries.forEach(entry => {
      const projectName = entry.project_name || t('charts.unknownProject');
      if (!projectGroups.has(projectName)) {
        projectGroups.set(projectName, []);
      }
      projectGroups.get(projectName)!.push(entry);
    });
    
    // Create dataset for each project showing work periods as bars
    const datasets = Array.from(projectGroups.entries()).map(([projectName, entries]) => {
      // Each entry becomes a bar segment
      const data = entries.map(entry => {
        if (!entry.entry_time) return null;
        
        const startMinutes = timeToMinutes(entry.entry_time);
        const endMinutes = entry.entry_end_time 
          ? timeToMinutes(entry.entry_end_time)
          : startMinutes + (entry.duration_hours * 60);
        
        return {
          x: [startMinutes / 60, endMinutes / 60], // Convert to hours (0-24)
          y: 'Today',
          projectName,
          taskName: entry.task_name,
          startTime: entry.entry_time,
          endTime: entry.entry_end_time,
        };
      }).filter(Boolean);
      
      return {
        label: projectName,
        data,
        backgroundColor: getSeriesFill(projectSlots.get(projectName) ?? 0, theme).fill,
        // A hairline in the card colour keeps back-to-back entries apart
        borderColor: getChartThemeColors(theme).surface,
        borderWidth: 1,
        borderSkipped: false,
        borderRadius: 4,
        barPercentage: 0.8,
        maxBarThickness: 32,
      };
    });
    
    return {
      labels: ['Today'],
      datasets,
    };
  }, [filteredEntries, projectSlots, t, theme]);
  
  const options = useMemo<ChartOptions<'bar'>>(() => {
    const colors = getChartThemeColors(theme);
    const base = getDefaultChartOptions(theme);
    return {
      indexAxis: 'y' as const,
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          min: 0,
          max: 24,
          border: { display: false },
          grid: {
            color: colors.grid,
            drawTicks: false,
          },
          ticks: {
            stepSize: 1,
            maxRotation: 0,
            autoSkipPadding: 12,
            padding: 8,
            callback: (value) => `${String(value).padStart(2, '0')}:00`,
            color: colors.text,
            font: {
              size: 11,
            },
          },
        },
        y: {
          border: { display: false },
          grid: {
            display: false,
          },
          ticks: {
            display: false,
          },
        },
      },
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          ...base.plugins?.tooltip,
          mode: 'nearest' as const,
          intersect: true,
          callbacks: {
            title: () => '',
            label: (context: TooltipItem<'bar'>) => {
              const data = context.raw as TimelineSegment;
              const lines = [];
              if (data.projectName) {
                lines.push(`${t('charts.tooltip.project')}: ${data.projectName}`);
              }
              if (data.taskName) {
                lines.push(`${t('charts.tooltip.task')}: ${data.taskName}`);
              }
              if (data.startTime) {
                const endTime = data.endTime || t('timer.ongoing');
                lines.push(`${t('charts.tooltip.time')}: ${data.startTime} - ${endTime}`);
              }
              return lines;
            },
          },
        },
      },
    };
  }, [theme, t]);

  const legendProjects = Array.from(new Set(filteredEntries.map(e => e.project_name).filter(Boolean)));
  const iconButtonClass =
    'inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 ' +
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white';
  
  return (
    <section className="surface flex flex-col p-5 sm:p-6" aria-labelledby="daily-hours-title">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2">
          <Clock className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400" aria-hidden="true" />
          <h2 id="daily-hours-title" className="section-title truncate">
            {isToday ? t('charts.dailyHours.title') : t('charts.dailyHours.titleDate')}
          </h2>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">
            <AnimatedNumber value={totalHours} format={formatHours} />
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {isToday ? t('charts.dailyHours.totalToday') : t('charts.dailyHours.totalDay')}
          </div>
        </div>
      </div>
      
      {/* Date navigation */}
      <div className="mb-4 flex items-center justify-center gap-1">
        <button
          type="button"
          onClick={() => navigateDay('prev')}
          className={iconButtonClass}
          aria-label={t('charts.dailyHours.previousDay')}
          title={t('charts.dailyHours.previousDay')}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        
        <div className="relative">
          <button
            type="button"
            onClick={openDatePicker}
            className={cn(
              'flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium tabular-nums transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
              isToday
                ? 'bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-600/15 hover:bg-brand-100 dark:bg-brand-500/10 dark:text-brand-300 dark:ring-brand-400/20 dark:hover:bg-brand-500/15'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-white/5 dark:text-gray-300 dark:hover:bg-white/10'
            )}
          >
            <Calendar className="h-4 w-4" aria-hidden="true" />
            {displayDate}
          </button>
          <input
            ref={dateInputRef}
            type="date"
            value={currentDate}
            onChange={(e) => e.target.value && handleDateChange(e.target.value)}
            max={today}
            className="pointer-events-none absolute left-0 top-0 h-0 w-0 opacity-0"
            tabIndex={-1}
            aria-hidden="true"
          />
        </div>
        
        <button
          type="button"
          onClick={() => navigateDay('next')}
          disabled={currentDate >= today}
          className={cn(iconButtonClass, 'disabled:pointer-events-none disabled:opacity-40')}
          aria-label={t('charts.dailyHours.nextDay')}
          title={t('charts.dailyHours.nextDay')}
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      
      <div className="relative" style={{ height: '150px' }}>
        <Bar data={chartData} options={options} />
        {filteredEntries.length === 0 ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 flex h-[114px] animate-fade-in items-center justify-center">
            <span className="rounded-md bg-white/90 px-2 py-0.5 text-sm text-gray-500 dark:bg-gray-900/90 dark:text-gray-400">
              {isToday ? t('charts.dailyHours.noData') : t('charts.dailyHours.noDataDay')}
            </span>
          </div>
        ) : null}
      </div>
      
      {/* Legend */}
      {legendProjects.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
          {legendProjects.map(projectName => (
            <div key={projectName} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={getSeriesCss(projectSlots.get(projectName!) ?? 0, theme)} aria-hidden="true" />
              <span className="text-xs text-gray-600 dark:text-gray-400">{projectName}</span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
};
