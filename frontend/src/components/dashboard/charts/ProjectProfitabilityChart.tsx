/**
 * @fileoverview Project Profitability Chart component.
 * 
 * Displays a bar chart showing project profitability:
 * - Green bars for profitable projects
 * - Red bars for loss-making projects
 * - Shows revenue, cost, and profit margin
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
import { useProjectProfitability } from '../../../hooks/api/useAnalytics';
import { chartColors, getBarChartOptions, formatCurrency, formatNumber } from '../../../utils/chartConfig';

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

/**
 * ProjectProfitabilityChart Component
 * 
 * @returns Bar chart showing project profitability
 */
const ProjectProfitabilityChart: React.FC = () => {
  const { t } = useTranslation('dashboard');
  const { data, isLoading, error } = useProjectProfitability(10);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<ChartJS | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !data || data.length === 0) return;

    // Destroy existing chart
    if (chartRef.current) {
      chartRef.current.destroy();
    }

    // Prepare chart data with conditional colors
    const chartData = {
      labels: data.map((project) => project.project_name),
      datasets: [
        {
          label: t('charts.projectProfitability.profitLoss'),
          data: data.map((project) => project.profit),
          backgroundColor: data.map((project) =>
            project.profit >= 0 ? chartColors.success + 'DD' : chartColors.danger + 'DD'
          ),
          borderColor: data.map((project) =>
            project.profit >= 0 ? chartColors.success : chartColors.danger
          ),
          borderWidth: 1,
        },
      ],
    };

    // Chart options
    const options: ChartOptions<'bar'> = {
      ...getBarChartOptions(t('charts.projectProfitability.profitLoss'), false),
      plugins: {
        ...getBarChartOptions(t('charts.projectProfitability.profitLoss'), false).plugins,
        legend: {
          display: false, // Hide legend for single dataset with conditional colors
        },
        tooltip: {
          ...getBarChartOptions(t('charts.projectProfitability.profitLoss'), false).plugins?.tooltip,
          callbacks: {
            label: (context) => {
              const dataIndex = context.dataIndex;
              const project = data[dataIndex];
              if (!project) return '';
              
              return [
                `${t('charts.projectProfitability.revenue')}: ${formatCurrency(project.revenue)}`,
                `${t('charts.projectProfitability.cost')}: ${formatCurrency(project.cost)}`,
                `${t('charts.projectProfitability.profit')}: ${formatCurrency(project.profit)}`,
                `${t('charts.projectProfitability.margin')}: ${formatNumber(project.profit_margin, 1)}%`,
              ];
            },
          },
        },
      },
      scales: {
        ...getBarChartOptions(t('charts.projectProfitability.profitLoss'), false).scales,
        y: {
          ...getBarChartOptions(t('charts.projectProfitability.profitLoss'), false).scales?.y,
          ticks: {
            ...getBarChartOptions(t('charts.projectProfitability.profitLoss'), false).scales?.y?.ticks,
            callback: function(value) {
              return formatCurrency(value as number);
            },
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
      };
    };
  }, [data, t]);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg p-6 shadow-lg">
      {/* Header */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('charts.projectProfitability.title')}</h3>
        <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">{t('charts.projectProfitability.subtitle')}</p>
      </div>

      {/* Chart content */}
      <div className="relative" style={{ height: '350px' }}>
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white dark:bg-gray-900 bg-opacity-75 dark:bg-opacity-75 rounded">
            <div className="flex flex-col items-center gap-3">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-500"></div>
              <p className="text-gray-600 dark:text-gray-400 text-sm">{t('charts.projectProfitability.loading')}</p>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-white dark:bg-gray-900 rounded">
            <div className="text-center">
              <p className="text-red-400 font-medium mb-2">{t('charts.projectProfitability.error')}</p>
              <p className="text-gray-600 dark:text-gray-400 text-sm">{error.message}</p>
            </div>
          </div>
        )}

        {!isLoading && !error && data && data.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-white dark:bg-gray-900 rounded">
            <div className="text-center">
              <svg
                className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-600 mb-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
              <p className="text-gray-700 dark:text-gray-400 font-medium">{t('charts.projectProfitability.noData')}</p>
              <p className="text-gray-500 dark:text-gray-500 text-sm mt-1">{t('charts.projectProfitability.noDataDescription')}</p>
            </div>
          </div>
        )}

        <canvas ref={canvasRef} style={{ maxHeight: '350px' }}></canvas>
      </div>

      {/* Summary legend */}
      {!isLoading && !error && data && data.length > 0 && (
        <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-green-500"></div>
              <span className="text-gray-600 dark:text-gray-400">{t('charts.projectProfitability.profitable')}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-red-500"></div>
              <span className="text-gray-600 dark:text-gray-400">{t('charts.projectProfitability.lossMaking')}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectProfitabilityChart;
