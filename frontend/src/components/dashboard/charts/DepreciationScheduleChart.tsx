/**
 * @fileoverview Depreciation Schedule Chart component
 * 
 * Displays a bar chart showing future depreciation amounts by year
 * with asset count breakdown
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
import { getDepreciationSchedule } from '../../../api/services/depreciation.service';
import { chartColors, getBarChartOptions, formatCurrency } from '../../../utils/chartConfig';

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
 * DepreciationScheduleChart Component
 * 
 * @returns Bar chart showing depreciation schedule
 */
const DepreciationScheduleChart: React.FC = () => {
  const { t } = useTranslation('dashboard');
  const [years, setYears] = useState(5);
  const { data, isLoading, error } = useQuery({
    queryKey: ['depreciation-schedule', years],
    queryFn: () => getDepreciationSchedule(years),
  });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<ChartJS | null>(null);

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
          label: 'Jährliche Abschreibung',
          data: data.schedule.map((item) => item.total_depreciation),
          backgroundColor: chartColors.primary + '80',
          borderColor: chartColors.primary,
          borderWidth: 2,
          borderRadius: 6,
        },
      ],
    };

    // Chart options
    const options: ChartOptions<'bar'> = {
      ...getBarChartOptions('Betrag (€)', false),
      plugins: {
        ...getBarChartOptions('Betrag (€)', false).plugins,
        tooltip: {
          ...getBarChartOptions('Betrag (€)', false).plugins?.tooltip,
          callbacks: {
            label: (context) => {
              const value = context.parsed.y;
              const yearData = data.schedule[context.dataIndex];
              return [
                `Abschreibung: ${formatCurrency(value)}`,
                `Vermögenswerte: ${yearData.assets.length}`,
              ];
            },
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: (value) => formatCurrency(Number(value)),
          },
        },
      },
    };

    // Create chart
    const ctx = canvasRef.current.getContext('2d');
    if (ctx) {
      chartRef.current = new ChartJS(ctx, {
        type: 'bar',
        data: chartData,
        options: options as any,
      });
    }

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
      }
    };
  }, [data]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Abschreibungsplan
          </h3>
        </div>
        
        <div className="flex gap-2">
          {[3, 5, 10].map((y) => (
            <button
              key={y}
              onClick={() => setYears(y)}
              className={`rounded-lg px-3 py-1 text-sm font-medium transition-colors ${
                years === y
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
              }`}
            >
              {y} Jahre
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
        </div>
      ) : error ? (
        <div className="flex h-64 items-center justify-center">
          <p className="text-sm text-red-600 dark:text-red-400">
            Fehler beim Laden des Abschreibungsplans
          </p>
        </div>
      ) : !data || data.schedule.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center gap-2">
          <svg className="h-12 w-12 text-gray-400 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Keine Abschreibungen vorhanden
          </p>
        </div>
      ) : (
        <div className="relative h-64">
          <canvas ref={canvasRef}></canvas>
        </div>
      )}
    </div>
  );
};

export default DepreciationScheduleChart;
