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
import type { ChartType, Plugin } from 'chart.js';
import type { CSSProperties } from 'react';

export type ChartTheme = 'light' | 'dark';

const FONT_FAMILY = "'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif";

// App-wide Chart.js defaults: our font and a short, calm entrance animation.
// Only adjust the animation defaults — replacing the object drops keys Chart.js relies on
// (e.g. `type: undefined`), and every hover animation then throws ("this._fn is not a
// function"), which kills the tooltips of all charts.
Chart.defaults.font.family = FONT_FAMILY;
Object.assign(Chart.defaults.animation, { duration: 600, easing: 'easeOutQuart' });

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

/** Theme currently applied to the page (used when no theme is passed). */
export const currentChartTheme = (): ChartTheme =>
  typeof document !== 'undefined' && document.documentElement.classList.contains('dark') ? 'dark' : 'light';

/**
 * Categorical palettes for multi-series charts, one per theme, in display order:
 * cyan (brand), amber, violet, green, vermilion, pink.
 *
 * Picked by a maximin search so every pair stays apart under normal vision and
 * simulated protanopia, deuteranopia and tritanopia (CIEDE2000 >= 12 light,
 * >= 11 dark — on par with or above the Okabe–Ito palette), and every colour has
 * at least ~3:1 contrast against the chart surface. A seventh series and beyond
 * repeats the colours with a hatch pattern (see `getSeriesFill`).
 */
const CATEGORICAL_PALETTES: Record<ChartTheme, readonly string[]> = {
  light: ['#019bbf', '#d18501', '#6c4cbd', '#028758', '#cc3526', '#a42c73'],
  dark: ['#38bae0', '#ffb848', '#7976e3', '#00a56c', '#ec5d4b', '#f37ea9'],
};

export const getChartPalette = (theme: ChartTheme = currentChartTheme()): readonly string[] =>
  CATEGORICAL_PALETTES[theme];

/** Colour vision the status colours are tuned for (mirrors AppContext's setting). */
export type ChartColorVision = 'standard' | 'redgreen';

/**
 * Status colours for charts, matching the CSS status variables in index.css:
 * shade 600 in light mode, 400 in dark mode. Red-green vision swaps green/amber/red
 * for blue/yellow/orange.
 */
const STATUS_COLORS: Record<ChartColorVision, Record<ChartTheme, { success: string; warning: string; danger: string }>> = {
  standard: {
    light: { success: '#059669', warning: '#d97706', danger: '#dc2626' },
    dark: { success: '#34d399', warning: '#fbbf24', danger: '#f87171' },
  },
  redgreen: {
    light: { success: '#473dac', warning: '#9a7403', danger: '#942300' },
    dark: { success: '#4183ea', warning: '#ffdc5a', danger: '#ff8365' },
  },
};

export const getStatusChartColors = (
  theme: ChartTheme = currentChartTheme(),
  vision: ChartColorVision = 'standard'
) => STATUS_COLORS[vision][theme];

const patternCache = new Map<string, CanvasPattern>();

/** `color` with diagonal stripes in the chart surface colour; falls back to the plain colour. */
function hatchPattern(color: string, surface: string, round: number): CanvasPattern | string {
  const key = `${color}|${surface}|${round}`;
  const cached = patternCache.get(key);
  if (cached) return cached;
  if (typeof document === 'undefined') return color;
  const size = 8;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return color;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = surface;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 2;
  ctx.beginPath();
  // round 1: "/" stripes, round 2+: "\" stripes
  if (round % 2 === 1) {
    ctx.moveTo(0, size);
    ctx.lineTo(size, 0);
    ctx.moveTo(-size / 2, size / 2);
    ctx.lineTo(size / 2, -size / 2);
    ctx.moveTo(size / 2, size + size / 2);
    ctx.lineTo(size + size / 2, size / 2);
  } else {
    ctx.moveTo(0, 0);
    ctx.lineTo(size, size);
    ctx.moveTo(-size / 2, size / 2);
    ctx.lineTo(size / 2, size + size / 2);
    ctx.moveTo(size / 2, -size / 2);
    ctx.lineTo(size + size / 2, size / 2);
  }
  ctx.stroke();
  const pattern = ctx.createPattern(canvas, 'repeat');
  if (!pattern) return color;
  patternCache.set(key, pattern);
  return pattern;
}

/**
 * Colour of the n-th series: solid for the first round of the palette, then the same
 * colours hatched, so series stay distinguishable beyond six without relying on hue.
 * `color` is the solid colour (borders, legend dots); `fill` may be a pattern.
 */
export function getSeriesFill(index: number, theme: ChartTheme = currentChartTheme()) {
  const palette = getChartPalette(theme);
  const color = palette[index % palette.length];
  const round = Math.floor(index / palette.length);
  const fill = round === 0 ? color : hatchPattern(color, getChartThemeColors(theme).surface, round);
  return { color, fill };
}

