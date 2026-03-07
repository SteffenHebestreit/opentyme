import React from 'react';
import { ChevronRight, Home } from 'lucide-react';
import { Link } from 'react-router-dom';

/**
 * Breadcrumb item.
 */
export interface BreadcrumbItem {
  label: string;
  href?: string;
  onClick?: () => void;
}

/**
 * Props for the Breadcrumb component.
 * 
 * @interface BreadcrumbProps
 * @property {BreadcrumbItem[]} items - Breadcrumb items
 * @property {boolean} [showHome=true] - Show home icon for first item
 * @property {string} [className] - Additional CSS classes
 */
interface BreadcrumbProps {
  items: BreadcrumbItem[];
  showHome?: boolean;
  className?: string;
}

/**
 * Breadcrumb navigation component.
 * 
 * Features:
 * - Hierarchical navigation path
 * - Optional home icon
 * - Link or button support
 * - Disabled styling for current page
 * - Separator chevrons
 * - Dark mode support
 * - Accessible (aria-label, aria-current)
 * - Responsive (truncate on mobile)
 * 
 * @component
 * @example
 * // Basic breadcrumb
 * <Breadcrumb
 *   items={[
 *     { label: 'Dashboard', href: '/' },
 *     { label: 'Payments', href: '/payments' },
 *     { label: 'Invoice #123' },
 *   ]}
 * />
 * 
 * @example
 * // With onClick handlers
 * <Breadcrumb
 *   items={[
 *     { label: 'Home', onClick: () => navigate('/') },
 *     { label: 'Settings', onClick: () => navigate('/settings') },
 *     { label: 'Profile' },
 *   ]}
 *   showHome={false}
 * />
 * 
 * @param {BreadcrumbProps} props - Component props
 * @returns {JSX.Element} Breadcrumb element
 */
export const Breadcrumb: React.FC<BreadcrumbProps> = ({
  items,
  showHome = true,
  className = '',
}) => {
  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex items-center gap-2 text-sm">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          const isFirst = index === 0;

          return (
            <li key={index} className="flex items-center gap-2">
              {/* Item */}
              {isLast ? (
                // Current page (not clickable)
                <span
                  className="font-medium text-gray-900 dark:text-white"
                  aria-current="page"
                >
                  {isFirst && showHome && (
                    <Home className="inline h-4 w-4 mr-1" />
                  )}
                  {item.label}
                </span>
              ) : item.href ? (
                // Link
                <Link
                  to={item.href}
                  className="flex items-center gap-1 text-gray-600 transition-colors hover:text-purple-600 dark:text-gray-400 dark:hover:text-purple-400"
                >
                  {isFirst && showHome && (
                    <Home className="h-4 w-4" />
                  )}
                  <span>{item.label}</span>
                </Link>
              ) : item.onClick ? (
                // Button
                <button
                  onClick={item.onClick}
                  className="flex items-center gap-1 text-gray-600 transition-colors hover:text-purple-600 dark:text-gray-400 dark:hover:text-purple-400"
                >
                  {isFirst && showHome && (
                    <Home className="h-4 w-4" />
                  )}
                  <span>{item.label}</span>
                </button>
              ) : (
                // Plain text
                <span className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
                  {isFirst && showHome && (
                    <Home className="h-4 w-4" />
                  )}
                  <span>{item.label}</span>
                </span>
              )}

              {/* Separator */}
              {!isLast && (
                <ChevronRight className="h-4 w-4 text-gray-400 dark:text-gray-600" />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};
