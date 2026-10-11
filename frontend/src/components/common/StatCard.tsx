import React, { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';
import { AnimatedNumber } from './AnimatedNumber';

/** Accent colour of the stat's icon. */
export type StatCardVariant =
  | 'blue'
  | 'green'
  | 'yellow'
  | 'red'
  | 'purple'
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
  purple: 'bg-purple-50 text-purple-600 ring-purple-600/10 dark:bg-purple-500/10 dark:text-purple-300 dark:ring-purple-400/20',
  indigo: 'bg-indigo-50 text-indigo-600 ring-indigo-600/10 dark:bg-indigo-500/10 dark:text-indigo-400 dark:ring-indigo-400/20',
  pink: 'bg-pink-50 text-pink-600 ring-pink-600/10 dark:bg-pink-500/10 dark:text-pink-400 dark:ring-pink-400/20',
  teal: 'bg-teal-50 text-teal-600 ring-teal-600/10 dark:bg-teal-500/10 dark:text-teal-400 dark:ring-teal-400/20',
  orange: 'bg-orange-50 text-orange-600 ring-orange-600/10 dark:bg-orange-500/10 dark:text-orange-400 dark:ring-orange-400/20',
};

/**
 * Key-figure tile: label, big value, optional icon, trend and footer.
 *
 * @example
 * <StatCard label="Hours this week" value={32.5} format={(h) => `${h.toFixed(1)} h`} icon={Clock} variant="purple" />
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
  return (
    <div
      className={cn(
        'rounded-xl border border-gray-200 bg-white p-5 shadow-soft transition-colors dark:border-gray-800 dark:bg-gray-900 dark:shadow-none',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</p>
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
              trend.startsWith('+')
                ? 'text-emerald-600 dark:text-emerald-400'
                : trend.startsWith('-')
                ? 'text-red-600 dark:text-red-400'
                : 'text-gray-500 dark:text-gray-400'
            )}
          >
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
