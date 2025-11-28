/**
 * @fileoverview Billable Ratio Chart component.
 * 
 * Displays a doughnut chart showing billable vs non-billable hours ratio.
 * Shows percentages and actual hours in the center.
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
import { useBillableRatio } from '../../../hooks/api/useAnalytics';
import { chartColors, getDoughnutChartOptions, formatNumber } from '../../../utils/chartConfig';

// Register Chart.js components
ChartJS.register(
  ArcElement,
  DoughnutController,
  Tooltip,
  Legend
);

/**
 * BillableRatioChart Component
 * 
 * @returns Doughnut chart showing billable ratio
 */
const BillableRatioChart: React.FC = () => {
  const { t } = useTranslation('dashboard');
  const { data, isLoading, error } = useBillableRatio();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<ChartJS | null>(null);

  // Calculate total hours for center display
  const totalHours = data ? data.billable_hours + data.non_billable_hours : 0;
  const billablePercentage = data?.billable_percentage || 0;

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
          backgroundColor: [
            chartColors.success + 'DD', // Green with transparency
            chartColors.danger + 'DD',   // Red with transparency
          ],
          borderColor: [
            chartColors.success,
            chartColors.danger,
          ],
          borderWidth: 2,
        },
      ],
    };

    // Chart options
    const options: ChartOptions<'doughnut'> = {
      ...getDoughnutChartOptions(),
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
      }
    };
  }, [data, totalHours]);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg p-6 shadow-lg">
      {/* Header */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('charts.billableRatio.title')}</h3>
        <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">{t('charts.billableRatio.subtitle')}</p>
      </div>

      {/* Chart content */}
      <div className="relative" style={{ height: '300px' }}>
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white dark:bg-gray-900 bg-opacity-75 dark:bg-opacity-75 rounded">
            <div className="flex flex-col items-center gap-3">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-500"></div>
              <p className="text-gray-600 dark:text-gray-400 text-sm">{t('charts.billableRatio.loading')}</p>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-white dark:bg-gray-900 rounded">
            <div className="text-center">
              <p className="text-red-400 font-medium mb-2">{t('charts.billableRatio.error')}</p>
              <p className="text-gray-600 dark:text-gray-400 text-sm">{error.message}</p>
            </div>
          </div>
        )}

        {!isLoading && !error && totalHours === 0 && (
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
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <p className="text-gray-700 dark:text-gray-400 font-medium">{t('charts.billableRatio.noData')}</p>
              <p className="text-gray-500 dark:text-gray-500 text-sm mt-1">{t('charts.billableRatio.noDataDescription')}</p>
            </div>
          </div>
        )}

        {!isLoading && !error && totalHours > 0 && (
          <div className="relative h-full flex flex-col items-center justify-center">
            <canvas ref={canvasRef} style={{ maxHeight: '300px' }}></canvas>
            
            {/* Center text overlay */}
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
              <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                {formatNumber(billablePercentage, 1)}%
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                {t('charts.billableRatio.totalHours', { hours: formatNumber(totalHours, 1) })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Legend summary */}
      {!isLoading && !error && totalHours > 0 && (
        <div className="mt-6 grid grid-cols-2 gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <span className="text-gray-600 dark:text-gray-400 text-sm">{t('charts.billableRatio.billable')}</span>
            </div>
            <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {t('charts.billableRatio.hours', { hours: formatNumber(data?.billable_hours || 0, 1) })}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <span className="text-gray-600 dark:text-gray-400 text-sm">{t('charts.billableRatio.nonBillable')}</span>
            </div>
            <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {t('charts.billableRatio.hours', { hours: formatNumber(data?.non_billable_hours || 0, 1) })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BillableRatioChart;
