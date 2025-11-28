import { FC, useMemo } from 'react';
import clsx from 'clsx';
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
 * - 7-column grid for weekly data (Mon-Sun)
 * - Normalized bar heights (0-100% of max value)
 * - Minimum 6% height for visibility of small values
 * - Gradient coloring (indigo for bar, sky for line variant)
 * - Max value display in header
 * - Total sum in footer
 * - Labels below each bar
 * - Dark mode support
 * - Responsive hover effects
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
 * @example
 * // Revenue chart
 * <TrendChart 
 *   title="Weekly Revenue"
 *   data={weeklyRevenue}
 *   unit="$"
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
  const { maxValue, normalizedValues } = useMemo(() => {
    const values = data.map((point) => point.value);
    const max = Math.max(...values, 1);
    const normalized = values.map((value) => (value / max) * 100);
    return { maxValue: max, normalizedValues: normalized };
  }, [data]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h3>
          {subtitle ? (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
          ) : null}
        </div>
        <div className="text-right text-sm text-gray-400 dark:text-gray-500">
          Max: {maxValue.toLocaleString()} {unit ?? ''}
        </div>
      </div>

      <div className="mt-6 h-48 flex items-end justify-between gap-3">
        {data.map((point, index) => (
          <div key={`${point.label}-${index}`} className="flex flex-1 flex-col items-center justify-end h-full">
            <div
              className={clsx('w-full rounded-t-md bg-gradient-to-t transition-all hover:opacity-80',
                variant === 'bar'
                  ? 'from-indigo-500/20 via-indigo-500/70 to-indigo-500'
                  : 'from-sky-500/10 via-sky-500/40 to-sky-500'
              )}
              style={{ height: `${Math.max(normalizedValues[index], 6)}%` }}
            />
            <span className="mt-2 text-xs font-medium text-gray-500 dark:text-gray-400">
              {point.label}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
        <span>Total</span>
        <span>
          {data
            .reduce((accumulator, current) => accumulator + current.value, 0)
            .toLocaleString()}{' '}
          {unit ?? ''}
        </span>
      </div>
    </div>
  );
};
