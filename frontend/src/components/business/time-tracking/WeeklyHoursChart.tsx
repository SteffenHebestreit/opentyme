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

import { FC, useMemo, useState, useEffect, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { TimeEntry, Project } from '../../../api/types';
import { Calendar, ChevronDown } from 'lucide-react';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ChartOptions, ScriptableScaleContext, TooltipItem } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { getChartColorForDate, prefetchHolidays, holidayDateCache } from '../../../utils/holidays-api';
import { useChartTheme } from '../../../hooks/ui/useChartTheme';
import { chartColors, chartPalette, getBarChartOptions, getChartThemeColors } from '../../../utils/chartConfig';
import { AnimatedNumber } from '../../common/AnimatedNumber';
import { fieldClasses, fieldLabelClass } from '../../forms/fieldStyles';
import { cn } from '../../../lib/cn';

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
 * Gets project color for chart (the app's categorical chart palette).
 */
function getProjectChartColor(projectName: string): string {
  let hash = 0;
  for (let i = 0; i < projectName.length; i++) {
    hash = projectName.charCodeAt(i) + ((hash << 5) - hash);
  }
  return chartPalette[Math.abs(hash) % chartPalette.length];
}

/** Colour getChartColorForDate() returns for an ordinary working day. */
const REGULAR_DAY_COLOR = 'rgba(168, 85, 247, 0.8)';

const formatHours = (value: number) => `${value.toFixed(2)}h`;

export const WeeklyHoursChart: FC<WeeklyHoursChartProps> = ({
  timeEntries,
  projects,
  weekStart,
  weekEnd,
}) => {
  const { t, i18n } = useTranslation('time-tracking');
  const theme = useChartTheme();
  const fieldId = useId();
  const [selectedProject, setSelectedProject] = useState<string>('all');
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
    // Stacked segments are separated by a 2px gap in the card colour
    const stackedSegmentStyle = {
      borderWidth: { top: 2, right: 0, bottom: 0, left: 0 },
      borderColor: getChartThemeColors(theme).surface,
      borderSkipped: 'start' as const,
      borderRadius: 0,
      maxBarThickness: 24,
    };
    
    if (groupMode === 'none') {
      // Simple bar chart - total hours per day
      return {
        labels,
        datasets: [
          {
            label: t('charts.weeklyHours.hoursWorked'),
            data: dailyHours.map(day => day.hours),
            backgroundColor: chartColors.primary,
            hoverBackgroundColor: chartColors.primaryDark,
            borderWidth: 0,
            borderRadius: 4,
            borderSkipped: 'start' as const,
            maxBarThickness: 24,
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
        label: projectName ?? '',
        data: dailyHours.map(day => day.projectHours[projectName!] || 0),
        backgroundColor: getProjectChartColor(projectName!),
        ...stackedSegmentStyle,
      }));
      
      return { labels, datasets };
    }
    
    if (groupMode === 'task') {
      // Stacked bar chart - grouped by task
      const allTasks = Array.from(
        new Set(weekEntries.map(e => e.task_name).filter(Boolean))
      );
      
      const datasets = allTasks.map((taskName, index) => ({
        label: taskName ?? '',
        data: dailyHours.map(day => day.taskHours[taskName!] || 0),
        backgroundColor: getProjectChartColor(taskName! + index),
        ...stackedSegmentStyle,
      }));
      
      return { labels, datasets };
    }
    
    if (groupMode === 'client') {
      // Stacked bar chart - grouped by client
      const allClients = Array.from(
        new Set(weekEntries.map(e => e.client_name).filter(Boolean))
      );
      
      const datasets = allClients.map((clientName, index) => ({
        label: clientName ?? '',
        data: dailyHours.map(day => day.clientHours[clientName!] || 0),
        backgroundColor: getProjectChartColor(clientName! + index),
        ...stackedSegmentStyle,
      }));
      
      return { labels, datasets };
    }
    
    return { labels, datasets: [] };
  }, [dailyHours, groupMode, weekEntries, t, region, theme]);
  
  const chartOptions = useMemo<ChartOptions<'bar'>>(() => {
    const base = getBarChartOptions(undefined, false, theme);
    const colors = getChartThemeColors(theme);
    const stacked = groupMode !== 'none';
    return {
      ...base,
      maintainAspectRatio: false,
      plugins: {
        ...base.plugins,
        legend: {
          ...base.plugins?.legend,
          display: stacked,
          position: 'bottom' as const,
        },
        tooltip: {
          ...base.plugins?.tooltip,
          // Stacked views list only the series that have hours that day
          filter: (item: TooltipItem<'bar'>) => !stacked || (item.parsed.y ?? 0) > 0,
          callbacks: {
            label: (context: TooltipItem<'bar'>) => {
              return `${context.dataset.label}: ${(context.parsed.y ?? 0).toFixed(2)}h`;
            },
            footer: (tooltipItems: TooltipItem<'bar'>[]) => {
              const index = tooltipItems[0]?.dataIndex ?? -1;
              if (index >= 0 && index < dailyHours.length) {
                const dateStr = dailyHours[index].date;
                const holiday = holidayDateCache.get(dateStr);
                if (holiday) {
                  return `${t('charts.holiday')}: ${holiday.name}`;
                }
              }
              return '';
            },
          },
        },
      },
      scales: {
        x: {
          ...base.scales?.x,
          stacked,
          ticks: {
            ...base.scales?.x?.ticks,
            // Weekends and holidays keep their marker colour; ordinary days use the axis colour
            color: (context: ScriptableScaleContext) => {
              const index = context.index;
              if (index < dailyHours.length) {
                const dayColor = getChartColorForDate(dailyHours[index].date, 'DE', region);
                return dayColor === REGULAR_DAY_COLOR ? colors.text : dayColor.replace('0.8)', '1)');
              }
              return colors.text;
            },
            font: {
              size: 11,
              weight: 600,
            },
          },
        },
        y: {
          ...base.scales?.y,
          stacked,
          beginAtZero: true,
          ticks: {
            ...base.scales?.y?.ticks,
            callback: (value: string | number) => `${value}h`,
          },
        },
      },
    };
  }, [theme, groupMode, dailyHours, region, t]);
  
  return (
    <section className="surface flex flex-col p-5 sm:p-6" aria-labelledby={`${fieldId}-title`}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2">
          <Calendar className="h-4 w-4 shrink-0 text-purple-600 dark:text-purple-400" aria-hidden="true" />
          <h2 id={`${fieldId}-title`} className="section-title truncate">
            {t('charts.weeklyHours.title')}
          </h2>
        </div>
        <div className="flex shrink-0 items-start gap-3">
          <div className="text-right">
            <div className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">
              <AnimatedNumber value={totalWeekHours} format={formatHours} />
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {t('charts.weeklyHours.totalWeek')}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            aria-expanded={showFilters}
            aria-controls={`${fieldId}-filters`}
            aria-label={t('charts.filters.toggle')}
            title={t('charts.filters.toggle')}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white"
          >
            <ChevronDown
              className={cn('h-4 w-4 transition-transform duration-200', showFilters && 'rotate-180')}
              aria-hidden="true"
            />
          </button>
        </div>
      </div>
      
      {/* Filters */}
      <div
        id={`${fieldId}-filters`}
        className="collapsible"
        data-open={showFilters}
        // Collapsed options stay mounted (for the animation) but out of the tab order
        ref={(el) => {
          if (el) el.inert = !showFilters;
        }}
      >
        <div>
          <div className="pb-4">
            <div className="grid grid-cols-1 gap-3 rounded-lg bg-gray-50 p-3 sm:grid-cols-2 dark:bg-white/[0.03]">
              <div>
                <label htmlFor={`${fieldId}-project`} className={fieldLabelClass()}>
                  {t('charts.filters.project')}
                </label>
                <select
                  id={`${fieldId}-project`}
                  value={selectedProject}
                  onChange={(e) => setSelectedProject(e.target.value)}
                  className={cn(fieldClasses({ size: 'sm' }), 'cursor-pointer')}
                >
                  <option value="all">{t('charts.filters.allProjects')}</option>
                  {projects.map(project => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label htmlFor={`${fieldId}-grouping`} className={fieldLabelClass()}>
                  {t('charts.filters.grouping')}
                </label>
                <select
                  id={`${fieldId}-grouping`}
                  value={groupMode}
                  onChange={(e) => setGroupMode(e.target.value as GroupMode)}
                  className={cn(fieldClasses({ size: 'sm' }), 'cursor-pointer')}
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
          </div>
        </div>
      </div>
      
      {/* Chart */}
      <div className="h-64">
        <Bar data={chartData} options={chartOptions} />
      </div>
    </section>
  );
};
