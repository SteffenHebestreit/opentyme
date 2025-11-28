/**
 * @fileoverview Chart.js configuration for dashboard charts.
 * 
 * Provides default options and theme configuration for Chart.js charts:
 * - Dark mode styling
 * - Purple accent colors
 * - Responsive behavior
 * - Tooltip customization
 * - Grid and axis styling
 * 
 * @module utils/chartConfig
 */

import { ChartOptions } from 'chart.js';

/**
 * Color palette for charts (purple theme)
 */
export const chartColors = {
  primary: '#a855f7',      // purple-500
  primaryDark: '#7c3aed',  // purple-600
  secondary: '#ec4899',    // pink-500
  success: '#10b981',      // green-500
  danger: '#ef4444',       // red-500
  warning: '#f59e0b',      // amber-500
  info: '#3b82f6',         // blue-500
  gray: {
    50: '#f9fafb',
    100: '#f3f4f6',
    200: '#e5e7eb',
    300: '#d1d5db',
    400: '#9ca3af',
    500: '#6b7280',
    600: '#4b5563',
    700: '#374151',
    800: '#1f2937',
    900: '#111827',
  },
};

/**
 * Color palette for multi-dataset charts
 */
export const chartPalette = [
  '#a855f7', // purple-500
  '#ec4899', // pink-500
  '#3b82f6', // blue-500
  '#10b981', // green-500
  '#f59e0b', // amber-500
  '#ef4444', // red-500
  '#8b5cf6', // violet-500
  '#06b6d4', // cyan-500
];

/**
 * Get default chart options for dark mode
 */
export const getDefaultChartOptions = (): ChartOptions<any> => {
  return {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: {
        display: true,
        position: 'bottom',
        labels: {
          color: chartColors.gray[300],
          padding: 15,
          font: {
            size: 12,
            family: "'Inter', sans-serif",
          },
          usePointStyle: true,
          pointStyle: 'circle',
        },
      },
      tooltip: {
        enabled: true,
        mode: 'index',
        intersect: false,
        backgroundColor: chartColors.gray[800],
        titleColor: chartColors.gray[100],
        bodyColor: chartColors.gray[300],
        borderColor: chartColors.primary,
        borderWidth: 1,
        padding: 12,
        cornerRadius: 8,
        titleFont: {
          size: 14,
          weight: 'bold',
          family: "'Inter', sans-serif",
        },
        bodyFont: {
          size: 13,
          family: "'Inter', sans-serif",
        },
        displayColors: true,
        boxPadding: 6,
      },
    },
    scales: {
      x: {
        grid: {
          display: true,
          color: chartColors.gray[700],
          drawTicks: false,
        },
        ticks: {
          color: chartColors.gray[400],
          padding: 8,
          font: {
            size: 11,
            family: "'Inter', sans-serif",
          },
        },
        border: {
          display: false,
        },
      },
      y: {
        grid: {
          display: true,
          color: chartColors.gray[700],
          drawTicks: false,
        },
        ticks: {
          color: chartColors.gray[400],
          padding: 8,
          font: {
            size: 11,
            family: "'Inter', sans-serif",
          },
        },
        border: {
          display: false,
        },
      },
    },
    interaction: {
      mode: 'nearest',
      axis: 'x',
      intersect: false,
    },
  };
};

/**
 * Get line chart specific options
 */
export const getLineChartOptions = (yAxisLabel?: string): ChartOptions<'line'> => {
  const defaultOptions = getDefaultChartOptions();
  return {
    ...defaultOptions,
    scales: {
      ...defaultOptions.scales,
      y: {
        ...defaultOptions.scales?.y,
        beginAtZero: true,
        title: yAxisLabel
          ? {
              display: true,
              text: yAxisLabel,
              color: chartColors.gray[300],
              font: {
                size: 12,
                weight: 'bold',
                family: "'Inter', sans-serif",
              },
            }
          : undefined,
      },
    },
    elements: {
      line: {
        tension: 0.4, // Smooth curves
        borderWidth: 2,
      },
      point: {
        radius: 3,
        hoverRadius: 5,
        hitRadius: 10,
      },
    },
  };
};

/**
 * Get bar chart specific options
 */
export const getBarChartOptions = (
  yAxisLabel?: string,
  horizontal: boolean = false
): ChartOptions<'bar'> => {
  const defaultOptions = getDefaultChartOptions();
  return {
    ...defaultOptions,
    indexAxis: horizontal ? 'y' : 'x',
    scales: {
      x: {
        ...defaultOptions.scales?.x,
        beginAtZero: true,
        title: horizontal && yAxisLabel
          ? {
              display: true,
              text: yAxisLabel,
              color: chartColors.gray[300],
              font: {
                size: 12,
                weight: 'bold',
                family: "'Inter', sans-serif",
              },
            }
          : undefined,
      },
      y: {
        ...defaultOptions.scales?.y,
        beginAtZero: true,
        title: !horizontal && yAxisLabel
          ? {
              display: true,
              text: yAxisLabel,
              color: chartColors.gray[300],
              font: {
                size: 12,
                weight: 'bold',
                family: "'Inter', sans-serif",
              },
            }
          : undefined,
      },
    },
    elements: {
      bar: {
        borderRadius: 6,
        borderWidth: 0,
      },
    },
  };
};

/**
 * Get doughnut/pie chart specific options
 */
export const getDoughnutChartOptions = (): ChartOptions<'doughnut'> => {
  const defaultOptions = getDefaultChartOptions();
  return {
    ...defaultOptions,
    cutout: '70%', // Makes it a doughnut (0% = pie)
    plugins: {
      ...defaultOptions.plugins,
      legend: {
        ...defaultOptions.plugins?.legend,
        position: 'right',
      },
      tooltip: {
        ...defaultOptions.plugins?.tooltip,
        callbacks: {
          label: (context) => {
            const label = context.label || '';
            const value = context.parsed;
            const percentage = context.dataset.data.reduce((a: number, b: number) => a + b, 0);
            const percent = ((value / percentage) * 100).toFixed(1);
            return `${label}: ${value.toFixed(2)} hours (${percent}%)`;
          },
        },
      },
    },
  };
};

/**
 * Format number as currency
 */
export const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

/**
 * Format number with thousand separators
 */
export const formatNumber = (value: number, decimals: number = 0): string => {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
};
