/**
 * @fileoverview Card frame shared by the dashboard charts.
 *
 * Header (title, subtitle, controls), a fixed-height plot area and the four
 * states every chart has: loading (shimmer bars), error, empty and ready.
 *
 * @module components/dashboard/charts/ChartPanel
 */

import { FC, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, LucideIcon } from 'lucide-react';
import { Card } from '../../common/Card';
import { EmptyState } from '../../common/EmptyState';
import { cn } from '../../../lib/cn';

export type ChartStatus = 'loading' | 'error' | 'empty' | 'ready';

/**
 * Props for the ChartPanel component.
 *
 * @property {string} title - Chart title
 * @property {string} [subtitle] - One line describing the data
 * @property {ReactNode} [action] - Controls right of the title (range switch, filters)
 * @property {number} height - Plot area height in px
 * @property {ChartStatus} status - Which state to show
 * @property {string} [errorTitle] - Heading of the error state
 * @property {string} [errorMessage] - Detail of the error state
 * @property {LucideIcon} emptyIcon - Icon of the empty state
 * @property {string} emptyTitle - Heading of the empty state
 * @property {string} [emptyHint] - What to do to fill the chart
 * @property {ReactNode} [footer] - Content below the plot (legend, totals) when ready
 * @property {ReactNode} children - The plot (canvas wrapper) shown when ready
 */
interface ChartPanelProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  height: number;
  status: ChartStatus;
  errorTitle?: string;
  errorMessage?: string;
  emptyIcon: LucideIcon;
  emptyTitle: string;
  emptyHint?: string;
  footer?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** Bar heights (in %) of the loading placeholder — a calm, chart-like silhouette. */
const placeholderBars = [38, 52, 45, 66, 58, 74, 62, 80, 70, 56, 68, 48];

export const ChartPanel: FC<ChartPanelProps> = ({
  title,
  subtitle,
  action,
  height,
  status,
  errorTitle,
  errorMessage,
  emptyIcon,
  emptyTitle,
  emptyHint,
  footer,
  className,
  children,
}) => {
  const { t } = useTranslation('common');

  return (
    <Card className={cn('flex flex-col', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 sm:px-6">
        <div className="min-w-0">
          <h3 className="section-title">{title}</h3>
          {subtitle && <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>

      <div className="flex flex-1 flex-col px-5 pb-5 pt-4 sm:px-6">
        <div className="relative" style={{ height }} aria-busy={status === 'loading' || undefined}>
          {status === 'loading' && (
            <div className="flex h-full items-end gap-2 pb-6 pl-8">
              <span className="sr-only">{t('buttons.loading')}</span>
              {placeholderBars.map((barHeight, index) => (
                <div key={index} className="skeleton flex-1" style={{ height: `${barHeight}%` }} />
              ))}
            </div>
          )}

          {status === 'error' && (
            <div className="flex h-full animate-fade-in flex-col items-center justify-center px-6 text-center" role="alert">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-600 ring-1 ring-inset ring-red-600/15 dark:bg-red-500/10 dark:text-red-400 dark:ring-red-400/20">
                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              </span>
              {errorTitle && <p className="mt-3 text-sm font-semibold text-gray-900 dark:text-white">{errorTitle}</p>}
              {errorMessage && <p className="mt-1 max-w-sm text-sm text-gray-500 dark:text-gray-400">{errorMessage}</p>}
            </div>
          )}

          {status === 'empty' && (
            <EmptyState compact icon={emptyIcon} title={emptyTitle} description={emptyHint} className="h-full" />
          )}

          {status === 'ready' && children}
        </div>

        {status === 'ready' && footer}
      </div>
    </Card>
  );
};
