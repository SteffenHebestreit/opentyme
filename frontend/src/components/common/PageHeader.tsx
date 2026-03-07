import React, { ReactNode } from 'react';

/**
 * Props for the PageHeader component.
 * 
 * @interface PageHeaderProps
 * @property {string} title - Main page title
 * @property {string} [subtitle] - Optional subtitle or description
 * @property {ReactNode} [actions] - Action buttons or elements to display on the right
 * @property {string} [className] - Additional CSS classes
 */
interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
}

/**
 * Reusable page header component for consistent page titles and actions.
 * 
 * Features:
 * - Title and optional subtitle
 * - Flexible action area (buttons, dropdowns, etc.)
 * - Responsive layout (stacks on mobile, side-by-side on desktop)
 * - Dark mode support
 * - Consistent spacing and typography
 * 
 * @component
 * @example
 * // Basic page header
 * <PageHeader title="Expenses" />
 * 
 * @example
 * // With subtitle
 * <PageHeader 
 *   title="Client Management" 
 *   subtitle="Manage your clients and their information"
 * />
 * 
 * @example
 * // With action button
 * <PageHeader 
 *   title="Tax Rates" 
 *   actions={
 *     <Button onClick={handleAdd}>
 *       <Plus className="w-5 h-5 mr-2" />
 *       Add Tax Rate
 *     </Button>
 *   }
 * />
 * 
 * @example
 * // With multiple actions
 * <PageHeader 
 *   title="Invoices" 
 *   subtitle="Track and manage your invoices"
 *   actions={
 *     <div className="flex gap-2">
 *       <Button variant="outline" onClick={handleExport}>Export</Button>
 *       <Button onClick={handleCreate}>Create Invoice</Button>
 *     </div>
 *   }
 * />
 * 
 * @param {PageHeaderProps} props - Component props
 * @returns {JSX.Element} Page header element
 */
export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  actions,
  className = '',
}) => {
  return (
    <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 ${className}`}>
      <div className="flex-1">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex-shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
};
