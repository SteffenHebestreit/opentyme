/**
 * @fileoverview Depreciation Schedule Chart component
 *
 * Displays a bar chart showing future depreciation amounts by year
 * with asset count breakdown. Follows the light/dark theme.
 *
 * @module components/dashboard/charts/DepreciationScheduleChart
 */

import React, { useState, useEffect, useRef } from 'react';
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
import { useQuery } from '@tanstack/react-query';
import { CalendarRange } from 'lucide-react';
import { getDepreciationSchedule } from '../../../api/services/depreciation.service';
import { useChartTheme } from '../../../hooks/ui/useChartTheme';
import { chartColors, getBarChartOptions, withAlpha } from '../../../utils/chartConfig';
import { formatCurrency } from '../../../utils/currency';
import { Tabs } from '../../common/Tabs';
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

const yearOptions = [3, 5, 10];
const TAB_PREFIX = 'depreciation-years-';
const CHART_HEIGHT = 260;

/**
 * DepreciationScheduleChart Component
 *
 * @returns Bar chart showing depreciation schedule
 */
const DepreciationScheduleChart: React.FC = () => {
  const { t, i18n } = useTranslation('dashboard');
  const theme = useChartTheme();
  const locale = i18n.language;
  const [years, setYears] = useState(5);
  const { data, isLoading, error } = useQuery({
    queryKey: ['depreciation-schedule', years],
    queryFn: () => getDepreciationSchedule(years),
  });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<ChartJS | null>(null);

  const hasDepreciation = !!data && data.schedule.some((item) => Number(item.total_depreciation) !== 0);
  const status: ChartStatus = isLoading ? 'loading' : error ? 'error' : hasDepreciation ? 'ready' : 'empty';

  useEffect(() => {
    if (!canvasRef.current || !data || data.schedule.length === 0) return;

    // Destroy existing chart
    if (chartRef.current) {
      chartRef.current.destroy();
    }

    // Prepare chart data
    const chartData = {
      labels: data.schedule.map((item) => item.year.toString()),
      datasets: [
        {
          label: t('depreciation.schedule.annual'),
          data: data.schedule.map((item) => item.total_depreciation),
          backgroundColor: withAlpha(chartColors.primary, theme === 'dark' ? 0.8 : 0.85),
          hoverBackgroundColor: chartColors.primaryDark,
          borderRadius: 6,
          maxBarThickness: 48,
        },
      ],
    };

    // Chart options
    const base = getBarChartOptions(t('depreciation.schedule.axis'), false, theme);
    const options: ChartOptions<'bar'> = {
      ...base,
      maintainAspectRatio: false,
      plugins: {
        ...base.plugins,
        legend: {
          display: false, // Single series — the card title names it
        },
        tooltip: {
          ...base.plugins?.tooltip,
          callbacks: {
            label: (context) => {
              const value = context.parsed.y;
              const yearData = data.schedule[context.dataIndex];
              return [
                t('depreciation.schedule.tooltipAmount', { amount: formatCurrency(value ?? 0) }),
                t('depreciation.schedule.tooltipAssets', { count: yearData?.assets.length ?? 0 }),
              ];
            },
          },
        },
      },
      scales: {
        ...base.scales,
        y: {
          ...base.scales?.y,
          beginAtZero: true,
          ticks: {
            ...base.scales?.y?.ticks,
            maxTicksLimit: 6,
            callback: (value) => formatCompactCurrency(Number(value), locale),
          },
        },
      },
    };

    // Create chart
    chartRef.current = new ChartJS(canvasRef.current, {
      type: 'bar',
      data: chartData,
      options,
    });

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [data, theme, t, locale]);

  return (
    <ChartPanel
      title={t('depreciation.schedule.title')}
      subtitle={t('depreciation.schedule.subtitle')}
      action={
        <Tabs
          variant="pills"
          tabs={yearOptions.map((y) => ({
            id: `${TAB_PREFIX}${y}`,
            label: t('depreciation.schedule.years', { count: y }),
          }))}
          activeTab={`${TAB_PREFIX}${years}`}
          onChange={(id) => setYears(Number(id.slice(TAB_PREFIX.length)))}
        />
      }
      height={CHART_HEIGHT}
      status={status}
      errorTitle={t('depreciation.schedule.error')}
      errorMessage={error instanceof Error ? error.message : undefined}
      emptyIcon={CalendarRange}
      emptyTitle={t('depreciation.schedule.empty')}
      emptyHint={t('depreciation.schedule.emptyHint')}
    >
      <div className="relative h-full">
        <canvas ref={canvasRef} />
      </div>
    </ChartPanel>
  );
};

export default DepreciationScheduleChart;
