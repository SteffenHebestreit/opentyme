import { FC } from 'react';
import clsx from 'clsx';

/**
 * Shimmer animation classes for loading placeholders.
 * Gradient animation from gray-200 to gray-100 (dark: gray-800 to gray-700).
 * 
 * @constant
 */
const shimmer = 'animate-pulse bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 dark:from-gray-800 dark:via-gray-700 dark:to-gray-800';

/**
 * Loading skeleton for the Dashboard component.
 * 
 * Features:
 * - Matches Dashboard layout structure
 * - 6 metric card skeletons in responsive grid
 * - 2 chart skeletons with bar placeholders (7 bars each)
 * - 2 list skeletons with 3 items each
 * - Shimmer animation effect (gradient pulse)
 * - Dark mode support
 * - Responsive grid layouts matching actual dashboard
 * 
 * Displayed while dashboard data is loading from API.
 * Provides visual feedback and reduces perceived loading time.
 * 
 * @component
 * @example
 * // In Dashboard component
 * {isLoading ? (
 *   <DashboardSkeleton />
 * ) : (
 *   <DashboardContent data={data} />
 * )}
 * 
 * @returns {JSX.Element} Dashboard loading skeleton
 */
export const DashboardSkeleton: FC = () => {
  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
            <div className="h-4 w-32 rounded-full bg-gray-100 dark:bg-gray-800" />
            <div className={clsx('mt-4 h-8 w-24 rounded-full', shimmer)} />
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
            <div className="h-5 w-40 rounded-full bg-gray-100 dark:bg-gray-800" />
            <div className="mt-6 grid grid-cols-7 gap-3">
              {Array.from({ length: 7 }).map((__, barIndex) => (
                <div key={barIndex} className={clsx('h-32 w-full rounded-md', shimmer)} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
            <div className="h-5 w-40 rounded-full bg-gray-100 dark:bg-gray-800" />
            <div className="mt-4 space-y-4">
              {Array.from({ length: 3 }).map((__, itemIndex) => (
                <div key={itemIndex} className="space-y-2">
                  <div className={clsx('h-4 w-full rounded-full', shimmer)} />
                  <div className={clsx('h-3 w-2/3 rounded-full', shimmer)} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
