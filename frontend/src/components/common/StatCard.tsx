import React, { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';

/**
 * Available stat card color variants.
 * @type {('blue' | 'green' | 'yellow' | 'red' | 'purple' | 'indigo' | 'pink' | 'teal' | 'orange')}
 */
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
 * @interface StatCardProps
 * @property {string} label - Stat label/title
 * @property {string | number} value - Main stat value to display
 * @property {StatCardVariant} [variant='blue'] - Color variant
 * @property {LucideIcon} [icon] - Optional icon component (from lucide-react)
 * @property {string} [trend] - Optional trend indicator (e.g., "+12%", "-5%")
 * @property {string} [className] - Additional CSS classes
 * @property {ReactNode} [footer] - Optional footer content
 */
interface StatCardProps {
  label: string;
  value: string | number;
  variant?: StatCardVariant;
  icon?: LucideIcon;
  trend?: string;
  className?: string;
  footer?: ReactNode;
}

const variantClasses: Record<StatCardVariant, { bg: string; border: string; icon: string }> = {
  blue: {
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    border: 'border-blue-200 dark:border-blue-900/30',
    icon: 'text-blue-600 dark:text-blue-400',
  },
  green: {
    bg: 'bg-green-50 dark:bg-green-900/20',
    border: 'border-green-200 dark:border-green-900/30',
    icon: 'text-green-600 dark:text-green-400',
  },
  yellow: {
    bg: 'bg-yellow-50 dark:bg-yellow-900/20',
    border: 'border-yellow-200 dark:border-yellow-900/30',
    icon: 'text-yellow-600 dark:text-yellow-400',
  },
  red: {
    bg: 'bg-red-50 dark:bg-red-900/20',
    border: 'border-red-200 dark:border-red-900/30',
    icon: 'text-red-600 dark:text-red-400',
  },
  purple: {
    bg: 'bg-purple-50 dark:bg-purple-900/20',
    border: 'border-purple-200 dark:border-purple-900/30',
    icon: 'text-purple-600 dark:text-purple-400',
  },
  indigo: {
    bg: 'bg-indigo-50 dark:bg-indigo-900/20',
    border: 'border-indigo-200 dark:border-indigo-900/30',
    icon: 'text-indigo-600 dark:text-indigo-400',
  },
  pink: {
    bg: 'bg-pink-50 dark:bg-pink-900/20',
    border: 'border-pink-200 dark:border-pink-900/30',
    icon: 'text-pink-600 dark:text-pink-400',
  },
  teal: {
    bg: 'bg-teal-50 dark:bg-teal-900/20',
    border: 'border-teal-200 dark:border-teal-900/30',
    icon: 'text-teal-600 dark:text-teal-400',
  },
  orange: {
    bg: 'bg-orange-50 dark:bg-orange-900/20',
    border: 'border-orange-200 dark:border-orange-900/30',
    icon: 'text-orange-600 dark:text-orange-400',
  },
};

/**
 * Reusable stat card component for displaying metrics and statistics.
 * 
 * Features:
 * - Color-coded variants for different metric types
 * - Optional icon display
 * - Optional trend indicator
 * - Optional footer content
 * - Rounded corners with border and background
 * - Dark mode support
 * - Responsive padding
 * 
 * @component
 * @example
 * // Basic stat card
 * <StatCard 
 *   label="Total Revenue" 
 *   value="$12,345" 
 *   variant="green"
 * />
 * 
 * @example
 * // With icon and trend
 * <StatCard 
 *   label="Total Expenses" 
 *   value="$5,678" 
 *   variant="red"
 *   icon={TrendingDown}
 *   trend="-12%"
 * />
 * 
 * @example
 * // With footer
 * <StatCard 
 *   label="Pending Invoices" 
 *   value={23}
 *   variant="blue"
 *   footer={<a href="/invoices" className="text-sm">View all →</a>}
 * />
 * 
 * @param {StatCardProps} props - Component props
 * @returns {JSX.Element} Stat card element
 */
export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  variant = 'blue',
  icon: Icon,
  trend,
  className = '',
  footer,
}) => {
  const colors = variantClasses[variant];

  return (
    <div
      className={`rounded-lg border ${colors.border} ${colors.bg} p-4 ${className}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
            {label}
          </p>
          <div className="mt-1 flex items-baseline gap-2">
            <p className="text-2xl font-semibold text-gray-900 dark:text-white">
              {value}
            </p>
            {trend && (
              <span className={`text-sm font-medium ${
                trend.startsWith('+') 
                  ? 'text-green-600 dark:text-green-400' 
                  : trend.startsWith('-')
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-gray-600 dark:text-gray-400'
              }`}>
                {trend}
              </span>
            )}
          </div>
        </div>
        {Icon && (
          <div className={`rounded-lg p-2 ${colors.icon}`}>
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
      {footer && (
        <div className="mt-3 border-t border-gray-200 dark:border-gray-700 pt-3">
          {footer}
        </div>
      )}
    </div>
  );
};
