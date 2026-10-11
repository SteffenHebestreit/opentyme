import React, { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';

/**
 * Props for the EmptyState component.
 *
 * @property {string} title - What is empty ("No invoices yet")
 * @property {string} [description] - What to do about it
 * @property {LucideIcon} [icon] - Illustrative icon
 * @property {ReactNode} [action] - Call to action (usually a Button)
 * @property {boolean} [bordered] - Dashed outline, for empty areas inside a page
 * @property {boolean} [compact] - Less vertical padding, for cards and side panels
 */
interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  bordered?: boolean;
  compact?: boolean;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon: Icon,
  action,
  bordered = false,
  compact = false,
  className = '',
}) => {
  return (
    <div
      className={cn(
        'flex animate-fade-up flex-col items-center justify-center px-6 text-center',
        compact ? 'py-8' : 'py-14',
        bordered && 'rounded-xl border border-dashed border-gray-300 bg-gray-50/50 dark:border-gray-800 dark:bg-gray-900/30',
        className
      )}
    >
      {Icon && (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-white text-gray-400 shadow-soft ring-1 ring-gray-200 dark:bg-gray-900 dark:text-gray-500 dark:ring-gray-800">
          <Icon className="h-6 w-6" aria-hidden="true" />
        </div>
      )}
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-gray-500 dark:text-gray-400">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
};
