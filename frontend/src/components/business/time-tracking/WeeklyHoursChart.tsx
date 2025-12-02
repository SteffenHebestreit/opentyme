/**
 * @fileoverview Weekly hours visualization component.
 * 
 * Displays hours worked per day for the current week with filtering options
 * by customer/project and grouping capabilities.
 * 
 * Features:
 * - Bar chart showing daily hours for the week
 * - Filter by project/customer
 * - Group by project or show total
 * - Shows week total
 * 
 * @module components/business/time-tracking/WeeklyHoursChart
 */

import { FC, useMemo, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { TimeEntry, Project } from '../../../api/types';
import { Calendar, ChevronDown } from 'lucide-react';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { getChartColorForDate, prefetchHolidays, holidayDateCache } from '../../../utils/holidays-api';

// Register Chart.js components
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

interface WeeklyHoursChartProps {
  /** Time entries for the week */
  timeEntries: TimeEntry[];
  /** Available projects */
  projects: Project[];
  /** Week start date (YYYY-MM-DD) - defaults to current week's Monday */
  weekStart?: string;
  /** Week end date (YYYY-MM-DD) - defaults to current week's Sunday */
  weekEnd?: string;
}

interface DailyHours {
  date: string;
  dayName: string;
  hours: number;
  projectHours: Record<string, number>;
  clientHours: Record<string, number>;
  taskHours: Record<string, number>;
}

type GroupMode = 'none' | 'project' | 'task' | 'client';

/**
 * Gets project color for chart.
 */
function getProjectChartColor(projectName: string): string {
  const colors = [
    'rgb(59, 130, 246)',   // blue
    'rgb(168, 85, 247)',   // purple
    'rgb(236, 72, 153)',   // pink
    'rgb(99, 102, 241)',   // indigo
    'rgb(6, 182, 212)',    // cyan
    'rgb(20, 184, 166)',   // teal
    'rgb(34, 197, 94)',    // green
    'rgb(163, 230, 53)',   // lime
    'rgb(234, 179, 8)',    // yellow
    'rgb(249, 115, 22)',   // orange
    'rgb(239, 68, 68)',    // red
    'rgb(244, 63, 94)',    // rose
  ];
  
  let hash = 0;
  for (let i = 0; i < projectName.length; i++) {
    hash = projectName.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export const WeeklyHoursChart: FC<WeeklyHoursChartProps> = ({
  timeEntries,
  projects,
  weekStart,
  weekEnd,
}) => {
  const { t, i18n } = useTranslation('time-tracking');
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const [selectedTask, setSelectedTask] = useState<string>('all');
  const [groupMode, setGroupMode] = useState<GroupMode>('none');
  const [showFilters, setShowFilters] = useState(false);
  
  // Get localization settings from localStorage
  const region = localStorage.getItem('user_region') || undefined;
  
  // Prefetch holiday data for current year
  useEffect(() => {
    const currentYear = new Date().getFullYear();
    prefetchHolidays(currentYear, 'DE');
  }, []);
  
  // Get week range - use provided dates or calculate current week
  const currentWeekRange = useMemo(() => {
    // If weekStart and weekEnd are provided, use them
    if (weekStart && weekEnd) {
      return { start: weekStart, end: weekEnd };
    }
    
    // Default: current week (Monday to Sunday) in Europe/Berlin timezone
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Berlin' });
    const [year, month, day] = todayStr.split('-').map(Number);
    
    // Create date in local time
    const today = new Date(year, month - 1, day);
    const dayOfWeek = today.getDay();
    
    // Calculate Monday (start of week)
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    
    // Calculate Sunday (end of week)
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    
    // Format as YYYY-MM-DD without timezone conversion
    const formatDate = (d: Date) => {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    
    return {
      start: formatDate(monday),
      end: formatDate(sunday),
    };
  }, [weekStart, weekEnd]);
  
  // Filter entries for current week only
  const weekEntries = useMemo(() => {
    return timeEntries.filter(entry => {
      if (!entry.entry_date) return false;
      const entryDateStr = entry.entry_date.split('T')[0];
      return entryDateStr >= currentWeekRange.start && entryDateStr <= currentWeekRange.end;
    });
  }, [timeEntries, currentWeekRange]);
  
  // Apply project filter
  const filteredEntries = useMemo(() => {
    if (selectedProject === 'all') return weekEntries;
    return weekEntries.filter(entry => entry.project_id === selectedProject);
  }, [weekEntries, selectedProject]);
  
  // Calculate daily hours for all 7 days of the week (Monday to Sunday)
  const dailyHours = useMemo((): DailyHours[] => {
    // Use weekEntries instead of filteredEntries for grouping modes
    const entriesToProcess = groupMode === 'none' ? filteredEntries : weekEntries;
    
    // Create all 7 days of the week (Monday to Sunday)
    const days: DailyHours[] = [];
    const [startYear, startMonth, startDay] = currentWeekRange.start.split('-').map(Number);
    const weekMonday = new Date(startYear, startMonth - 1, startDay);
    
    for (let i = 0; i < 7; i++) {
      const date = new Date(weekMonday);
      date.setDate(weekMonday.getDate() + i);
      const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      
      days.push({
        date: dateStr,
        dayName: date.toLocaleDateString(i18n.language, { weekday: 'short' }),
        hours: 0,
        projectHours: {},
        clientHours: {},
        taskHours: {},
      });
    }
    
    // Fill in hours from entries
    entriesToProcess.forEach(entry => {
      if (!entry.entry_date) return;
      
      const dateStr = entry.entry_date.split('T')[0]; // Get YYYY-MM-DD
      const day = days.find(d => d.date === dateStr);
      
      if (day) {
        const hours = entry.duration_hours || 0;
        day.hours += hours;
        
        if (entry.project_name) {
          day.projectHours[entry.project_name] = (day.projectHours[entry.project_name] || 0) + hours;
        }
        if (entry.client_name) {
          day.clientHours[entry.client_name] = (day.clientHours[entry.client_name] || 0) + hours;
        }
        if (entry.task_name) {
          day.taskHours[entry.task_name] = (day.taskHours[entry.task_name] || 0) + hours;
        }
      }
    });
    
    return days;
  }, [filteredEntries, weekEntries, groupMode, i18n.language, currentWeekRange]);
  
  const totalWeekHours = useMemo(() => {
    return dailyHours.reduce((sum, day) => sum + day.hours, 0);
  }, [dailyHours]);
  
  // Prepare chart data
  const chartData = useMemo(() => {
    const labels = dailyHours.map(day => day.dayName);
    
    if (groupMode === 'none') {
      // Simple bar chart - total hours per day
      return {
        labels,
        datasets: [
          {
            label: t('charts.weeklyHours.hoursWorked'),
            data: dailyHours.map(day => day.hours),
            backgroundColor: 'rgba(168, 85, 247, 0.8)',
            borderColor: 'rgba(168, 85, 247, 1)',
            borderWidth: 1,
          },
        ],
      };
    }
    
    // Stacked bar chart - grouped by project
    if (groupMode === 'project') {
      const allProjects = Array.from(
        new Set(weekEntries.map(e => e.project_name).filter(Boolean))
      );
      
      const datasets = allProjects.map(projectName => ({
        label: projectName,
        data: dailyHours.map(day => day.projectHours[projectName!] || 0),
        backgroundColor: getProjectChartColor(projectName!),
        borderWidth: 0,
      }));
      
      return { labels, datasets };
    }
    
    if (groupMode === 'task') {
      // Stacked bar chart - grouped by task
      const allTasks = Array.from(
        new Set(weekEntries.map(e => e.task_name).filter(Boolean))
      );
      
      const datasets = allTasks.map((taskName, index) => ({
        label: taskName,
        data: dailyHours.map(day => day.taskHours[taskName!] || 0),
        backgroundColor: getProjectChartColor(taskName! + index),
        borderWidth: 0,
      }));
      
      return { labels, datasets };
    }
    
    if (groupMode === 'client') {
      // Stacked bar chart - grouped by client
      const allClients = Array.from(
        new Set(weekEntries.map(e => e.client_name).filter(Boolean))
      );
      
      const datasets = allClients.map((clientName, index) => ({
        label: clientName,
        data: dailyHours.map(day => day.clientHours[clientName!] || 0),
        backgroundColor: getProjectChartColor(clientName! + index),
        borderWidth: 0,
      }));
      
      return { labels, datasets };
    }
    
    return { labels, datasets: [] };
  }, [dailyHours, groupMode, weekEntries, t, region]);
  
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: groupMode !== 'none',
        position: 'bottom' as const,
      },
      tooltip: {
        callbacks: {
          label: (context: any) => {
            return `${context.dataset.label}: ${context.parsed.y.toFixed(2)}h`;
          },
          footer: (tooltipItems: any) => {
            const index = tooltipItems[0].dataIndex;
            if (index < dailyHours.length) {
              const dateStr = dailyHours[index].date;
              const holiday = holidayDateCache.get(dateStr);
              if (holiday) {
                return `\ud83c\udf89 ${holiday.name}`;
              }
            }
            return '';
          },
        },
      },
    },
    scales: {
      x: {
        stacked: groupMode !== 'none',
        grid: {
          display: false,
        },
        ticks: {
          color: function(context: any) {
            const index = context.index;
            if (index < dailyHours.length) {
              return getChartColorForDate(dailyHours[index].date, 'DE', region).replace('0.8)', '1)');
            }
            return '#6b7280'; // gray-500
          },
          font: {
            weight: 'bold' as const
          }
        }
      },
      y: {
        stacked: groupMode !== 'none',
        beginAtZero: true,
        ticks: {
          callback: (value: any) => `${value}h`,
        },
      },
    },
  };
  
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {t('charts.weeklyHours.title')}
          </h2>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {totalWeekHours.toFixed(2)}h
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {t('charts.weeklyHours.totalWeek')}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <ChevronDown
              className={`h-5 w-5 text-gray-600 transition-transform dark:text-gray-400 ${
                showFilters ? 'rotate-180' : ''
              }`}
            />
          </button>
        </div>
      </div>
      
      {/* Filters */}
      {showFilters && (
        <div className="mb-4 flex flex-wrap gap-4 rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
          <div className="flex-1 min-w-[200px]">
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('charts.filters.project')}
            </label>
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            >
              <option value="all">{t('charts.filters.allProjects')}</option>
              {projects.map(project => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>
          
          <div className="flex-1 min-w-[200px]">
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('charts.filters.grouping')}
            </label>
            <select
              value={groupMode}
              onChange={(e) => setGroupMode(e.target.value as GroupMode)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            >
              <option value="none">{t('charts.filters.noGrouping')}</option>
              <option value="client">
                {t('charts.filters.groupByClient')}
              </option>
              <option value="project">
                {t('charts.filters.groupByProject')}
              </option>
              <option value="task">
                {t('charts.filters.groupByTask')}
              </option>
            </select>
          </div>
        </div>
      )}
      
      {/* Chart */}
      <div className="h-64">
        <Bar data={chartData} options={chartOptions} />
      </div>
    </div>
  );
};
