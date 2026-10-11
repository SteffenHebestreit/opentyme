/**
 * @fileoverview Billable Ratio Chart component.
 *
 * Displays a doughnut chart showing billable vs non-billable hours ratio.
 * Shows percentages and actual hours in the center. Follows the light/dark theme.
 *
 * @module components/dashboard/charts/BillableRatioChart
 */

import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Chart as ChartJS,
  ArcElement,
  DoughnutController,
  Tooltip,
  Legend,
  ChartOptions,
} from 'chart.js';
import { Clock } from 'lucide-react';
import { useBillableRatio } from '../../../hooks/api/useAnalytics';
import { useChartTheme } from '../../../hooks/ui/useChartTheme';
import { chartColors, getDoughnutChartOptions } from '../../../utils/chartConfig';
import { ChartPanel, ChartStatus } from './ChartPanel';
import { formatDecimal } from './chartFormat';

// Register Chart.js components
ChartJS.register(
  ArcElement,
  DoughnutController,
  Tooltip,
  Legend
);

const CHART_HEIGHT = 260;

/**
 * BillableRatioChart Component
 *
 * @returns Doughnut chart showing billable ratio
 */
const BillableRatioChart: React.FC = () => {
  const { t, i18n } = useTranslation('dashboard');
  const theme = useChartTheme();
  const locale = i18n.language;
  const { data, isLoading, error } = useBillableRatio();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<ChartJS | null>(null);

  // Calculate total hours for center display
  const totalHours = data ? data.billable_hours + data.non_billable_hours : 0;
  const billablePercentage = data?.billable_percentage || 0;
  const nonBillableColor = theme === 'dark' ? chartColors.gray[600] : chartColors.gray[300];

  const status: ChartStatus = isLoading ? 'loading' : error ? 'error' : totalHours > 0 ? 'ready' : 'empty';

  useEffect(() => {
    if (!canvasRef.current || !data || totalHours === 0) return;

    // Destroy existing chart
    if (chartRef.current) {
      chartRef.current.destroy();
    }

    // Prepare chart data
    const chartData = {
      labels: [t('charts.billableRatio.billableHours'), t('charts.billableRatio.nonBillableHours')],
      datasets: [
        {
          data: [data.billable_hours, data.non_billable_hours],
          backgroundColor: [chartColors.success, nonBillableColor],
          hoverOffset: 4,
          spacing: 2,
        },
      ],
    };

    // Chart options
    const base = getDoughnutChartOptions(theme);
    const options: ChartOptions<'doughnut'> = {
      ...base,
      maintainAspectRatio: false,
      plugins: {
        ...base.plugins,
        legend: {
          display: false, // The summary below the chart is the legend
        },
        tooltip: {
          ...base.plugins?.tooltip,
          callbacks: {
            label: (context) => {
              const value = Number(context.parsed) || 0;
              const percent = totalHours ? (value / totalHours) * 100 : 0;
              return t('charts.billableRatio.tooltip', {
                label: context.label || '',
                value: formatDecimal(value, locale, 2),
                percent: formatDecimal(percent, locale, 1),
              });
            },
          },
        },
      },
    };

    // Create new chart
    chartRef.current = new ChartJS(canvasRef.current, {
      type: 'doughnut',
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
  }, [data, totalHours, theme, t, locale, nonBillableColor]);

  const legend = [
    {
      key: 'billable',
      label: t('charts.billableRatio.billable'),
      hours: data?.billable_hours || 0,
      color: chartColors.success,
    },
    {
      key: 'nonBillable',
      label: t('charts.billableRatio.nonBillable'),
      hours: data?.non_billable_hours || 0,
      color: nonBillableColor,
    },
  ];

  return (
    <ChartPanel
      title={t('charts.billableRatio.title')}
      subtitle={t('charts.billableRatio.subtitle')}
      height={CHART_HEIGHT}
      status={status}
      errorTitle={t('charts.billableRatio.error')}
      errorMessage={error?.message}
      emptyIcon={Clock}
      emptyTitle={t('charts.billableRatio.noData')}
      emptyHint={t('charts.billableRatio.noDataDescription')}
      footer={
        <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-gray-100 pt-4 dark:border-gray-800">
          {legend.map((item) => (
            <div key={item.key}>
              <dt className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} aria-hidden="true" />
                {item.label}
              </dt>
              <dd className="mt-1 text-base font-semibold tabular-nums text-gray-900 dark:text-white">
                {t('charts.billableRatio.hours', { hours: formatDecimal(item.hours, locale) })}
              </dd>
            </div>
          ))}
        </dl>
      }
    >
      <div className="relative h-full">
        <canvas ref={canvasRef} />

        {/* Center text overlay */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <div className="text-3xl font-semibold tracking-tight tabular-nums text-gray-900 dark:text-white">
            {formatDecimal(billablePercentage, locale)}%
          </div>
          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {t('charts.billableRatio.totalHours', { hours: formatDecimal(totalHours, locale) })}
          </div>
        </div>
      </div>
    </ChartPanel>
  );
};

export default BillableRatioChart;
