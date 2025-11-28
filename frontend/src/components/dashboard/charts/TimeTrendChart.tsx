/**
 * @fileoverview Time Trend Chart component.
 * 
 * Displays a line chart showing time tracking trends over days:
 * - Total hours (purple line)
 * - Billable hours (green line)
 * - Non-billable hours (red line)
 * 
 * Includes date range selector (30/60/90 days).
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
  Title,
  Tooltip,
  Legend,
  ChartOptions,
} from 'chart.js';
import { useTimeTrend } from '../../../hooks/api/useAnalytics';
import { chartColors, getLineChartOptions, formatNumber } from '../../../utils/chartConfig';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  LineController,
  Title,
  Tooltip,
  Legend
);

/**
 * Day range options
 */
type DayRange = 30 | 60 | 90;

const dayRangeOptions: DayRange[] = [30, 60, 90];

/**
 * TimeTrendChart Component
 * 
 * @returns Line chart showing time tracking trends
 */
const TimeTrendChart: React.FC = () => {
  const { t } = useTranslation('dashboard');
  const [selectedDays, setSelectedDays] = useState<DayRange>(90);
  const { data, isLoading, error } = useTimeTrend(selectedDays);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<ChartJS | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !data || data.length === 0) return;

    // Destroy existing chart
    if (chartRef.current) {
      chartRef.current.destroy();
    }

    // Prepare chart data
    const chartData = {
      labels: data.map((point) => {
        const date = new Date(point.date);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }),
      datasets: [
        {
          label: t('charts.timeTrend.totalHours'),
          data: data.map((point) => point.total_hours),
          borderColor: chartColors.primary,
          backgroundColor: chartColors.primary + '20',
          fill: false,
        },
        {
          label: t('charts.timeTrend.billableHours'),
          data: data.map((point) => point.billable_hours),
          borderColor: chartColors.success,
          backgroundColor: chartColors.success + '20',
          fill: false,
        },
        {
          label: t('charts.timeTrend.nonBillableHours'),
          data: data.map((point) => point.non_billable_hours),
          borderColor: chartColors.danger,
          backgroundColor: chartColors.danger + '20',
          fill: false,
        },
      ],
    };

    // Chart options
    const options: ChartOptions<'line'> = {
      ...getLineChartOptions('Hours'),
      plugins: {
        ...getLineChartOptions('Hours').plugins,
        title: {
          display: false,
        },
        tooltip: {
          ...getLineChartOptions('Hours').plugins?.tooltip,
          callbacks: {
            label: (context) => {
              const label = context.dataset.label || '';
              const value = context.parsed.y ?? 0;
              return `${label}: ${formatNumber(value, 1)} hours`;
            },
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
      }
    };
  }, [data]);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg p-6 shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('charts.timeTrend.title')}</h3>
        
        {/* Day range selector */}
        <div className="flex gap-2">
          {dayRangeOptions.map((days) => (
            <button
              key={days}
              onClick={() => setSelectedDays(days)}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                selectedDays === days
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              {days} {t('charts.timeTrend.days')}
            </button>
          ))}
        </div>
      </div>

      {/* Chart content */}
      <div className="relative" style={{ height: '300px' }}>
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white dark:bg-gray-900 bg-opacity-75 dark:bg-opacity-75 rounded z-10">
            <div className="flex flex-col items-center gap-3">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-500"></div>
              <p className="text-gray-600 dark:text-gray-400 text-sm">{t('common:buttons.loading')}</p>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-white dark:bg-gray-900 rounded z-10">
            <div className="text-center">
              <p className="text-red-400 font-medium mb-2">{t('errors:unknown.title')}</p>
              <p className="text-gray-600 dark:text-gray-400 text-sm">{error.message}</p>
            </div>
          </div>
        )}

        {!isLoading && !error && data && data.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-white dark:bg-gray-900 rounded z-10">
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
              <p className="text-gray-700 dark:text-gray-400 font-medium">{t('charts.timeTrend.noData')}</p>
              <p className="text-gray-500 dark:text-gray-500 text-sm mt-1">{t('charts.timeTrend.startTracking')}</p>
            </div>
          </div>
        )}

        <canvas ref={canvasRef} style={{ maxHeight: '300px' }}></canvas>
      </div>
    </div>
  );
};

export default TimeTrendChart;
