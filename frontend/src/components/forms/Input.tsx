import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { fieldClasses, fieldErrorClass, fieldHelperClass, fieldLabelClass, fieldWrapperClass } from './fieldStyles';

/**
 * Available input size variants.
 * @type {('sm' | 'md' | 'lg')}
 */
type InputSize = 'sm' | 'md' | 'lg';

/**
 * Props for the Input component.
 * 
 * @interface InputProps
 * @extends {Omit<InputHTMLAttributes<HTMLInputElement>, 'size'>}
 * @property {string} [label] - Label text displayed above input
 * @property {string} [error] - Error message (shows red styling and error icon)
 * @property {string} [helperText] - Helper text displayed below input (when no error)
 * @property {ReactNode} [leftIcon] - Icon element displayed on left side of input
 * @property {ReactNode} [rightIcon] - Icon element displayed on right side of input
 * @property {InputSize} [inputSize='md'] - Input size variant
 */
interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  inputSize?: InputSize;
}



/**
 * Flexible form input component with validation, icons, and error handling.
 * 
 * Features:
 * - Optional label and helper text
 * - Error state with red styling and error icon
 * - Left and right icon support
 * - Three size variants: sm, md, lg
 * - Disabled state support
 * - Full HTML input attributes support
 * - Ref forwarding for parent control
 * - Focus ring with indigo color (or red on error)
 * - Responsive text sizing
 * 
 * Error state automatically displays error icon and message, hiding helper text.
 * Icons are positioned with proper padding adjustment.
 * 
 * @component
 * @example
 * // Basic input with label
 * <Input 
 *   label="Email"
 *   type="email"
 *   placeholder="you@example.com"
 * />
 * 
 * @example
 * // Input with error
 * <Input 
 *   label="Password"
 *   type="password"
 *   error="Password must be at least 8 characters"
 * />
 * 
 * @example
 * // Input with icons
 * <Input 
 *   label="Search"
 *   leftIcon={<SearchIcon />}
 *   placeholder="Search projects..."
 * />
 * 
 * @example
 * // Input with helper text
 * <Input 
 *   label="Username"
 *   helperText="Choose a unique username"
 *   inputSize="lg"
 * />
 * 
 * @example
 * // Using ref for focus control
 * const inputRef = useRef<HTMLInputElement>(null);
 * <Input ref={inputRef} label="Name" />
 * 
 * @param {InputProps} props - Component props
 * @param {React.Ref<HTMLInputElement>} ref - Forwarded ref to input element
 * @returns {JSX.Element} Styled input field with label and validation
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(({
  type = 'text',
  label,
  error,
  helperText,
  leftIcon,
  rightIcon,
  disabled,
  className,
  inputSize = 'md',
  ...props
}, ref) => {
  const generatedId = useId();
  const inputId = props.id || generatedId;

  return (
    <div className={fieldWrapperClass}>
      {label && (
        <label 
          htmlFor={inputId}
          className={fieldLabelClass(!!error)}
        >
          {label}
        </label>
      )}
      <div className="relative">
        {leftIcon && (
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <span className="text-sm text-gray-400 dark:text-gray-500">{leftIcon}</span>
          </div>
        )}
        <input
          ref={ref}
          id={inputId}
          type={type}
          className={cn(
            fieldClasses({ size: inputSize, error: !!error }),
            type === 'color' && 'cursor-pointer p-1',
            leftIcon && 'pl-9',
            (rightIcon || error) && 'pr-10',
            className
          )}
          aria-invalid={error ? true : undefined}
          disabled={disabled}
          {...props}
        />
        {error && (
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
            <svg
              className="h-4 w-4 text-red-500"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
          </div>
        )}
        {!error && rightIcon && (
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
            <span className="text-sm text-gray-400 dark:text-gray-500">{rightIcon}</span>
          </div>
        )}
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

Input.displayName = 'Input';

/**
 * Specialized text input component.
 * Pre-configured Input with type="text".
 * 
 * @component
 * @example
 * <TextInput label="Full Name" placeholder="John Doe" />
 * 
 * @param {Omit<InputProps, 'type'>} props - Input props without type
 * @param {React.Ref<HTMLInputElement>} ref - Forwarded ref to input element
 * @returns {JSX.Element} Text input field
 */
export const TextInput = forwardRef<HTMLInputElement, Omit<InputProps, 'type'>>((props, ref) => (
  <Input ref={ref} type="text" {...props} />
));

TextInput.displayName = 'TextInput';

/**
 * Specialized email input component.
 * Pre-configured Input with type="email" for email validation.
 * 
 * @component
 * @example
 * <EmailInput label="Email Address" placeholder="you@example.com" />
 * 
 * @param {Omit<InputProps, 'type'>} props - Input props without type
 * @param {React.Ref<HTMLInputElement>} ref - Forwarded ref to input element
 * @returns {JSX.Element} Email input field with browser validation
 */
export const EmailInput = forwardRef<HTMLInputElement, Omit<InputProps, 'type'>>((props, ref) => (
  <Input ref={ref} type="email" {...props} />
));

EmailInput.displayName = 'EmailInput';

/**
 * Specialized password input component.
 * Pre-configured Input with type="password" for masked input.
 * 
 * @component
 * @example
 * <PasswordInput label="Password" error={passwordError} />
 * 
 * @param {Omit<InputProps, 'type'>} props - Input props without type
 * @param {React.Ref<HTMLInputElement>} ref - Forwarded ref to input element
 * @returns {JSX.Element} Password input field with masked characters
 */
export const PasswordInput = forwardRef<HTMLInputElement, Omit<InputProps, 'type'>>((props, ref) => (
  <Input ref={ref} type="password" {...props} />
));

PasswordInput.displayName = 'PasswordInput';
