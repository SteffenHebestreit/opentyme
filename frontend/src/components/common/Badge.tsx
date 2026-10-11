import React, { ReactNode } from 'react';

/**
 * Available badge color variants.
 * @type {('gray' | 'blue' | 'green' | 'yellow' | 'red' | 'brand' | 'violet' | 'pink' | 'indigo' | 'teal' | 'orange' | 'amber' | 'emerald')}
 */
export type BadgeVariant = 
  | 'gray' 
  | 'blue' 
  | 'green' 
  | 'yellow' 
  | 'red' 
  | 'brand' 
  | 'violet' 
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
  gray: 'bg-gray-100 text-gray-700 ring-gray-500/15 dark:bg-white/5 dark:text-gray-300 dark:ring-white/10',
  blue: 'bg-blue-50 text-blue-700 ring-blue-600/15 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-400/20',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20',
  yellow: 'bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20',
  red: 'bg-red-50 text-red-700 ring-red-600/15 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-400/20',
  brand: 'bg-brand-50 text-brand-700 ring-brand-600/15 dark:bg-brand-500/10 dark:text-brand-300 dark:ring-brand-400/20',
  violet: 'bg-violet-50 text-violet-700 ring-violet-600/15 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-400/20',
  pink: 'bg-pink-50 text-pink-700 ring-pink-600/15 dark:bg-pink-500/10 dark:text-pink-300 dark:ring-pink-400/20',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-600/15 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-400/20',
  teal: 'bg-teal-50 text-teal-700 ring-teal-600/15 dark:bg-teal-500/10 dark:text-teal-300 dark:ring-teal-400/20',
  orange: 'bg-orange-50 text-orange-700 ring-orange-600/15 dark:bg-orange-500/10 dark:text-orange-300 dark:ring-orange-400/20',
  amber: 'bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20',
};

const sizeClasses: Record<BadgeSize, string> = {
  sm: 'px-1.5 py-0.5 text-[11px]',
  md: 'px-2 py-0.5 text-xs',
  lg: 'px-2.5 py-1 text-sm',
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
 * <Badge variant="brand" size="lg">Premium</Badge>
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
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-medium ring-1 ring-inset ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
    >
      {dot && (
        <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      )}
      {icon && <span className="flex-shrink-0">{icon}</span>}
      {children}
    </span>
  );
};
