import { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { SkeletonItem } from '../common/Skeleton';
import { cn } from '../../lib/cn';

/** Bar heights (in %) of the chart placeholders. */
const chartBars = [38, 52, 45, 66, 58, 74, 62, 80, 70, 56, 68, 48];

/** Placeholder for a section heading (and its optional aside). */
const SectionHeadingSkeleton: FC<{ aside?: boolean }> = ({ aside }) => (
  <div className="flex items-center justify-between gap-4">
    <SkeletonItem className="h-5 w-44" />
    {aside && <SkeletonItem className="hidden h-4 w-40 sm:block" />}
  </div>
);

/** Placeholder for a key-figure card. */
const StatSkeleton: FC<{ large?: boolean }> = ({ large }) => (
  <div className={cn('surface', large ? 'p-5 sm:p-6' : 'p-5')}>
    <div className="flex items-start justify-between gap-3">
      <SkeletonItem className="h-4 w-24" />
      <SkeletonItem className={cn('rounded-lg', large ? 'h-9 w-9' : 'h-8 w-8')} />
    </div>
    <SkeletonItem className={cn('mt-3', large ? 'h-8 w-36' : 'h-7 w-24')} />
    <SkeletonItem className="mt-2 h-3 w-32" />
  </div>
);

/**
 * Loading placeholder for the yearly financial overview: four key figures and
 * the compact tax card. Also used by YearlyFinancialSummary while it loads.
 */
export const FinancialSummarySkeleton: FC = () => (
  <div className="space-y-4">
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <StatSkeleton key={index} large />
      ))}
    </div>
    <div className="surface p-5">
      <SkeletonItem className="h-3 w-40" />
      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="space-y-2">
            <SkeletonItem className="h-3 w-20" />
            <SkeletonItem className="h-5 w-24" />
          </div>
        ))}
      </div>
    </div>
  </div>
);

/** Placeholder for a chart card. */
const ChartSkeleton: FC = () => (
  <div className="surface p-5 sm:p-6">
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-2">
        <SkeletonItem className="h-5 w-40" />
        <SkeletonItem className="h-4 w-28" />
      </div>
      <SkeletonItem className="h-8 w-32 rounded-lg" />
    </div>
    <div className="mt-6 flex h-56 items-end gap-2">
      {chartBars.map((height, index) => (
        <div key={index} className="skeleton flex-1" style={{ height: `${height}%` }} />
      ))}
    </div>
  </div>
);

/** Placeholder for a list card (recent entries / invoices). */
const ListSkeleton: FC<{ className?: string }> = ({ className }) => (
  <div className={cn('surface overflow-hidden', className)}>
    <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 dark:border-gray-800">
      <SkeletonItem className="h-5 w-40" />
      <SkeletonItem className="h-4 w-20" />
    </div>
    <div className="divide-y divide-gray-100 dark:divide-gray-800/70">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="flex items-start justify-between gap-4 px-6 py-4">
          <div className="flex-1 space-y-2">
            <SkeletonItem className="h-4 w-2/3" />
            <SkeletonItem className="h-3 w-1/3" />
          </div>
          <SkeletonItem className="h-4 w-12" />
        </div>
      ))}
    </div>
  </div>
);

/**
 * Loading skeleton for the Dashboard component.
 *
 * Mirrors the dashboard layout so nothing jumps when the data arrives:
 * financial key figures + tax card, the "at a glance" metrics, the two
 * analytics charts and the recent-activity lists. Shimmer comes from the
 * shared `skeleton` class (reduced-motion aware).
 *
 * @component
 * @example
 * {isLoading ? <DashboardSkeleton /> : <DashboardContent data={data} />}
 *
 * @returns {JSX.Element} Dashboard loading skeleton
 */
export const DashboardSkeleton: FC = () => {
  const { t } = useTranslation('dashboard');

  return (
    <div className="space-y-8" aria-busy="true">
      <span className="sr-only">{t('loading')}</span>

      <section className="space-y-4">
        <SectionHeadingSkeleton aside />
        <FinancialSummarySkeleton />
      </section>

      <section className="space-y-4">
        <SectionHeadingSkeleton />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <StatSkeleton key={index} />
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeadingSkeleton />
        <div className="grid gap-6 lg:grid-cols-2">
          <ChartSkeleton />
          <ChartSkeleton />
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeadingSkeleton />
        <div className="grid gap-6 xl:grid-cols-5">
          <ListSkeleton className="xl:col-span-2" />
          <ListSkeleton className="xl:col-span-3" />
        </div>
      </section>
    </div>
  );
};
