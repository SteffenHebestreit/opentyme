import { FC, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { cn } from '../../lib/cn';

/**
 * Props for the DashboardSection component.
 *
 * @property {string} title - Section heading
 * @property {ReactNode} [aside] - Small muted content right of the heading (period, hint)
 * @property {ReactNode} children - Section content
 */
interface DashboardSectionProps {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * A titled block of the dashboard. Gives every section the same heading
 * style and spacing so the page reads top-down as one hierarchy.
 */
export const DashboardSection: FC<DashboardSectionProps> = ({ title, aside, children, className }) => (
  <section className={cn('space-y-4', className)}>
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 className="section-title">{title}</h2>
      {aside && <div className="text-sm text-gray-500 dark:text-gray-400">{aside}</div>}
    </div>
    {children}
  </section>
);

/**
 * Quiet "View all →" link for card headers.
 */
export const ViewAllLink: FC<{ to: string; children: ReactNode }> = ({ to, children }) => (
  <Link
    to={to}
    className="group inline-flex items-center gap-1 rounded-md text-sm font-medium text-brand-600 transition-colors hover:text-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-brand-400 dark:hover:text-brand-300"
  >
    {children}
    <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
  </Link>
);
