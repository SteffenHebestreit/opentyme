/**
 * @fileoverview Daily hours visualization component.
 * 
 * Displays today's worked hours in a timeline format using Chart.js,
 * showing 24-hour timeline with color-coded projects.
 * 
 * Features:
 * - Visual 24-hour timeline
 * - Shows worked time entries with project colors
 * - Displays total hours worked today
 * - Hover tooltips with task details
 * 
 * @module components/business/time-tracking/DailyHoursChart
 */

import { FC, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { TimeEntry, Project } from '../../../api/types';
import { Clock } from 'lucide-react';
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
  /** Time entries for today */
  timeEntries: TimeEntry[];
  /** Available projects for color mapping */
  projects: Project[];
  /** Target date (defaults to today) */
  date?: string;
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
  date,
}) => {
  const { t } = useTranslation('time-tracking');
  
  const totalHours = useMemo(() => {
    return timeEntries.reduce((sum, entry) => sum + (entry.duration_hours || 0), 0);
  }, [timeEntries]);
  
  // Prepare data for horizontal stacked bar chart
  const chartData = useMemo(() => {
    // Group entries by project
    const projectGroups = new Map<string, TimeEntry[]>();
    
    timeEntries.forEach(entry => {
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
  }, [timeEntries]);
  
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
            {t('charts.dailyHours.title')}
          </h2>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {totalHours.toFixed(2)}h
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {t('charts.dailyHours.totalToday')}
          </div>
        </div>
      </div>
      
      <div className="relative" style={{ height: '120px' }}>
        <Bar data={chartData} options={options} />
      </div>
      
      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-3">
        {Array.from(new Set(timeEntries.map(e => e.project_name).filter(Boolean))).map(projectName => (
          <div key={projectName} className="flex items-center gap-2">
            <div className="h-3 w-3 rounded" style={{ backgroundColor: getProjectColor(projectName!) }} />
            <span className="text-xs text-gray-600 dark:text-gray-400">{projectName}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
