/**
 * @fileoverview Project Profitability Chart component.
 *
 * Displays a bar chart showing project profitability:
 * - Green bars for profitable projects
 * - Red bars for loss-making projects
 * - Shows revenue, cost, and profit margin
 *
 * Follows the light/dark theme.
 *
 * @module components/dashboard/charts/ProjectProfitabilityChart
 */

import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  BarController,
  Title,
  Tooltip,
  Legend,
  ChartOptions,
} from 'chart.js';
import { BarChart3 } from 'lucide-react';
import { useProjectProfitability } from '../../../hooks/api/useAnalytics';
import { useChartTheme } from '../../../hooks/ui/useChartTheme';
import { chartColors, getBarChartOptions, withAlpha } from '../../../utils/chartConfig';
import { formatCurrency } from '../../../utils/currency';
import { ChartPanel, ChartStatus } from './ChartPanel';
import { formatCompactCurrency, formatDecimal } from './chartFormat';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  BarController,
  Title,
  Tooltip,
  Legend
);

const CHART_HEIGHT = 320;

/**
 * ProjectProfitabilityChart Component
 *
 * @returns Bar chart showing project profitability
 */
const ProjectProfitabilityChart: React.FC = () => {
  const { t, i18n } = useTranslation('dashboard');
  const theme = useChartTheme();
  const locale = i18n.language;
  const { data, isLoading, error } = useProjectProfitability(10);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<ChartJS | null>(null);

  const status: ChartStatus = isLoading
    ? 'loading'
    : error
      ? 'error'
      : data && data.length > 0
        ? 'ready'
        : 'empty';

  useEffect(() => {
    if (!canvasRef.current || !data || data.length === 0) return;

    // Destroy existing chart
    if (chartRef.current) {
      chartRef.current.destroy();
    }

    const alpha = theme === 'dark' ? 0.8 : 0.85;

    // Prepare chart data with conditional colors
    const chartData = {
      labels: data.map((project) => project.project_name),
      datasets: [
        {
          label: t('charts.projectProfitability.profitLoss'),
          data: data.map((project) => project.profit),
          backgroundColor: data.map((project) =>
            withAlpha(project.profit >= 0 ? chartColors.success : chartColors.danger, alpha)
          ),
          hoverBackgroundColor: data.map((project) =>
            project.profit >= 0 ? chartColors.success : chartColors.danger
          ),
          borderRadius: 6,
          maxBarThickness: 40,
        },
      ],
    };

    // Chart options
    const base = getBarChartOptions(t('charts.projectProfitability.profitLoss'), false, theme);
    const options: ChartOptions<'bar'> = {
      ...base,
      maintainAspectRatio: false,
      plugins: {
        ...base.plugins,
        legend: {
          display: false, // Hide legend for single dataset with conditional colors
        },
        tooltip: {
          ...base.plugins?.tooltip,
          callbacks: {
            label: (context) => {
              const project = data[context.dataIndex];
              if (!project) return '';

              return [
                `${t('charts.projectProfitability.revenue')}: ${formatCurrency(project.revenue)}`,
                `${t('charts.projectProfitability.cost')}: ${formatCurrency(project.cost)}`,
                `${t('charts.projectProfitability.profit')}: ${formatCurrency(project.profit)}`,
                `${t('charts.projectProfitability.margin')}: ${formatDecimal(project.profit_margin, locale)}%`,
              ];
            },
          },
        },
      },
      scales: {
        ...base.scales,
        y: {
          ...base.scales?.y,
          ticks: {
            ...base.scales?.y?.ticks,
            maxTicksLimit: 6,
            callback: (value) => formatCompactCurrency(Number(value), locale),
          },
        },
      },
    };

    // Create new chart
    chartRef.current = new ChartJS(canvasRef.current, {
      type: 'bar',
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
  }, [data, theme, t, locale]);

  return (
    <ChartPanel
      title={t('charts.projectProfitability.title')}
      subtitle={t('charts.projectProfitability.subtitle')}
      height={CHART_HEIGHT}
      status={status}
      errorTitle={t('charts.projectProfitability.error')}
      errorMessage={error?.message}
      emptyIcon={BarChart3}
      emptyTitle={t('charts.projectProfitability.noData')}
      emptyHint={t('charts.projectProfitability.noDataDescription')}
      footer={
        <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-gray-100 pt-4 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
          <span className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" aria-hidden="true" />
            {t('charts.projectProfitability.profitable')}
          </span>
          <span className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500" aria-hidden="true" />
            {t('charts.projectProfitability.lossMaking')}
          </span>
        </div>
      }
    >
      <div className="relative h-full">
        <canvas ref={canvasRef} />
      </div>
    </ChartPanel>
  );
};

export default ProjectProfitabilityChart;
