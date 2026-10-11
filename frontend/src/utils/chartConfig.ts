/**
 * @fileoverview Chart.js configuration for dashboard charts.
 *
 * Provides default options and theme configuration for Chart.js charts:
 * - Light and dark styling (pass the theme from `useChartTheme()` so charts
 *   restyle when the user switches theme)
 * - Brand-violet accent colours
 * - Quiet grid, compact tooltips, short animations
 *
 * @module utils/chartConfig
 */

import { Chart, ChartOptions } from 'chart.js';

export type ChartTheme = 'light' | 'dark';

const FONT_FAMILY = "'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif";

// App-wide Chart.js defaults: our font and a short, calm entrance animation.
Chart.defaults.font.family = FONT_FAMILY;
Chart.defaults.animation = { duration: 600, easing: 'easeOutQuart' };

/**
 * Color palette for charts (brand violet + accents)
 */
export const chartColors = {
  primary: '#8b5cf6',      // brand-500
  primaryDark: '#7c3aed',  // brand-600
  secondary: '#ec4899',    // pink-500
  success: '#10b981',      // emerald-500
  danger: '#ef4444',       // red-500
  warning: '#f59e0b',      // amber-500
  info: '#0ea5e9',         // sky-500
  gray: {
    50: '#fafafb',
    100: '#f4f4f6',
    200: '#e7e7eb',
    300: '#d5d5dc',
    400: '#a1a1ac',
    500: '#71717c',
    600: '#52525c',
    700: '#3d3d46',
    800: '#26262d',
    900: '#17171c',
  },
};

/**
 * Categorical palette for multi-series charts, in display order.
 */
export const chartPalette = [
  '#8b5cf6', // violet
  '#0ea5e9', // sky
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ec4899', // pink
  '#6366f1', // indigo
  '#14b8a6', // teal
  '#ef4444', // red
];

/** Theme currently applied to the page (used when no theme is passed). */
export const currentChartTheme = (): ChartTheme =>
  typeof document !== 'undefined' && document.documentElement.classList.contains('dark') ? 'dark' : 'light';

/**
 * Text, grid and tooltip colours for a theme.
 */
export const getChartThemeColors = (theme: ChartTheme = currentChartTheme()) =>
  theme === 'dark'
    ? {
        text: '#a1a1ac',
        textStrong: '#e7e7eb',
        grid: 'rgba(255, 255, 255, 0.06)',
        tooltipBg: 'rgba(23, 23, 28, 0.96)',
        tooltipBorder: 'rgba(255, 255, 255, 0.08)',
        tooltipTitle: '#fafafb',
        tooltipBody: '#d5d5dc',
        surface: '#17171c',
      }
    : {
        text: '#71717c',
        textStrong: '#26262d',
        grid: 'rgba(15, 15, 20, 0.06)',
        tooltipBg: 'rgba(255, 255, 255, 0.98)',
        tooltipBorder: '#e7e7eb',
        tooltipTitle: '#17171c',
        tooltipBody: '#52525c',
        surface: '#ffffff',
      };

/**
 * Translucent fill for an area under a line: `withAlpha('#8b5cf6', 0.15)`.
 */
