import React, { ReactNode } from 'react';
import { LucideIcon, TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '../../lib/cn';
import { AnimatedNumber } from './AnimatedNumber';

/** Accent colour of the stat's icon. */
export type StatCardVariant =
  | 'blue'
  | 'green'
  | 'yellow'
  | 'red'
  | 'brand'
  | 'violet'
  | 'indigo'
  | 'pink'
  | 'teal'
  | 'orange';

/**
 * Props for the StatCard component.
 *
 * @property {string} label - Metric name
 * @property {string | number} value - Display value; numbers count up and highlight on change
 * @property {(value: number) => string} [format] - Formats a numeric value (currency, hours, …)
 * @property {StatCardVariant} [variant='blue'] - Icon accent colour
 * @property {LucideIcon} [icon] - Icon component
 * @property {string} [trend] - "+12%" / "-3%" — coloured by sign
 * @property {ReactNode} [hint] - Small text under the value
 * @property {ReactNode} [footer] - Content below a divider
 */
interface StatCardProps {
  label: string;
  value: string | number;
  format?: (value: number) => string;
  variant?: StatCardVariant;
  icon?: LucideIcon;
  trend?: string;
  hint?: ReactNode;
  className?: string;
  footer?: ReactNode;
}

const statAccentClasses: Record<StatCardVariant, string> = {
  blue: 'bg-blue-50 text-blue-600 ring-blue-600/10 dark:bg-blue-500/10 dark:text-blue-400 dark:ring-blue-400/20',
  green: 'bg-emerald-50 text-emerald-600 ring-emerald-600/10 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-400/20',
  yellow: 'bg-amber-50 text-amber-600 ring-amber-600/10 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-400/20',
  red: 'bg-red-50 text-red-600 ring-red-600/10 dark:bg-red-500/10 dark:text-red-400 dark:ring-red-400/20',
  brand: 'bg-brand-50 text-brand-600 ring-brand-600/10 dark:bg-brand-500/10 dark:text-brand-300 dark:ring-brand-400/20',
  violet: 'bg-violet-50 text-violet-600 ring-violet-600/10 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-400/20',
  indigo: 'bg-indigo-50 text-indigo-600 ring-indigo-600/10 dark:bg-indigo-500/10 dark:text-indigo-400 dark:ring-indigo-400/20',
  pink: 'bg-pink-50 text-pink-600 ring-pink-600/10 dark:bg-pink-500/10 dark:text-pink-400 dark:ring-pink-400/20',
  teal: 'bg-teal-50 text-teal-600 ring-teal-600/10 dark:bg-teal-500/10 dark:text-teal-400 dark:ring-teal-400/20',
  orange: 'bg-orange-50 text-orange-600 ring-orange-600/10 dark:bg-orange-500/10 dark:text-orange-400 dark:ring-orange-400/20',
};

/**
 * Key-figure tile: label, big value, optional icon, trend and footer.
 *
 * @example
 * <StatCard label="Hours this week" value={32.5} format={(h) => `${h.toFixed(1)} h`} icon={Clock} variant="brand" />
 */
export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  format,
  variant = 'blue',
  icon: Icon,
  trend,
  hint,
  className = '',
  footer,
}) => {
  // Trend direction is shown as an icon too, so it does not rely on green/red alone
  const trendUp = Boolean(trend?.startsWith('+'));
  const trendDown = Boolean(trend && /^[-\u2212]/.test(trend));
  const TrendIcon = trendUp ? TrendingUp : trendDown ? TrendingDown : null;

  return (
    <div
      className={cn(
        'rounded-xl border border-gray-200 bg-white p-5 shadow-soft transition-colors dark:border-gray-800 dark:bg-gray-900 dark:shadow-edge',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="eyebrow">{label}</p>
        {Icon && (
          <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset', statAccentClasses[variant])}>
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
        )}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <p className="text-2xl font-semibold tracking-tight text-gray-900 tabular-nums dark:text-white">
          {typeof value === 'number' ? <AnimatedNumber value={value} format={format} /> : value}
        </p>
        {trend && (
          <span
            className={cn(
              'text-sm font-medium tabular-nums',
              trendUp
                ? 'text-emerald-600 dark:text-emerald-400'
                : trendDown
                ? 'text-red-600 dark:text-red-400'
                : 'text-gray-500 dark:text-gray-400'
            )}
          >
            {TrendIcon && (
              <TrendIcon className="mr-0.5 inline-block h-3.5 w-3.5 align-middle" aria-hidden="true" />
            )}
            {trend}
          </span>
        )}
      </div>
      {hint && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{hint}</p>}
      {footer && (
        <div className="mt-4 border-t border-gray-100 pt-3 dark:border-gray-800">
          {footer}
        </div>
      )}
    </div>
  );
};
