/**
 * @fileoverview Project time-budget widget.
 *
 * Shows, per project, how many logged hours have been consumed against the
 * project's estimated_hours, with a progress bar and over-budget highlighting.
 * Self-contained: fetches its own data and renders nothing when there are no
 * projects with an estimate or logged time.
 *
 * @module components/dashboard/ProjectTimeBudgets
 */

import { FC } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getProjectTimeBudgets, ProjectTimeBudget } from '../../api/services/analytics.service';

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

  const barColor = budget.over_budget
    ? 'bg-red-500'
    : budget.percentage >= 80
      ? 'bg-amber-500'
      : 'bg-purple-500';

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <span className="truncate text-sm font-medium text-gray-900 dark:text-white">
            {budget.project_name}
          </span>
          {budget.client_name && (
            <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">{budget.client_name}</span>
          )}
        </div>
        <div className="shrink-0 text-xs text-gray-600 dark:text-gray-300">
          {budget.logged_hours.toFixed(1)}
          {hasEstimate ? ` / ${budget.estimated_hours.toFixed(1)}h` : 'h'}
          {hasEstimate && (
            <span className={budget.over_budget ? 'ml-1 font-semibold text-red-600 dark:text-red-400' : 'ml-1 text-gray-400'}>
              ({budget.percentage.toFixed(0)}%)
            </span>
          )}
        </div>
      </div>
      {hasEstimate && (
        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${barWidth}%` }} />
        </div>
      )}
      {budget.over_budget && (
        <p className="text-xs text-red-600 dark:text-red-400">
          {t('projectBudgets.overBudget', {
            defaultValue: 'Over budget by {{hours}}h',
            hours: Math.abs(budget.remaining_hours).toFixed(1),
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
    <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
      <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
        {t('projectBudgets.title', { defaultValue: 'Project Time Budgets' })}
      </h3>
      <div className="space-y-4">
        {budgets.slice(0, 8).map((budget) => (
          <BudgetRow key={budget.project_id} budget={budget} />
        ))}
      </div>
    </div>
  );
};

export default ProjectTimeBudgets;
