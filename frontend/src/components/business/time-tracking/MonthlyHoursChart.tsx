/**
 * @fileoverview Monthly hours visualization component.
 * 
 * Displays hours worked per day/week for the current month with filtering options
 * by customer/project/task and grouping capabilities.
 * 
 * Features:
 * - Bar chart showing daily or weekly hours for the month
 * - Filter by project/customer/task
 * - Group by project, task, or show total
 * - Toggle between daily and weekly view
 * - Shows month total
 * 
 * @module components/business/time-tracking/MonthlyHoursChart
 */

import { FC, useMemo, useState, useEffect, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { TimeEntry, Project } from '../../../api/types';
import { BarChart3, ChevronDown } from 'lucide-react';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ChartOptions, Scale, ScriptableScaleContext, TooltipItem } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { getDayKindForDate, prefetchHolidays, holidayDateCache } from '../../../utils/holidays-api';
import { useChartTheme } from '../../../hooks/ui/useChartTheme';
import { chartColors, dayBandsPlugin, getBarChartOptions, getChartThemeColors, getDayTickStyle, getSeriesFill } from '../../../utils/chartConfig';
import { DayMarkerLegend } from './DayMarkerLegend';
import { AnimatedNumber } from '../../common/AnimatedNumber';
import { fieldClasses, fieldLabelClass } from '../../forms/fieldStyles';
import { cn } from '../../../lib/cn';

// Register Chart.js components
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

interface MonthlyHoursChartProps {
  /** Time entries for the month */
  timeEntries: TimeEntry[];
  /** Available projects */
  projects: Project[];
  /** Month start date (YYYY-MM-DD) - defaults to current month's first day */
  monthStart?: string;
  /** Month end date (YYYY-MM-DD) - defaults to current month's last day */
  monthEnd?: string;
}

interface PeriodHours {
  label: string;
  date: string;
  hours: number;
  projectHours: Record<string, number>;
  taskHours: Record<string, number>;
  clientHours: Record<string, number>;
}

type ViewMode = 'daily' | 'weekly';
type GroupMode = 'none' | 'project' | 'task' | 'client';

/**
 * Gets the start and end of the current month in Europe/Berlin timezone.
 */
/**
 * Gets Monday of the week for a given date.
 */
