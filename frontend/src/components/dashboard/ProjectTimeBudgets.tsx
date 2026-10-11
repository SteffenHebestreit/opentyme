/**
 * @fileoverview Project time-budget widget.
 *
 * Shows, per project, how many logged hours have been consumed against the
 * project's estimated_hours, with a progress bar and near-/over-budget highlighting
 * (each state also spelled out as text with an icon, not only by bar colour).
 * Self-contained: fetches its own data and renders nothing when there are no
 * projects with an estimate or logged time.
 *
 * @module components/dashboard/ProjectTimeBudgets
 */

import { FC } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Clock } from 'lucide-react';
import { getProjectTimeBudgets, ProjectTimeBudget } from '../../api/services/analytics.service';
import { cn } from '../../lib/cn';
import { Card, CardHeader } from '../common/Card';

/**
 * Clamp a percentage into the 0–100 range for bar widths.
 */
function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

const BudgetRow: FC<{ budget: ProjectTimeBudget }> = ({ budget }) => {
  const { t } = useTranslation('dashboard');
  const hasEstimate = budget.estimated_hours > 0;
  const barWidth = hasEstimate ? clampPercent(budget.percentage) : 0;
  const nearBudget = hasEstimate && !budget.over_budget && budget.percentage >= 80;

  const barColor = budget.over_budget
    ? 'bg-red-500'
    : nearBudget
      ? 'bg-amber-500'
      : 'bg-brand-500 dark:bg-brand-400';

  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-sm font-medium text-gray-900 dark:text-white">
            {budget.project_name}
          </span>
          {budget.client_name && (
            <span className="truncate text-xs text-gray-500 dark:text-gray-400">{budget.client_name}</span>
          )}
        </div>
        <div className="shrink-0 text-xs tabular-nums text-gray-600 dark:text-gray-300">
          {budget.logged_hours.toFixed(1)}
          {hasEstimate ? ` / ${budget.estimated_hours.toFixed(1)}h` : 'h'}
          {hasEstimate && (
            <span
              className={cn(
                'ml-1',
                budget.over_budget
                  ? 'font-semibold text-red-600 dark:text-red-400'
                  : 'text-gray-400 dark:text-gray-500'
              )}
            >
              ({budget.percentage.toFixed(0)}%)
            </span>
          )}
        </div>
      </div>
      {hasEstimate && (
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800"
          role="progressbar"
          aria-label={budget.project_name}
          aria-valuenow={Math.round(barWidth)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={cn('h-full rounded-full transition-[width] duration-700 ease-out-expo', barColor)}
            style={{ width: `${barWidth}%` }}
          />
        </div>
      )}
      {budget.over_budget && (
        <p className="flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
          {t('projectBudgets.overBudget', {
            defaultValue: 'Over budget by {{hours}}h',
            hours: Math.abs(budget.remaining_hours).toFixed(1),
          })}
        </p>
      )}
      {nearBudget && (
        <p className="flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400">
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          {t('projectBudgets.nearBudget', {
            defaultValue: 'Near limit: {{hours}}h left',
            hours: Math.max(0, budget.remaining_hours).toFixed(1),
          })}
        </p>
      )}
    </div>
  );
};

/**
 * Dashboard widget listing per-project time-budget consumption.
 * Renders null while loading, on error, or when there is nothing to show.
 */
export const ProjectTimeBudgets: FC = () => {
  const { t } = useTranslation('dashboard');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['project-time-budgets'],
    queryFn: getProjectTimeBudgets,
    staleTime: 60_000,
  });

  // Only show projects that actually have a time budget set. Without an estimate
  // there is no budget to track, so a row would just be a raw hour count — which
  // is misleading under a "Time Budgets" heading. The widget hides itself when no
  // project has an estimate.
  const budgets = (data ?? []).filter((b) => b.estimated_hours > 0);

  if (isLoading || isError || budgets.length === 0) {
    return null;
  }

  return (
    <Card className="animate-fade-in">
      <CardHeader
        title={t('projectBudgets.title', { defaultValue: 'Project Time Budgets' })}
        subtitle={t('projectBudgets.subtitle')}
      />
      <div className="grid gap-x-10 gap-y-5 px-6 py-5 md:grid-cols-2">
        {budgets.slice(0, 8).map((budget) => (
          <BudgetRow key={budget.project_id} budget={budget} />
        ))}
      </div>
    </Card>
  );
};

export default ProjectTimeBudgets;
