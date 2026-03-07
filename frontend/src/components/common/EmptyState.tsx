import React, { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';

/**
 * Props for the EmptyState component.
 * 
 * @interface EmptyStateProps
 * @property {string} title - Main empty state title
 * @property {string} [description] - Optional description text
 * @property {LucideIcon} [icon] - Optional icon component (from lucide-react)
 * @property {ReactNode} [action] - Optional action button or element
 * @property {string} [className] - Additional CSS classes
 */
interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
}

/**
 * Reusable empty state component for displaying when no data is available.
 * 
 * Features:
 * - Centered layout with icon, title, and description
 * - Optional call-to-action button
 * - Responsive design
 * - Dark mode support
 * - Flexible icon display
 * - Consistent styling across application
 * 
 * @component
 * @example
 * // Basic empty state
 * <EmptyState 
 *   title="No expenses found"
 *   description="Get started by adding your first expense"
 * />
 * 
 * @example
 * // With icon
 * <EmptyState 
 *   icon={FileText}
 *   title="No invoices yet"
 *   description="Create your first invoice to get started"
 * />
 * 
 * @example
 * // With action button
 * <EmptyState 
 *   icon={Users}
 *   title="No clients yet"
 *   description="Add clients to start tracking your business"
 *   action={
 *     <Button onClick={handleAddClient}>
 *       <Plus className="w-5 h-5 mr-2" />
 *       Add Client
 *     </Button>
 *   }
 * />
 * 
 * @param {EmptyStateProps} props - Component props
 * @returns {JSX.Element} Empty state element
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon: Icon,
  action,
  className = '',
}) => {
  return (
    <div className={`flex flex-col items-center justify-center py-12 px-4 text-center ${className}`}>
      {Icon && (
        <div className="mb-4 rounded-full bg-gray-100 dark:bg-gray-800 p-6">
          <Icon className="h-12 w-12 text-gray-400 dark:text-gray-500" />
        </div>
      )}
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
        {title}
      </h3>
      {description && (
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6 max-w-md">
          {description}
        </p>
      )}
      {action && (
        <div>
          {action}
        </div>
      )}
    </div>
  );
};
