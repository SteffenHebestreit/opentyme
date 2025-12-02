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
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

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

/**
 * Gets a consistent color for a project by hashing its name.
 */
function getProjectColor(projectName: string): string {
  const colors = [
    '#3b82f6', // blue
    '#a855f7', // purple
    '#ec4899', // pink
    '#6366f1', // indigo
    '#06b6d4', // cyan
    '#14b8a6', // teal
    '#10b981', // green
    '#84cc16', // lime
    '#eab308', // yellow
    '#f97316', // orange
    '#ef4444', // red
    '#f43f5e', // rose
  ];
  
  let hash = 0;
  for (let i = 0; i < projectName.length; i++) {
    hash = projectName.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export const DailyHoursChart: FC<DailyHoursChartProps> = ({
  timeEntries,
  projects,
  selectedDate,
  onDateChange,
}) => {
  const { t, i18n } = useTranslation('time-tracking');
  
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
  
  // Prepare data for horizontal stacked bar chart
  const chartData = useMemo(() => {
    // Group entries by project
    const projectGroups = new Map<string, TimeEntry[]>();
    
    filteredEntries.forEach(entry => {
      const projectName = entry.project_name || 'Unknown';
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
        backgroundColor: getProjectColor(projectName),
        borderRadius: 4,
        barPercentage: 0.8,
      };
    });
    
    return {
      labels: ['Today'],
      datasets,
    };
  }, [filteredEntries]);
  
  const options: ChartOptions<'bar'> = {
    indexAxis: 'y' as const,
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        min: 0,
        max: 24,
        ticks: {
          stepSize: 1,
          callback: (value) => `${String(value).padStart(2, '0')}:00`,
          color: '#9ca3af',
          font: {
            size: 10,
          },
        },
        grid: {
          color: '#e5e7eb',
        },
      },
      y: {
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
        callbacks: {
          title: () => '',
          label: (context: any) => {
            const data = context.raw;
            const lines = [];
            if (data.projectName) {
              lines.push(`Project: ${data.projectName}`);
            }
            if (data.taskName) {
              lines.push(`Task: ${data.taskName}`);
            }
            if (data.startTime) {
              const endTime = data.endTime || 'ongoing';
              lines.push(`Time: ${data.startTime} - ${endTime}`);
            }
            return lines;
          },
        },
      },
    },
  };
  
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {isToday ? t('charts.dailyHours.title') : t('charts.dailyHours.titleDate')}
          </h2>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {totalHours.toFixed(2)}h
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {isToday ? t('charts.dailyHours.totalToday') : t('charts.dailyHours.totalDay')}
          </div>
        </div>
      </div>
      
      {/* Date navigation */}
      <div className="mb-4 flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => navigateDay('prev')}
          className="rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          title={t('charts.dailyHours.previousDay')}
        >
          <ChevronLeft className="h-5 w-5 text-gray-600 dark:text-gray-400" />
        </button>
        
        <div className="relative">
          <button
            type="button"
            onClick={openDatePicker}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer ${
              isToday 
                ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
          >
            <Calendar className="h-4 w-4" />
            {displayDate}
          </button>
          <input
            ref={dateInputRef}
            type="date"
            value={currentDate}
            onChange={(e) => e.target.value && handleDateChange(e.target.value)}
            max={today}
            className="absolute top-0 left-0 w-0 h-0 opacity-0 pointer-events-none"
            tabIndex={-1}
          />
        </div>
        
        <button
          type="button"
          onClick={() => navigateDay('next')}
          disabled={currentDate >= today}
          className={`rounded-lg p-1.5 transition-colors ${
            currentDate >= today
              ? 'opacity-50 cursor-not-allowed'
              : 'hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
          title={t('charts.dailyHours.nextDay')}
        >
          <ChevronRight className="h-5 w-5 text-gray-600 dark:text-gray-400" />
        </button>
      </div>
      
      <div className="relative" style={{ height: '120px' }}>
        <Bar data={chartData} options={options} />
      </div>
      
      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-3">
        {Array.from(new Set(filteredEntries.map(e => e.project_name).filter(Boolean))).map(projectName => (
          <div key={projectName} className="flex items-center gap-2">
            <div className="h-3 w-3 rounded" style={{ backgroundColor: getProjectColor(projectName!) }} />
            <span className="text-xs text-gray-600 dark:text-gray-400">{projectName}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
