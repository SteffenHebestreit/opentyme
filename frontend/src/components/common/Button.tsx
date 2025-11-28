import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * Available button style variants.
 * @type {('primary' | 'secondary' | 'success' | 'danger' | 'outline' | 'ghost')}
 */
type ButtonVariant = 'primary' | 'secondary' | 'success' | 'danger' | 'outline' | 'ghost';

/**
 * Available button size variants.
 * @type {('sm' | 'md' | 'lg')}
 */
type ButtonSize = 'sm' | 'md' | 'lg';

/**
 * Props for the Button component.
 * 
 * @interface ButtonProps
 * @extends {ButtonHTMLAttributes<HTMLButtonElement>}
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
  'inline-flex items-center justify-center font-medium rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';

const variantClasses = {
  primary:
    'bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-500 hover:to-pink-500 focus-visible:ring-purple-500 shadow-lg shadow-purple-500/30',
  secondary: 'bg-gray-800/50 text-gray-100 border border-purple-500/30 hover:bg-purple-500/10 focus-visible:ring-purple-500',
  success: 'bg-green-600 text-white hover:bg-green-500 focus-visible:ring-green-500',
  danger: 'bg-gradient-to-r from-red-600 to-pink-600 text-white hover:from-red-500 hover:to-pink-500 focus-visible:ring-red-500',
  outline:
    'border border-purple-500/40 bg-transparent text-gray-200 hover:bg-purple-500/10 focus-visible:ring-purple-500',
  ghost: 'text-gray-300 hover:text-white hover:bg-purple-500/10 focus-visible:ring-purple-500',
};

const sizeClasses = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-base',
  lg: 'px-6 py-3 text-lg',
};

/**
 * Reusable Button component with multiple variants, sizes, and loading states.
 * 
 * Features:
 * - Six visual variants: primary, secondary, success, danger, outline, ghost
 * - Three size options: sm, md, lg
 * - Loading state with animated spinner
 * - Optional left and right icons
 * - Full accessibility support (disabled, focus ring, ARIA)
 * - Forwards ref for parent component control
 * - Extends all native button HTML attributes
 * 
 * @component
 * @example
 * // Basic usage
 * <Button onClick={handleClick}>Save</Button>
 * 
 * @example
 * // With variant and size
 * <Button variant="danger" size="lg">Delete</Button>
 * 
 * @example
 * // With loading state
 * <Button isLoading={isSaving}>Saving...</Button>
 * 
 * @example
 * // With icons
 * <Button leftIcon={<PlusIcon />}>Add Item</Button>
 * <Button rightIcon={<ChevronIcon />}>Next</Button>
 * 
 * @example
 * // Using ref for focus management
 * const buttonRef = useRef<HTMLButtonElement>(null);
 * <Button ref={buttonRef}>Focus Me</Button>
 * 
 * @param {ButtonProps} props - Component props
 * @param {React.Ref<HTMLButtonElement>} ref - Forwarded ref to button element
 * @returns {JSX.Element} Styled button element
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
      className={`${baseClasses} ${variantClasses[variant]} ${
        sizeClasses[size]
      }${className ? ` ${className}` : ''}`}
      disabled={isDisabled}
      {...props}
    >
      {isLoading && (
        <svg
          className="-ml-1 mr-3 h-5 w-5 animate-spin"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          ></circle>
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
      )}
      {!isLoading && leftIcon && <span className="mr-2 flex items-center">{leftIcon}</span>}
      {children}
      {!isLoading && rightIcon && <span className="ml-2 flex items-center">{rightIcon}</span>}
    </button>
  );
});

Button.displayName = 'Button';
