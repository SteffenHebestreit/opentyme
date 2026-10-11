import { forwardRef, useId } from 'react';
import { cn } from '../../lib/cn';
import { fieldClasses, fieldErrorClass, fieldHelperClass, fieldLabelClass, fieldWrapperClass } from './fieldStyles';
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
  const generatedId = useId();
  const textareaId = props.id || generatedId;

  return (
    <div className={fieldWrapperClass}>
      {label && (
        <label 
          htmlFor={textareaId}
          className={fieldLabelClass(!!error)}
        >
          {label}
        </label>
      )}
      <div className="relative">
        <textarea
          ref={ref}
          id={textareaId}
          rows={rows}
          className={cn(fieldClasses({ size: textareaSize, error: !!error, multiline: true }), 'resize-y', className)}
          aria-invalid={error ? true : undefined}
          disabled={disabled}
          {...props}
        />
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

Textarea.displayName = 'Textarea';
