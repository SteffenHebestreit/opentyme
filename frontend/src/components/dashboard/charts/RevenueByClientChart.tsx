/**
 * @fileoverview Revenue By Client Chart component.
 * 
 * Displays a horizontal bar chart showing top clients by revenue.
 * Shows client names, revenue amounts, and invoice counts.
 * 
 * @module components/dashboard/charts/RevenueByClientChart
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
import { useRevenueByClient } from '../../../hooks/api/useAnalytics';
import { chartPalette, getBarChartOptions, formatCurrency } from '../../../utils/chartConfig';

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
 * RevenueByClientChart Component
 * 
 * @returns Horizontal bar chart showing revenue by client
 */
const RevenueByClientChart: React.FC = () => {
  const { t } = useTranslation('dashboard');
  const { data, isLoading, error } = useRevenueByClient(10);
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
      labels: data.map((client) => client.client_name),
      datasets: [
        {
          label: t('charts.revenueByClient.revenue'),
          data: data.map((client) => client.total_revenue),
          backgroundColor: chartPalette.map((color) => color + 'CC'), // Add transparency
          borderColor: chartPalette,
          borderWidth: 1,
        },
      ],
    };

    // Chart options
    const options: ChartOptions<'bar'> = {
      ...getBarChartOptions('Revenue (€)', true),
      plugins: {
        ...getBarChartOptions('Revenue (€)', true).plugins,
        legend: {
          display: false, // Hide legend for single dataset
        },
        tooltip: {
          ...getBarChartOptions('Revenue (€)', true).plugins?.tooltip,
          callbacks: {
            label: (context) => {
              const value = context.parsed.x ?? 0;
              const dataIndex = context.dataIndex;
              const invoiceCount = data[dataIndex]?.invoice_count || 0;
              return [
                `${t('charts.revenueByClient.revenue')}: ${formatCurrency(value)}`,
                `${t('charts.revenueByClient.invoices')}: ${invoiceCount}`,
              ];
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
      }
    };
  }, [data]);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg p-6 shadow-lg">
      {/* Header */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('charts.revenueByClient.title')}</h3>
        <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">{t('charts.revenueByClient.subtitle')}</p>
      </div>

      {/* Chart content */}
      <div className="relative" style={{ height: '350px' }}>
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white dark:bg-gray-900 bg-opacity-75 dark:bg-opacity-75 rounded">
            <div className="flex flex-col items-center gap-3">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-500"></div>
              <p className="text-gray-600 dark:text-gray-400 text-sm">{t('common:buttons.loading')}</p>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-white dark:bg-gray-900 rounded">
            <div className="text-center">
              <p className="text-red-400 font-medium mb-2">{t('errors:unknown.title')}</p>
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
                  d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
              <p className="text-gray-700 dark:text-gray-400 font-medium">{t('charts.revenueByClient.noData')}</p>
              <p className="text-gray-500 dark:text-gray-500 text-sm mt-1">{t('charts.revenueByClient.createInvoices')}</p>
            </div>
          </div>
        )}

        <canvas ref={canvasRef} style={{ maxHeight: '350px' }}></canvas>
      </div>
    </div>
  );
};

export default RevenueByClientChart;
