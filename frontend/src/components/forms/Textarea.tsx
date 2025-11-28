import { forwardRef } from 'react';
import type { TextareaHTMLAttributes } from 'react';

/**
 * Available textarea size variants.
 * @type {('sm' | 'md' | 'lg')}
 */
type TextareaSize = 'sm' | 'md' | 'lg';

/**
 * Props for the Textarea component.
 * 
 * @interface TextareaProps
 * @property {string} [label] - Label text displayed above textarea
 * @property {string} [error] - Error message (shows red styling)
 * @property {string} [helperText] - Helper text displayed below textarea (when no error)
 * @property {TextareaSize} [textareaSize='md'] - Textarea size variant
 */
interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
  textareaSize?: TextareaSize;
}

const baseClasses =
  'block w-full bg-transparent border-0 border-b-2 border-r-2 border-gray-600 dark:border-gray-400 focus:outline-none focus:border-purple-500 dark:focus:border-purple-400 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 transition-all duration-200 ease-in-out resize-y accent-purple-500';

const sizeClasses = {
  sm: 'px-2 py-1 text-sm',
  md: 'px-2 py-2 text-base',
  lg: 'px-2 py-3 text-lg',
};

/**
 * Flexible textarea component with validation and error handling.
 * Matches the styling of the Input component for consistency.
 * 
 * Features:
 * - Floating label that moves when focused or has value
 * - Error state with red styling
 * - Three size variants: sm, md, lg
 * - Disabled state support
 * - Full HTML textarea attributes support
 * - Ref forwarding for parent control
 * - Transparent background with bottom and right borders
 * - Resizable vertically
 * 
 * @component
 * @example
 * // Basic textarea
 * <Textarea 
 *   label="Description"
 *   rows={3}
 *   placeholder="Enter description"
 * />
 * 
 * @example
 * // With error
 * <Textarea 
 *   label="Notes"
 *   error="This field is required"
 *   rows={4}
 * />
 * 
 * @param {TextareaProps} props - Component props
 * @param {React.Ref<HTMLTextAreaElement>} ref - Forwarded ref to textarea element
 * @returns {JSX.Element} Styled textarea field with label and validation
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(({
  label,
  error,
  helperText,
  disabled,
  className,
  textareaSize = 'md',
  rows = 3,
  ...props
}, ref) => {
  const textareaId = props.id || `textarea-${Math.random().toString(36).substr(2, 9)}`;

  return (
    <div className="mb-6">
      {label && (
        <label 
          htmlFor={textareaId}
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
        <textarea
          ref={ref}
          id={textareaId}
          rows={rows}
          className={`${baseClasses} ${
            sizeClasses[textareaSize]
          } ${error ? 'border-red-500 focus:border-red-500' : ''} ${className ?? ''}`}
          disabled={disabled}
          {...props}
        />
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

Textarea.displayName = 'Textarea';