function getWeekStart(date: Date): Date {
  const dayOfWeek = date.getDay();
  const monday = new Date(date);
  monday.setDate(date.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

const formatHours = (value: number) => `${value.toFixed(2)}h`;

export const MonthlyHoursChart: FC<MonthlyHoursChartProps> = ({
  timeEntries,
  projects,
  monthStart,
  monthEnd,
}) => {
  const { t, i18n } = useTranslation('time-tracking');
  const theme = useChartTheme();
  const fieldId = useId();
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const [selectedTask, setSelectedTask] = useState<string>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('daily');
  const [groupMode, setGroupMode] = useState<GroupMode>('none');
  const [showFilters, setShowFilters] = useState(false);
  const [holidaysLoaded, setHolidaysLoaded] = useState(0);
  
  // Get localization settings from localStorage
  const region = localStorage.getItem('user_region') || undefined;
  
  
  // Get month range - use provided dates or calculate current month
  const currentMonthRange = useMemo(() => {
    // If monthStart and monthEnd are provided, use them
    if (monthStart && monthEnd) {
      return { start: monthStart, end: monthEnd };
    }
    
    // Default: current month in Europe/Berlin timezone
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Berlin' });
    const [year, month] = todayStr.split('-').map(Number);
    
    // Create dates in local time
    const start = new Date(year, month - 1, 1); // 1st day of current month
    const end = new Date(year, month, 0); // Last day of current month
    
    // Format as YYYY-MM-DD without timezone conversion
    const formatDate = (d: Date) => {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    
    return {
      start: formatDate(start),
      end: formatDate(end),
    };
  }, [monthStart, monthEnd]);

  // Load the holidays of the shown range's year(s); the chart redraws once they are in
  useEffect(() => {
    const years = new Set([currentMonthRange.start, currentMonthRange.end].map(d => Number(d.slice(0, 4))));
    let cancelled = false;
    Promise.all([...years].map(year => prefetchHolidays(year, 'DE'))).then(() => {
      if (!cancelled) setHolidaysLoaded(n => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [currentMonthRange]);
  
  // Filter entries for current month only
  const monthEntries = useMemo(() => {
    return timeEntries.filter(entry => {
      if (!entry.entry_date) return false;
      const entryDateStr = entry.entry_date.split('T')[0];
      return entryDateStr >= currentMonthRange.start && entryDateStr <= currentMonthRange.end;
    });
  }, [timeEntries, currentMonthRange]);
  
  // Apply filters
  const filteredEntries = useMemo(() => {
    let entries = monthEntries;
    
    if (selectedProject !== 'all') {
      entries = entries.filter(entry => entry.project_id === selectedProject);
    }
    
    if (selectedTask !== 'all') {
      entries = entries.filter(entry => entry.task_name === selectedTask);
    }
    
    return entries;
  }, [monthEntries, selectedProject, selectedTask]);
  
  // Get available tasks for selected project
  const availableTasks = useMemo(() => {
    const entries = selectedProject === 'all' 
      ? monthEntries 
      : monthEntries.filter(e => e.project_id === selectedProject);
    
    return Array.from(
      new Set(entries.map(e => e.task_name).filter(Boolean))
    ).sort();
  }, [monthEntries, selectedProject]);
  
  // Calculate period hours (daily or weekly)
  const periodHours = useMemo((): PeriodHours[] => {
    // Use monthEntries instead of filteredEntries for grouping modes
    const entriesToProcess = groupMode === 'none' ? filteredEntries : monthEntries;
    
    if (viewMode === 'daily') {
      // Daily view - only show days that have actual entries
      const daysMap = new Map<string, PeriodHours>();
      
      entriesToProcess.forEach(entry => {
        if (!entry.entry_date) return;
        
        const dateStr = entry.entry_date.split('T')[0]; // Get YYYY-MM-DD
        
        if (!daysMap.has(dateStr)) {
          const date = new Date(dateStr + 'T00:00:00');
          daysMap.set(dateStr, {
            label: date.toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' }),
            date: dateStr,
            hours: 0,
            projectHours: {},
            taskHours: {},
            clientHours: {},
          });
        }
        
        const day = daysMap.get(dateStr)!;
        const hours = entry.duration_hours || 0;
        day.hours += hours;
        
        if (entry.project_name) {
          day.projectHours[entry.project_name] = (day.projectHours[entry.project_name] || 0) + hours;
        }
        if (entry.task_name) {
          day.taskHours[entry.task_name] = (day.taskHours[entry.task_name] || 0) + hours;
        }
        if (entry.client_name) {
          day.clientHours[entry.client_name] = (day.clientHours[entry.client_name] || 0) + hours;
        }
      });
      
      return Array.from(daysMap.values()).sort((a, b) => a.date.localeCompare(b.date));
    } else {
      // Weekly view
      const weeksMap = new Map<string, PeriodHours>();
      
      entriesToProcess.forEach(entry => {
        if (!entry.entry_date) return;
        
        const entryDate = new Date(entry.entry_date);
        const weekStart = getWeekStart(entryDate);
        const weekKey = weekStart.toISOString().split('T')[0];
        
        if (!weeksMap.has(weekKey)) {
          const weekEnd = new Date(weekStart);
          weekEnd.setDate(weekStart.getDate() + 6);
          
          weeksMap.set(weekKey, {
            label: `${weekStart.toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' })} - ${weekEnd.toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' })}`,
            date: weekKey,
            hours: 0,
            projectHours: {},
            taskHours: {},
            clientHours: {},
          });
        }
        
        const week = weeksMap.get(weekKey)!;
        const hours = entry.duration_hours || 0;
        week.hours += hours;
        
        if (entry.project_name) {
          week.projectHours[entry.project_name] = (week.projectHours[entry.project_name] || 0) + hours;
        }
        if (entry.task_name) {
          week.taskHours[entry.task_name] = (week.taskHours[entry.task_name] || 0) + hours;
        }
        if (entry.client_name) {
          week.clientHours[entry.client_name] = (week.clientHours[entry.client_name] || 0) + hours;
        }
      });
      
      return Array.from(weeksMap.values()).sort((a, b) => a.date.localeCompare(b.date));
    }
  }, [filteredEntries, monthEntries, groupMode, viewMode, i18n.language]);
  
  const totalMonthHours = useMemo(() => {
    return periodHours.reduce((sum, period) => sum + period.hours, 0);
  }, [periodHours]);
  
  // Prepare chart data
  const chartData = useMemo(() => {
    const labels = periodHours.map(period => period.label);
    // Stacked segments are separated by a 2px gap in the card colour
    const stackedSegmentStyle = {
      borderWidth: { top: 2, right: 0, bottom: 0, left: 0 },
      borderColor: getChartThemeColors(theme).surface,
      borderSkipped: 'start' as const,
      borderRadius: 0,
      maxBarThickness: 24,
    };
    
    if (groupMode === 'none') {
      // Simple bar chart - total hours per period
      return {
        labels,
        datasets: [
          {
            label: t('charts.monthlyHours.hoursWorked'),
            data: periodHours.map(period => period.hours),
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
    
    // Stacked bar chart - grouped by project, task or client. Series are ordered by their
    // total (biggest first) and get distinct palette slots — from the seventh on the
    // colours come back hatched — so no two series share a fill.
    const key = groupMode === 'project' ? 'projectHours' : groupMode === 'task' ? 'taskHours' : 'clientHours';
    const totals = new Map<string, number>();
    periodHours.forEach(period =>
      Object.entries(period[key]).forEach(([name, hours]) => totals.set(name, (totals.get(name) || 0) + hours))
    );
    const names = [...totals.keys()].sort((a, b) => (totals.get(b) || 0) - (totals.get(a) || 0));
    const datasets = names.map((name, index) => {
      const { color, fill } = getSeriesFill(index, theme);
      return {
        label: name,
        data: periodHours.map(period => period[key][name] || 0),
        backgroundColor: fill,
        hoverBackgroundColor: color,
        ...stackedSegmentStyle,
      };
    });

    return { labels, datasets };
  }, [periodHours, groupMode, t, theme]);
  
  // Memoize chart options with holidaysLoaded dependency to re-render when holidays are fetched
  const chartOptions = useMemo<ChartOptions<'bar'>>(() => {
    const base = getBarChartOptions(undefined, false, theme);
    const stacked = groupMode !== 'none';
    // Day markers only make sense when each bar is a day
    const dayKindAt = (index?: number) =>
      viewMode === 'daily' && index != null && index < periodHours.length
        ? getDayKindForDate(periodHours[index].date, 'DE', region)
        : 'weekday';
    return {
      ...base,
      maintainAspectRatio: false,
      plugins: {
        ...base.plugins,
        // Weekends and holidays get a background band behind their column (daily view)
        dayBands: { kinds: periodHours.map((_, index) => dayKindAt(index)), theme },
        legend: {
          ...base.plugins?.legend,
          display: stacked,
          position: 'bottom' as const,
        },
        tooltip: {
          ...base.plugins?.tooltip,
          // Stacked views list only the series that have hours in that period
          filter: (item: TooltipItem<'bar'>) => !stacked || (item.parsed.y ?? 0) > 0,
          callbacks: {
            label: (context: TooltipItem<'bar'>) => {
              return `${context.dataset.label}: ${(context.parsed.y ?? 0).toFixed(2)}h`;
            },
            footer: (tooltipItems: TooltipItem<'bar'>[]) => {
              const index = tooltipItems[0]?.dataIndex ?? -1;
              if (index >= 0 && index < periodHours.length) {
                const kind = dayKindAt(index);
                if (kind === 'national-holiday' || kind === 'regional-holiday') {
                  return `${t('charts.holiday')}: ${holidayDateCache.get(periodHours[index].date)?.name ?? ''}`;
                }
                if (kind === 'weekend') return t('charts.weekend');
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
            // Weekends recede, holidays get colour, weight and a marker (never colour alone).
            // tick.value is the data index — tick indexes shift when labels are skipped.
            color: (context: ScriptableScaleContext) => getDayTickStyle(dayKindAt(context.tick?.value), theme).color,
            font: (context: ScriptableScaleContext) => ({
              size: 11,
              weight: getDayTickStyle(dayKindAt(context.tick?.value), theme).weight,
            }),
            callback: function (this: Scale, value: string | number) {
              return this.getLabelForValue(Number(value)) + getDayTickStyle(dayKindAt(Number(value)), theme).marker;
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
    // holidaysLoaded: holiday colours/names are read from a cache filled asynchronously
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, groupMode, periodHours, region, holidaysLoaded, viewMode, t]);
  
  return (
    <section className="surface flex flex-col p-5 sm:p-6" aria-labelledby={`${fieldId}-title`}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2">
          <BarChart3 className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400" aria-hidden="true" />
          <h2 id={`${fieldId}-title`} className="section-title truncate">
            {t('charts.monthlyHours.title')}
          </h2>
        </div>
        <div className="flex shrink-0 items-start gap-3">
          <div className="text-right">
            <div className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">
              <AnimatedNumber value={totalMonthHours} format={formatHours} />
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {t('charts.monthlyHours.totalMonth')}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            aria-expanded={showFilters}
            aria-controls={`${fieldId}-filters`}
            aria-label={t('charts.filters.toggle')}
            title={t('charts.filters.toggle')}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white"
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
            <div className="grid grid-cols-1 gap-3 rounded-lg bg-gray-50 p-3 sm:grid-cols-2 lg:grid-cols-4 dark:bg-white/[0.03]">
              {/* View Mode */}
              <div>
                <label htmlFor={`${fieldId}-view`} className={fieldLabelClass()}>
                  {t('charts.filters.viewMode')}
                </label>
                <select
                  id={`${fieldId}-view`}
                  value={viewMode}
                  onChange={(e) => setViewMode(e.target.value as ViewMode)}
                  className={cn(fieldClasses({ size: 'sm' }), 'cursor-pointer')}
                >
                  <option value="daily">{t('charts.filters.daily')}</option>
                  <option value="weekly">{t('charts.filters.weekly')}</option>
                </select>
              </div>
              
              {/* Project Filter */}
              <div>
                <label htmlFor={`${fieldId}-project`} className={fieldLabelClass()}>
                  {t('charts.filters.project')}
                </label>
                <select
                  id={`${fieldId}-project`}
                  value={selectedProject}
                  onChange={(e) => {
                    setSelectedProject(e.target.value);
                    setSelectedTask('all'); // Reset task when project changes
                  }}
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
              
              {/* Task Filter */}
              <div>
                <label htmlFor={`${fieldId}-task`} className={fieldLabelClass()}>
                  {t('charts.filters.task')}
                </label>
                <select
                  id={`${fieldId}-task`}
                  value={selectedTask}
                  onChange={(e) => setSelectedTask(e.target.value)}
                  disabled={availableTasks.length === 0}
                  className={cn(fieldClasses({ size: 'sm' }), 'cursor-pointer')}
                >
                  <option value="all">{t('charts.filters.allTasks')}</option>
                  {availableTasks.map(task => (
                    <option key={task ?? ''} value={task ?? ''}>
                      {task}
                    </option>
                  ))}
                </select>
              </div>
              
              {/* Group Mode */}
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
        {periodHours.length > 0 ? (
          <Bar key={`chart-${holidaysLoaded}`} data={chartData} options={chartOptions} plugins={[dayBandsPlugin]} />
        ) : (
          <div className="flex h-full animate-fade-in flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-gray-200 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
            <BarChart3 className="h-5 w-5 text-gray-300 dark:text-gray-600" aria-hidden="true" />
            {t('charts.monthlyHours.noData')}
          </div>
        )}
      </div>
      <DayMarkerLegend dates={viewMode === 'daily' ? periodHours.map(period => period.date) : []} region={region} />
    </section>
  );
};
