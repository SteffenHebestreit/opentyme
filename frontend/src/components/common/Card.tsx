import React from 'react';
import { cn } from '../../lib/cn';

/**
 * Props for the Card component.
 *
 * @property {React.ReactNode} children - Card content
 * @property {string} [className] - Additional CSS classes
 * @property {boolean} [interactive] - Lift slightly on hover (for clickable cards)
 */
interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  interactive?: boolean;
}

/**
 * Surface container used for grouping content.
 *
 * @example
 * <Card>
 *   <CardHeader title="Recent invoices" action={<Button size="sm">All</Button>} />
 *   <CardBody>…</CardBody>
 * </Card>
 */
export const Card: React.FC<CardProps> = ({ children, className, interactive, ...rest }) => (
  <div
    className={cn(
      'overflow-hidden rounded-xl border border-gray-200 bg-white shadow-soft dark:border-gray-800 dark:bg-gray-900 dark:shadow-none',
      interactive && 'surface-interactive',
      className
    )}
    {...rest}
  >
    {children}
  </div>
);

/**
 * Props for the CardHeader component.
 *
 * @property {string} [title] - Header title
 * @property {string} [subtitle] - Secondary text below the title
 * @property {React.ReactNode} [action] - Element on the right (buttons, links); replaces children
 * @property {React.ReactNode} [children] - Rendered on the right when no action is given
 */
interface CardHeaderProps {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export const CardHeader: React.FC<CardHeaderProps> = ({
  title,
  subtitle,
  action,
  children,
  className,
}) => (
  <div
    className={cn(
      'flex items-center justify-between gap-4 border-b border-gray-100 px-6 py-4 dark:border-gray-800',
      className
    )}
  >
    {(title || subtitle) && (
      <div className="min-w-0">
        {title && (
          <h3 className="truncate text-base font-semibold tracking-tight text-gray-900 dark:text-gray-100">
            {title}
          </h3>
        )}
        {subtitle && (
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
        )}
      </div>
    )}
    {(action || children) && (
      <div className="flex shrink-0 items-center gap-2">{action || children}</div>
    )}
  </div>
);

interface CardBodyProps {
  children: React.ReactNode;
  className?: string;
}

export const CardBody: React.FC<CardBodyProps> = ({ children, className }) => (
  <div className={cn('px-6 py-4', className)}>{children}</div>
);

interface CardFooterProps {
  children: React.ReactNode;
  className?: string;
}

export const CardFooter: React.FC<CardFooterProps> = ({
  children,
  className,
}) => (
  <div
    className={cn(
      'border-t border-gray-100 bg-gray-50 px-6 py-4 dark:border-gray-800 dark:bg-gray-900/60',
      className
    )}
  >
    {children}
  </div>
);