/** Same as `getSeriesFill` for DOM elements: CSS background with stripes from the seventh series on. */
export function getSeriesCss(index: number, theme: ChartTheme = currentChartTheme()): CSSProperties {
  const palette = getChartPalette(theme);
  const backgroundColor = palette[index % palette.length];
  const round = Math.floor(index / palette.length);
  if (round === 0) return { backgroundColor };
  const angle = round % 2 === 1 ? 45 : -45;
  const stripe = withAlpha(getChartThemeColors(theme).surface, 0.55);
  return {
    backgroundColor,
    backgroundImage: `repeating-linear-gradient(${angle}deg, transparent 0 3px, ${stripe} 3px 5px)`,
  };
}

/**
 * Palette slot per project for one day of time entries: in order of each project's
 * first entry (then name). Components that show the same day therefore agree on the
 * colours, and two projects of a day never share one (unlike a name hash).
 */
export function projectSlotsForDay(entries: { project_name?: string | null; entry_time?: string | null }[]) {
  const first = new Map<string, string>();
  entries.forEach((entry) => {
    const name = entry.project_name || '';
    const start = entry.entry_time || '99:99';
    if (!first.has(name) || start < first.get(name)!) first.set(name, start);
  });
  const ordered = [...first.entries()].sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]));
  return new Map(ordered.map(([name], index) => [name, index]));
}

/** Kind of day on a time axis (see utils/holidays-api.ts `getDayKindForDate`). */
export type ChartDayKind = 'weekday' | 'weekend' | 'national-holiday' | 'regional-holiday';

/**
 * How a day's axis label is drawn: weekends recede (lighter weight), holidays stand out
 * by weight, colour AND a marker after the label, so they don't depend on colour alone.
 */
export const getDayTickStyle = (kind: ChartDayKind, theme: ChartTheme = currentChartTheme()) => {
  const colors = getChartThemeColors(theme);
  const palette = getChartPalette(theme);
  switch (kind) {
    case 'weekend':
      // Same (readable) colour, lighter weight — no contrast is given up
      return { color: colors.text, weight: 400, marker: '' };
    case 'national-holiday':
      return { color: palette[2], weight: 700, marker: ' •' };
    case 'regional-holiday':
      return { color: palette[1], weight: 700, marker: ' ◦' };
    default:
      return { color: colors.text, weight: 600, marker: '' };
  }
};

/** Background band behind a day's column: weekends a faint grey, holidays a faint tint. */
export const getDayBandColor = (kind: ChartDayKind, theme: ChartTheme = currentChartTheme()): string | null => {
  const palette = getChartPalette(theme);
  switch (kind) {
    case 'weekend':
      return theme === 'dark' ? 'rgba(255, 255, 255, 0.045)' : 'rgba(12, 21, 34, 0.045)';
    case 'national-holiday':
      return withAlpha(palette[2], theme === 'dark' ? 0.16 : 0.12);
    case 'regional-holiday':
      return withAlpha(palette[1], theme === 'dark' ? 0.16 : 0.14);
    default:
      return null;
  }
};

declare module 'chart.js' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface PluginOptionsByType<TType extends ChartType> {
    /** Day kind per category (x) index — see `dayBandsPlugin`. */
    dayBands?: { kinds?: ChartDayKind[]; theme?: ChartTheme };
  }
}

/**
 * Shades the columns of weekends and holidays on a category x axis, behind the bars.
 * Pass it in the chart's `plugins` and set `options.plugins.dayBands.kinds`.
 */
export const dayBandsPlugin: Plugin<'bar'> = {
  id: 'dayBands',
  beforeDatasetsDraw(chart, _args, options) {
    const kinds = (options as { kinds?: ChartDayKind[] } | undefined)?.kinds;
    const x = chart.scales.x;
    if (!kinds?.length || !x) return;
    const theme = (options as { theme?: ChartTheme }).theme;
    const { top, bottom, left, right } = chart.chartArea;
    const step = kinds.length > 1 ? Math.abs(x.getPixelForValue(1) - x.getPixelForValue(0)) : right - left;
    const ctx = chart.ctx;
    ctx.save();
    kinds.forEach((kind, index) => {
      const fill = getDayBandColor(kind, theme);
      if (!fill) return;
      const center = x.getPixelForValue(index);
      const from = Math.max(left, center - step / 2);
      const to = Math.min(right, center + step / 2);
      ctx.fillStyle = fill;
      ctx.fillRect(from, top, to - from, bottom - top);
    });
    ctx.restore();
  },
};

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
        // Chart.js draws footers white by default — invisible on the light tooltip
        footerColor: colors.tooltipTitle,
        titleFont: { size: 12, weight: 600, family: FONT_FAMILY },
        bodyFont: { size: 12, family: FONT_FAMILY },
        footerFont: { size: 12, weight: 600, family: FONT_FAMILY },
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
