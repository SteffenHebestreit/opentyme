import React, { ReactNode } from 'react';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { EmptyState } from '../common/EmptyState';
import { LucideIcon, TrendingUp } from 'lucide-react';

/**
 * Props for the ChartCard component.
 * 
 * @interface ChartCardProps
 * @property {ReactNode} children - Chart content (canvas or other chart element)
 * @property {string} title - Chart title
 * @property {string} [subtitle] - Optional subtitle or description
 * @property {ReactNode} [actions] - Optional action buttons or controls
 * @property {boolean} [loading] - Show loading state
 * @property {boolean} [error] - Show error state
 * @property {string} [errorMessage] - Error message to display
 * @property {boolean} [empty] - Show empty state
 * @property {string} [emptyMessage] - Empty state message
 * @property {LucideIcon} [emptyIcon] - Icon for empty state
 * @property {string} [className] - Additional CSS classes
 * @property {string} [height] - Chart height (e.g., '300px', '400px')
 */
interface ChartCardProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  loading?: boolean;
  error?: boolean;
  errorMessage?: string;
  empty?: boolean;
  emptyMessage?: string;
  emptyIcon?: LucideIcon;
  className?: string;
  height?: string;
}

/**
 * Chart card component for consistent chart presentation.
 * 
 * Features:
 * - Consistent card styling
 * - Title and subtitle
 * - Optional action buttons
 * - Loading state
 * - Error state
 * - Empty state
 * - Configurable height
 * - Dark mode support
 * 
 * @component
 * @example
 * // Basic chart card
 * <ChartCard title="Revenue Trend" height="400px">
 *   <canvas ref={chartRef} />
 * </ChartCard>
 * 
 * @example
 * // With loading state
 * <ChartCard 
 *   title="Sales by Region" 
 *   subtitle="Last 30 days"
 *   loading={isLoading}
 * >
 *   <canvas ref={chartRef} />
 * </ChartCard>
 * 
 * @example
 * // With actions
 * <ChartCard 
 *   title="Performance Metrics"
 *   actions={
 *     <button className="text-sm text-purple-600">Export</button>
 *   }
 * >
 *   <canvas ref={chartRef} />
 * </ChartCard>
 * 
 * @param {ChartCardProps} props - Component props
 * @returns {JSX.Element} Chart card element
 */
export const ChartCard: React.FC<ChartCardProps> = ({
  children,
  title,
  subtitle,
  actions,
  loading = false,
  error = false,
  errorMessage = 'Failed to load chart data',
  empty = false,
  emptyMessage = 'No data available',
  emptyIcon = TrendingUp,
  className = '',
  height = '300px',
}) => {
  return (
    <div className={`rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900 ${className}`}>
      {/* Header */}
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {title}
          </h3>
          {subtitle && (
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              {subtitle}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2">
            {actions}
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ height }} className="relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-gray-900/50">
            <LoadingSpinner size="lg" />
          </div>
        )}

        {error && !loading && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <svg
                className="mx-auto h-12 w-12 text-red-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                {errorMessage}
              </p>
            </div>
          </div>
        )}

        {empty && !loading && !error && (
          <EmptyState
            icon={emptyIcon}
            title={emptyMessage}
            description="Try adjusting your filters or date range"
          />
        )}

        {!loading && !error && !empty && children}
      </div>
    </div>
  );
};
