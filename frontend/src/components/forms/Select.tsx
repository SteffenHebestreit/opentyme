import { forwardRef, useId } from 'react';
import type { SelectHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';
import { fieldClasses, fieldErrorClass, fieldHelperClass, fieldLabelClass, fieldWrapperClass } from './fieldStyles';

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
  const generatedId = useId();
  const selectId = props.id || generatedId;

  return (
    <div className={fieldWrapperClass}>
      {label && (
        <label 
          htmlFor={selectId}
          className={fieldLabelClass(!!error)}
        >
          {label}
        </label>
      )}
      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          className={cn(fieldClasses({ size: selectSize, error: !!error }), 'cursor-pointer appearance-none pr-9', className)}
          aria-invalid={error ? true : undefined}
          disabled={disabled}
          {...props}
        >
          {children}
        </select>
        
        {/* Custom dropdown arrow */}
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
          <svg
            className={`h-4 w-4 ${error ? 'text-red-500' : 'text-gray-400 dark:text-gray-500'}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
      {error && (
        <p className={fieldErrorClass}>{error}</p>
      )}
      {!error && helperText && (
        <p className={fieldHelperClass}>{helperText}</p>
      )}
    </div>
  );
});

Select.displayName = 'Select';
