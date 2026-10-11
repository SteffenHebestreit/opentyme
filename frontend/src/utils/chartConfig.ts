/**
 * @fileoverview Chart.js configuration for dashboard charts.
 *
 * Provides default options and theme configuration for Chart.js charts:
 * - Light and dark styling (pass the theme from `useChartTheme()` so charts
 *   restyle when the user switches theme)
 * - Brand-cyan accent colours, violet as the second series
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
 * Color palette for charts (brand cyan + accents)
 */
export const chartColors = {
  primary: '#019bbf',      // brand-500
  primaryDark: '#007b98',  // brand-600
  secondary: '#9171f1',    // violet-500
  success: '#10b981',      // emerald-500
  danger: '#ef4444',       // red-500
  warning: '#f59e0b',      // amber-500
  info: '#4a74dc',         // blue — kept apart from the cyan brand
  gray: {
    50: '#f5f8fc',
    100: '#eff3f8',
    200: '#e0e6ed',
    300: '#cdd4de',
    400: '#9ba4b0',
    500: '#67717e',
    600: '#4c5764',
    700: '#364150',
    800: '#1f2b3b',
    900: '#0c1522',
  },
};

/**
 * Categorical palette for multi-series charts, in display order.
 */
export const chartPalette = [
  '#019bbf', // cyan (brand)
  '#9171f1', // violet
  '#10b981', // emerald
  '#f59e0b', // amber
  '#4a74dc', // blue
  '#ec4899', // pink
  '#f97316', // orange
  '#ef4444', // red (teal dropped: too close to the cyan brand)
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
        text: '#9ba4b0',
        textStrong: '#e0e6ed',
        grid: 'rgba(255, 255, 255, 0.06)',
        tooltipBg: 'rgba(12, 21, 34, 0.96)',
        tooltipBorder: 'rgba(56, 186, 224, 0.18)',
        tooltipTitle: '#f5f8fc',
        tooltipBody: '#cdd4de',
        surface: '#0c1522',
      }
    : {
        text: '#67717e',
        textStrong: '#1f2b3b',
        grid: 'rgba(12, 21, 34, 0.06)',
        tooltipBg: 'rgba(255, 255, 255, 0.98)',
        tooltipBorder: '#e0e6ed',
        tooltipTitle: '#0c1522',
        tooltipBody: '#4c5764',
        surface: '#ffffff',
      };

/**
 * Translucent fill for an area under a line: `withAlpha('#019bbf', 0.15)`.
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
        // keeps curves from overshooting below zero / above peaks on sparse data
        cubicInterpolationMode: 'monotone',
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