export const withAlpha = (hex: string, alpha: number): string => {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const axisTitle = (text: string | undefined, theme: ChartTheme) =>
  text
    ? {
        display: true,
        text,
        color: getChartThemeColors(theme).text,
        font: { size: 11, weight: 500, family: FONT_FAMILY },
      }
    : undefined;

/**
 * Get default chart options for the given theme.
 * Use this as base configuration for all charts.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- shared base for line, bar and doughnut options
export const getDefaultChartOptions = (theme: ChartTheme = currentChartTheme()): ChartOptions<any> => {
  const colors = getChartThemeColors(theme);
  return {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: {
        display: true,
        position: 'bottom',
        labels: {
          color: colors.text,
          padding: 16,
          boxWidth: 8,
          boxHeight: 8,
          font: { size: 12, family: FONT_FAMILY },
          usePointStyle: true,
          pointStyle: 'circle',
        },
      },
      tooltip: {
        enabled: true,
        mode: 'index',
        intersect: false,
        backgroundColor: colors.tooltipBg,
        titleColor: colors.tooltipTitle,
        bodyColor: colors.tooltipBody,
        borderColor: colors.tooltipBorder,
        borderWidth: 1,
        padding: 10,
        cornerRadius: 10,
        titleFont: { size: 12, weight: 600, family: FONT_FAMILY },
        bodyFont: { size: 12, family: FONT_FAMILY },
        displayColors: true,
        boxPadding: 4,
        usePointStyle: true,
      },
    },
    scales: {
      x: {
        grid: { display: false, drawTicks: false },
        ticks: { color: colors.text, padding: 8, font: { size: 11, family: FONT_FAMILY } },
        border: { display: false },
      },
      y: {
        grid: { display: true, color: colors.grid, drawTicks: false },
        ticks: { color: colors.text, padding: 8, font: { size: 11, family: FONT_FAMILY } },
        border: { display: false },
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
 * Get line chart specific options.
 *
 * @param yAxisLabel - Label for Y axis
 * @param theme - 'light' | 'dark' (defaults to the page's current theme)
 */
export const getLineChartOptions = (yAxisLabel?: string, theme: ChartTheme = currentChartTheme()): ChartOptions<'line'> => {
  const defaultOptions = getDefaultChartOptions(theme);
  return {
    ...defaultOptions,
    scales: {
      ...defaultOptions.scales,
      y: {
        ...defaultOptions.scales?.y,
        beginAtZero: true,
        title: axisTitle(yAxisLabel, theme),
      },
    },
    elements: {
      line: {
        tension: 0.35,
        borderWidth: 2,
      },
      point: {
        radius: 0,
        hoverRadius: 4,
        hitRadius: 12,
      },
    },
  };
};

/**
 * Get bar chart specific options.
 *
 * @param yAxisLabel - Label for the value axis
 * @param horizontal - Whether to display horizontal bars
 * @param theme - 'light' | 'dark' (defaults to the page's current theme)
 */
export const getBarChartOptions = (
  yAxisLabel?: string,
  horizontal: boolean = false,
  theme: ChartTheme = currentChartTheme()
): ChartOptions<'bar'> => {
  const defaultOptions = getDefaultChartOptions(theme);
  const colors = getChartThemeColors(theme);
  return {
    ...defaultOptions,
    indexAxis: horizontal ? 'y' : 'x',
    scales: {
      x: {
        ...defaultOptions.scales?.x,
        grid: horizontal ? { display: true, color: colors.grid, drawTicks: false } : { display: false, drawTicks: false },
        beginAtZero: true,
        title: horizontal ? axisTitle(yAxisLabel, theme) : undefined,
      },
      y: {
        ...defaultOptions.scales?.y,
        grid: horizontal ? { display: false, drawTicks: false } : { display: true, color: colors.grid, drawTicks: false },
        beginAtZero: true,
        title: !horizontal ? axisTitle(yAxisLabel, theme) : undefined,
      },
    },
    elements: {
      bar: {
        borderRadius: 6,
        borderSkipped: false,
        borderWidth: 0,
      },
    },
  };
};

/**
 * Get doughnut chart specific options.
 *
 * @param theme - 'light' | 'dark' (defaults to the page's current theme)
 */
export const getDoughnutChartOptions = (theme: ChartTheme = currentChartTheme()): ChartOptions<'doughnut'> => {
  const defaultOptions = getDefaultChartOptions(theme);
  return {
    ...defaultOptions,
    cutout: '72%',
    scales: {},
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
            const total = context.dataset.data.reduce((a: number, b: number) => a + b, 0);
            const percent = total ? ((value / total) * 100).toFixed(1) : '0.0';
            return `${label}: ${value.toFixed(2)} hours (${percent}%)`;
          },
        },
      },
    },
    elements: {
      arc: { borderWidth: 0 },
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
