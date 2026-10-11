import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

/**
 * Available button style variants.
 */
type ButtonVariant = 'primary' | 'secondary' | 'success' | 'danger' | 'outline' | 'ghost';

/**
 * Available button size variants.
 */
type ButtonSize = 'sm' | 'md' | 'lg';

/**
 * Props for the Button component.
 *
 * @property {ButtonVariant} [variant='primary'] - Visual style variant
 * @property {ButtonSize} [size='md'] - Button size
 * @property {boolean} [isLoading=false] - Show loading spinner, disables interaction
 * @property {ReactNode} [leftIcon] - Icon element displayed before text
 * @property {ReactNode} [rightIcon] - Icon element displayed after text
 */
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

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

const spinnerSize: Record<ButtonSize, string> = {
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
};

/**
 * Button with variants, sizes, optional icons and a loading state.
 *
 * While `isLoading` the button is disabled and a spinner replaces the left icon.
 *
 * @example
 * <Button variant="secondary" leftIcon={<Plus className="h-4 w-4" />}>Add</Button>
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({
  variant = 'primary',
  size = 'md',
  isLoading,
  leftIcon,
  rightIcon,
  disabled,
  className,
  children,
  ...props
}, ref) => {
  const isDisabled = disabled || isLoading;

  return (
    <button
      ref={ref}
      className={cn(baseClasses, buttonVariantClasses[variant], buttonSizeClasses[size], className)}
      disabled={isDisabled}
      aria-busy={isLoading || undefined}
      {...props}
    >
      {isLoading && (
        <svg
          className={cn('animate-spin', spinnerSize[size])}
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {!isLoading && leftIcon && <span className="-ml-0.5 flex items-center">{leftIcon}</span>}
      {children}
      {!isLoading && rightIcon && <span className="-mr-0.5 flex items-center">{rightIcon}</span>}
    </button>
  );
});

Button.displayName = 'Button';
