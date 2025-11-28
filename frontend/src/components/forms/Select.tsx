import { forwardRef } from 'react';
import type { SelectHTMLAttributes } from 'react';

/**
 * Available select size variants.
 * @type {('sm' | 'md' | 'lg')}
 */
type SelectSize = 'sm' | 'md' | 'lg';

/**
 * Props for the Select component.
 * 
 * @interface SelectProps
 * @extends {Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'>}
 * @property {string} [label] - Label text displayed above select
 * @property {string} [error] - Error message (shows red styling and error icon)
 * @property {string} [helperText] - Helper text displayed below select (when no error)
 * @property {SelectSize} [selectSize='md'] - Select size variant
 */
interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label?: string;
  error?: string;
  helperText?: string;
  selectSize?: SelectSize;
}

const baseClasses =
  'block w-full bg-transparent border-0 border-b-2 border-gray-600 dark:border-gray-400 focus:outline-none focus:border-purple-500 dark:focus:border-purple-400 text-gray-900 dark:text-gray-100 transition-all duration-200 ease-in-out appearance-none cursor-pointer accent-purple-500';

const sizeClasses = {
  sm: 'px-2 py-1 text-sm',
  md: 'px-2 py-2 text-base',
  lg: 'px-2 py-3 text-lg',
};

/**
 * Flexible select component with validation and error handling.
 * Matches the styling of the Input component for consistency.
 * 
 * Features:
 * - Floating label that moves when focused or has value
 * - Error state with red styling and error icon
 * - Three size variants: sm, md, lg
 * - Disabled state support
 * - Full HTML select attributes support
 * - Ref forwarding for parent control
 * - Custom arrow indicator
 * - Transparent background with bottom border only
 * 
 * @component
 * @example
 * // Basic select
 * <Select label="Project">
 *   <option value="">Select a project</option>
 *   <option value="1">Project 1</option>
 * </Select>
 * 
 * @example
 * // With error
 * <Select 
 *   label="Category"
 *   error="Please select a category"
 * >
 *   <option value="">Select...</option>
 * </Select>
 * 
 * @param {SelectProps} props - Component props
 * @param {React.Ref<HTMLSelectElement>} ref - Forwarded ref to select element
 * @returns {JSX.Element} Styled select field with label and validation
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(({
  label,
  error,
  helperText,
  disabled,
  className,
  selectSize = 'md',
  children,
  ...props
}, ref) => {
  const selectId = props.id || `select-${Math.random().toString(36).substr(2, 9)}`;

  return (
    <div className="mb-6">
      {label && (
        <label 
          htmlFor={selectId}
          className={`block mb-2 text-sm font-medium ${
            error 
              ? 'text-red-500 dark:text-red-400' 
              : 'text-gray-700 dark:text-gray-300'
          }`}
        >
          {label}
        </label>
      )}
      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          className={`${baseClasses} ${
            sizeClasses[selectSize]
          } ${error ? 'border-red-500 focus:border-red-500' : ''} 
          pr-8 ${className ?? ''}`}
          disabled={disabled}
          {...props}
        >
          {children}
        </select>
        
        {/* Custom dropdown arrow */}
        <div className="absolute inset-y-0 right-0 pr-2 flex items-center pointer-events-none">
          <svg
            className={`w-4 h-4 ${error ? 'text-red-500' : 'text-gray-600 dark:text-gray-400'}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
      {error && (
        <p className="mt-1 text-xs text-red-500">{error}</p>
      )}
      {!error && helperText && (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{helperText}</p>
      )}
    </div>
  );
});

Select.displayName = 'Select';
