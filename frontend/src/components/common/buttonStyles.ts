import { cn } from '../../lib/cn';

/** Available button style variants. */
export type ButtonVariant = 'primary' | 'secondary' | 'success' | 'danger' | 'outline' | 'ghost';

/** Available button size variants. */
export type ButtonSize = 'sm' | 'md' | 'lg';

const baseClasses =
  'relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium ' +
  'transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-950 ' +
  'active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50';

export const buttonVariantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-purple-600 text-white shadow-sm shadow-purple-900/10 hover:bg-purple-500 focus-visible:ring-purple-500 ' +
    'dark:bg-purple-600 dark:hover:bg-purple-500',
  secondary:
    'border border-gray-200 bg-white text-gray-700 shadow-sm hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900 focus-visible:ring-purple-500 ' +
    'dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-gray-600 dark:hover:bg-gray-800 dark:hover:text-white',
  success: 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-500 focus-visible:ring-emerald-500',
  danger: 'bg-red-600 text-white shadow-sm hover:bg-red-500 focus-visible:ring-red-500',
  outline:
    'border border-purple-300 bg-transparent text-purple-700 hover:bg-purple-50 focus-visible:ring-purple-500 ' +
    'dark:border-purple-500/40 dark:text-purple-300 dark:hover:bg-purple-500/10',
  ghost:
    'text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus-visible:ring-purple-500 ' +
    'dark:text-gray-300 dark:hover:bg-white/5 dark:hover:text-white',
};

export const buttonSizeClasses: Record<ButtonSize, string> = {
  sm: 'min-h-8 px-3 py-1 text-sm',
  md: 'min-h-9 px-4 py-1.5 text-sm',
  lg: 'min-h-11 px-5 py-2 text-base',
};

/**
 * Classes of a Button — for elements that must look like one but are not a
 * <button>, e.g. a router <Link>.
 *
 * @example
 * <Link to="/dashboard" className={buttonClasses('secondary')}>Back</Link>
 */
export function buttonClasses(variant: ButtonVariant = 'primary', size: ButtonSize = 'md'): string {
  return cn(baseClasses, buttonVariantClasses[variant], buttonSizeClasses[size]);
}
