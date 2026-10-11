/**
 * @fileoverview Time Trend Chart component.
 *
 * Displays a line chart showing time tracking trends over days:
 * - Total hours (brand cyan line with a soft area fill)
 * - Billable hours (emerald line)
 * - Non-billable hours (dashed grey line)
 *
 * Includes a date range selector (30/60/90 days). Follows the light/dark theme.
 *
 * @module components/dashboard/charts/TimeTrendChart
 */

import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  LineController,
  Filler,
  Title,
  Tooltip,
  Legend,
  ChartOptions,
} from 'chart.js';
import { LineChart } from 'lucide-react';
import { useTimeTrend } from '../../../hooks/api/useAnalytics';
import { useChartColors } from '../../../hooks/ui/useChartTheme';
import { chartColors, getLineChartOptions, withAlpha } from '../../../utils/chartConfig';
import { parseYmd } from '../../../utils/date';
import { Tabs } from '../../common/Tabs';
import { ChartPanel, ChartStatus } from './ChartPanel';
import { formatDecimal } from './chartFormat';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  LineController,
  Filler,
  Title,
  Tooltip,
  Legend
);

/**
 * Day range options
 */
type DayRange = 30 | 60 | 90;

const dayRangeOptions: DayRange[] = [30, 60, 90];

const TAB_PREFIX = 'time-trend-';
const CHART_HEIGHT = 300;

/**
 * TimeTrendChart Component
 *
 * @returns Line chart showing time tracking trends
 */
const TimeTrendChart: React.FC = () => {
  const { t, i18n } = useTranslation('dashboard');
  const chartColorSet = useChartColors();
  const theme = chartColorSet.theme;
  const locale = i18n.language;
  const [selectedDays, setSelectedDays] = useState<DayRange>(90);
  const { data, isLoading, error } = useTimeTrend(selectedDays);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<ChartJS | null>(null);

  const hasHours = !!data && data.some(
    (point) => point.total_hours > 0 || point.billable_hours > 0 || point.non_billable_hours > 0
  );
  const status: ChartStatus = isLoading ? 'loading' : error ? 'error' : hasHours ? 'ready' : 'empty';

  useEffect(() => {
    if (!canvasRef.current || !data || data.length === 0) return;

    // Destroy existing chart
    if (chartRef.current) {
      chartRef.current.destroy();
    }

    const nonBillableColor = theme === 'dark' ? chartColors.gray[500] : chartColors.gray[400];

    // Prepare chart data
    const chartData = {
      labels: data.map((point) => {
        const date = parseYmd(point.date) ?? new Date(point.date);
        return date.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
      }),
      datasets: [
        {
          label: t('charts.timeTrend.totalHours'),
          data: data.map((point) => point.total_hours),
          borderColor: chartColors.primary,
          backgroundColor: withAlpha(chartColors.primary, theme === 'dark' ? 0.14 : 0.08),
          pointBackgroundColor: chartColors.primary,
          // Each series has its own point shape (shown in the legend) besides its colour
          pointStyle: 'circle' as const,
          fill: 'origin' as const,
        },
        {
          label: t('charts.timeTrend.billableHours'),
          data: data.map((point) => point.billable_hours),
          borderColor: chartColorSet.status.success,
          backgroundColor: chartColorSet.status.success,
          pointBackgroundColor: chartColorSet.status.success,
          pointStyle: 'rectRot' as const,
          fill: false,
        },
        {
          label: t('charts.timeTrend.nonBillableHours'),
          data: data.map((point) => point.non_billable_hours),
          borderColor: nonBillableColor,
          backgroundColor: nonBillableColor,
          pointBackgroundColor: nonBillableColor,
          pointStyle: 'triangle' as const,
          borderDash: [4, 4],
          fill: false,
        },
      ],
    };

    // Chart options
    const base = getLineChartOptions(t('charts.timeTrend.hoursAxis'), theme);
    const options: ChartOptions<'line'> = {
      ...base,
      maintainAspectRatio: false,
      plugins: {
        ...base.plugins,
        title: {
          display: false,
        },
        legend: {
          ...base.plugins?.legend,
          labels: {
            ...base.plugins?.legend?.labels,
            // Legend markers take each series' point shape, so the lines are told apart without colour
            pointStyle: undefined,
            // Solid markers in the legend (the area fill of "total" is too pale for a swatch)
            generateLabels: (chart) =>
              ChartJS.defaults.plugins.legend.labels
                .generateLabels(chart)
                .map((item) => ({ ...item, fillStyle: item.strokeStyle })),
          },
        },
        tooltip: {
          ...base.plugins?.tooltip,
          callbacks: {
            label: (context) =>
              t('charts.timeTrend.tooltip', {
                label: context.dataset.label || '',
                value: formatDecimal(context.parsed.y ?? 0, locale),
              }),
          },
        },
      },
      scales: {
        ...base.scales,
        x: {
          ...base.scales?.x,
          ticks: {
            ...base.scales?.x?.ticks,
            autoSkip: true,
            maxTicksLimit: 8,
            maxRotation: 0,
          },
        },
      },
    };

    // Create new chart
    chartRef.current = new ChartJS(canvasRef.current, {
      type: 'line',
      data: chartData,
      options,
    });

    // Cleanup on unmount
    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [data, theme, chartColorSet, t, locale]);

  return (
    <ChartPanel
      title={t('charts.timeTrend.title')}
      subtitle={t('charts.timeTrend.subtitle')}
      action={
        <Tabs
          variant="pills"
          tabs={dayRangeOptions.map((days) => ({
            id: `${TAB_PREFIX}${days}`,
            label: `${days} ${t('charts.timeTrend.days')}`,
          }))}
          activeTab={`${TAB_PREFIX}${selectedDays}`}
          onChange={(id) => setSelectedDays(Number(id.slice(TAB_PREFIX.length)) as DayRange)}
        />
      }
      height={CHART_HEIGHT}
      status={status}
      errorTitle={t('errors:unknown.title')}
      errorMessage={error?.message}
      emptyIcon={LineChart}
      emptyTitle={t('charts.timeTrend.noData')}
      emptyHint={t('charts.timeTrend.startTracking')}
    >
      <div className="relative h-full">
        <canvas ref={canvasRef} />
      </div>
    </ChartPanel>
  );
};

export default TimeTrendChart;
