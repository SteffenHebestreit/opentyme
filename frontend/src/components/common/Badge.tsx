import React, { ReactNode } from 'react';

/**
 * Available badge color variants.
 * @type {('gray' | 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'pink' | 'indigo' | 'teal' | 'orange' | 'amber' | 'emerald')}
 */
export type BadgeVariant = 
  | 'gray' 
  | 'blue' 
  | 'green' 
  | 'yellow' 
  | 'red' 
  | 'purple' 
  | 'pink' 
  | 'indigo' 
  | 'teal' 
  | 'orange'
  | 'amber'
  | 'emerald';

/**
 * Available badge size variants.
 * @type {('sm' | 'md' | 'lg')}
 */
export type BadgeSize = 'sm' | 'md' | 'lg';

/**
 * Props for the Badge component.
 * 
 * @interface BadgeProps
 * @property {ReactNode} children - Badge content (text or elements)
 * @property {BadgeVariant} [variant='gray'] - Color variant
 * @property {BadgeSize} [size='md'] - Size variant
 * @property {ReactNode} [icon] - Optional icon element to display before text
 * @property {string} [className] - Additional CSS classes
 * @property {boolean} [dot=false] - Show a dot indicator before content
 */
interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
  icon?: ReactNode;
  className?: string;
  dot?: boolean;
}

const variantClasses: Record<BadgeVariant, string> = {
  gray: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
  blue: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  green: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  yellow: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  red: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  purple: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  pink: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400',
  indigo: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
  teal: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400',
  orange: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  emerald: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
};

const sizeClasses: Record<BadgeSize, string> = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-0.5 text-xs',
  lg: 'px-3 py-1 text-sm',
};

/**
 * Reusable badge component for displaying status, labels, or categories.
 * 
 * Features:
 * - 12 color variants for different semantic meanings
 * - Three size options: sm, md, lg
 * - Optional icon or dot indicator
 * - Rounded pill shape
 * - Dark mode support
 * - Flexible content (text or custom elements)
 * 
 * @component
 * @example
 * // Basic badge
 * <Badge>Active</Badge>
 * 
 * @example
 * // Colored status badges
 * <Badge variant="green">Approved</Badge>
 * <Badge variant="red">Rejected</Badge>
 * <Badge variant="yellow">Pending</Badge>
 * 
 * @example
 * // Badge with icon
 * <Badge variant="blue" icon={<CheckIcon className="h-3 w-3" />}>
 *   Verified
 * </Badge>
 * 
 * @example
 * // Badge with dot indicator
 * <Badge variant="green" dot>Online</Badge>
 * 
 * @example
 * // Large badge
 * <Badge variant="purple" size="lg">Premium</Badge>
 * 
 * @param {BadgeProps} props - Component props
 * @returns {JSX.Element} Badge element
 */
export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'gray',
  size = 'md',
  icon,
  className = '',
  dot = false,
}) => {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
    >
      {dot && (
        <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      )}
      {icon && <span className="flex-shrink-0">{icon}</span>}
      {children}
    </span>
  );
};
