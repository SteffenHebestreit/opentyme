import { FC, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/cn';
import { TimeSeriesPoint } from '../../api/types';

/**
 * Props for the TrendChart component.
 *
 * @interface TrendChartProps
 * @property {string} title - Chart title
 * @property {string} [subtitle] - Optional subtitle description
 * @property {TimeSeriesPoint[]} data - Time series data points (label, value)
 * @property {'bar' | 'line'} [variant='bar'] - Chart visualization style
 * @property {string} [unit] - Unit label for values (e.g., 'hours', '$')
 */
interface TrendChartProps {
  title: string;
  subtitle?: string;
  data: TimeSeriesPoint[];
  variant?: 'bar' | 'line';
  unit?: string;
}

/**
 * Trend chart component displaying time series data as vertical bars.
 *
 * Features:
 * - One column per data point (e.g. Mon–Sun)
 * - Normalized bar heights (0-100% of max value)
 * - Minimum 6% height for visibility of small values
 * - Brand violet bars (sky for the line variant), neutral grid lines
 * - Max value display in header, total sum in footer
 * - Labels below each bar
 * - Light and dark mode; bar heights ease when values change
 *
 * Data is automatically normalized to fit chart height.
 * Uses useMemo for performance optimization on large datasets.
 *
 * @component
 * @example
 * // Weekly hours chart
 * <TrendChart
 *   title="Weekly Hours"
 *   subtitle="Hours logged per day (Mon–Sun)"
 *   data={[
 *     { label: 'Mon', value: 8 },
 *     { label: 'Tue', value: 6.5 },
 *     // ...
 *   ]}
 *   variant="bar"
 *   unit="h"
 * />
 *
 * @param {TrendChartProps} props - Component props
 * @returns {JSX.Element} Trend chart visualization
 */
export const TrendChart: FC<TrendChartProps> = ({
  title,
  subtitle,
  data,
  variant = 'bar',
  unit,
}) => {
  const { t } = useTranslation('dashboard');
  const { maxValue, normalizedValues, total } = useMemo(() => {
    const values = data.map((point) => point.value);
    const max = Math.max(...values, 1);
    const normalized = values.map((value) => (value / max) * 100);
    const sum = values.reduce((accumulator, current) => accumulator + current, 0);
    return { maxValue: max, normalizedValues: normalized, total: sum };
  }, [data]);

  return (
    <div className="surface p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="section-title">{title}</h3>
          {subtitle ? (
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
          ) : null}
        </div>
        <div className="shrink-0 text-right text-sm tabular-nums text-gray-500 dark:text-gray-400">
          {t('trendChart.max')}: {maxValue.toLocaleString()} {unit ?? ''}
        </div>
      </div>

      <div className="relative mt-6 h-48">
        {/* Quiet grid lines */}
        <div className="pointer-events-none absolute inset-x-0 bottom-6 top-0 flex flex-col justify-between" aria-hidden="true">
          {[0, 1, 2, 3].map((line) => (
            <div key={line} className="border-t border-gray-200 dark:border-gray-800" />
          ))}
        </div>

        <div className="relative flex h-full items-end justify-between gap-3">
          {data.map((point, index) => (
            <div key={`${point.label}-${index}`} className="flex h-full flex-1 flex-col items-center">
              <div className="flex w-full flex-1 items-end">
                <div
                  className={cn(
                    'w-full rounded-t-md transition-[height,opacity] duration-700 ease-out-expo hover:opacity-80',
                    variant === 'bar'
                      ? 'bg-purple-500 dark:bg-purple-400/80'
                      : 'bg-sky-500 dark:bg-sky-400/80'
                  )}
                  style={{ height: `${Math.max(normalizedValues[index], 6)}%` }}
                  title={`${point.label}: ${point.value.toLocaleString()} ${unit ?? ''}`}
                />
              </div>
              <span className="mt-2 h-4 text-xs font-medium leading-4 text-gray-500 dark:text-gray-400">
                {point.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
        <span>{t('trendChart.total')}</span>
        <span className="font-medium tabular-nums text-gray-900 dark:text-white">
          {total.toLocaleString()} {unit ?? ''}
        </span>
      </div>
    </div>
  );
};
