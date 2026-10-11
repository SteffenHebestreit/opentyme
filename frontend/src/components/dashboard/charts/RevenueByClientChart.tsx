/**
 * @fileoverview Revenue By Client Chart component.
 *
 * Displays a horizontal bar chart showing top clients by revenue.
 * Shows client names, revenue amounts, and invoice counts. Follows the
 * light/dark theme.
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
import { Wallet } from 'lucide-react';
import { useRevenueByClient } from '../../../hooks/api/useAnalytics';
import { useChartTheme } from '../../../hooks/ui/useChartTheme';
import { chartColors, getBarChartOptions, withAlpha } from '../../../utils/chartConfig';
import { formatCurrency } from '../../../utils/currency';
import { ChartPanel, ChartStatus } from './ChartPanel';
import { formatCompactCurrency } from './chartFormat';

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

const CHART_HEIGHT = 300;
const MAX_LABEL_LENGTH = 18;

/**
 * RevenueByClientChart Component
 *
 * @returns Horizontal bar chart showing revenue by client
 */
const RevenueByClientChart: React.FC = () => {
  const { t, i18n } = useTranslation('dashboard');
  const theme = useChartTheme();
  const locale = i18n.language;
  const currentYear = new Date().getFullYear();
  const { data, isLoading, error } = useRevenueByClient(10, currentYear);
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

    // Prepare chart data — one series, one brand colour
    const chartData = {
      labels: data.map((client) => client.client_name),
      datasets: [
        {
          label: t('charts.revenueByClient.revenue'),
          data: data.map((client) => client.total_revenue),
          backgroundColor: withAlpha(chartColors.primary, theme === 'dark' ? 0.8 : 0.85),
          hoverBackgroundColor: chartColors.primaryDark,
          borderRadius: 6,
          maxBarThickness: 22,
        },
      ],
    };

    // Chart options
    const base = getBarChartOptions(t('charts.revenueByClient.axis'), true, theme);
    const options: ChartOptions<'bar'> = {
      ...base,
      maintainAspectRatio: false,
      interaction: { mode: 'nearest', axis: 'y', intersect: false },
      plugins: {
        ...base.plugins,
        legend: {
          display: false, // Hide legend for single dataset
        },
        tooltip: {
          ...base.plugins?.tooltip,
          mode: 'index',
          axis: 'y',
          intersect: false,
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
      scales: {
        ...base.scales,
        x: {
          ...base.scales?.x,
          ticks: {
            ...base.scales?.x?.ticks,
            maxTicksLimit: 6,
            callback: (value) => formatCompactCurrency(Number(value), locale),
          },
        },
        y: {
          ...base.scales?.y,
          ticks: {
            ...base.scales?.y?.ticks,
            callback: function (value) {
              const label = String(this.getLabelForValue(Number(value)));
              return label.length > MAX_LABEL_LENGTH ? `${label.slice(0, MAX_LABEL_LENGTH - 1)}…` : label;
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
        chartRef.current = null;
      }
    };
  }, [data, theme, t, locale]);

  return (
    <ChartPanel
      title={t('charts.revenueByClient.title')}
      subtitle={t('charts.revenueByClient.subtitle')}
      height={CHART_HEIGHT}
      status={status}
      errorTitle={t('errors:unknown.title')}
      errorMessage={error?.message}
      emptyIcon={Wallet}
      emptyTitle={t('charts.revenueByClient.noData')}
      emptyHint={t('charts.revenueByClient.createInvoices')}
    >
      <div className="relative h-full">
        <canvas ref={canvasRef} />
      </div>
    </ChartPanel>
  );
};

export default RevenueByClientChart;
