import React, { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';

/**
 * Props for the PageHeader component.
 *
 * @property {string} title - Page title (rendered as the page's h1)
 * @property {ReactNode} [subtitle] - One line explaining the page
 * @property {ReactNode} [actions] - Primary actions, right-aligned on wide screens
 * @property {LucideIcon} [icon] - Optional icon shown before the title
 * @property {ReactNode} [meta] - Small content under the subtitle (badges, period, …)
 */
interface PageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  icon?: LucideIcon;
  meta?: ReactNode;
  className?: string;
}

/**
 * Standard page heading: title, subtitle and actions.
 *
 * @example
 * <PageHeader title="Projects" subtitle="All engagements" actions={<Button>New project</Button>} />
 */
export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  actions,
  icon: Icon,
  meta,
  className = '',
}) => {
  return (
    <div className={cn('mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {Icon && (
          <span className="mt-0.5 hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-600/10 sm:flex dark:bg-brand-500/10 dark:text-brand-300 dark:ring-brand-400/20">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0">
          <h1 className="page-title">{title}</h1>
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
          {meta && <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
};
