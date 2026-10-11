import { forwardRef } from 'react';
import { cn } from '../../lib/cn';
import { fieldClasses, fieldErrorClass, fieldHelperClass, fieldLabelClass, fieldWrapperClass } from './fieldStyles';
import type { InputHTMLAttributes } from 'react';

/**
 * Props for the NumberInput component.
 * 
 * @interface NumberInputProps
 * @extends {Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>}
 * @property {string} [label] - Label text
 * @property {string} [error] - Error message
 * @property {string} [helperText] - Helper text
 * @property {string} [prefix] - Prefix text (e.g., "$", "€")
 * @property {string} [suffix] - Suffix text (e.g., "kg", "m")
 * @property {boolean} [showButtons] - Show increment/decrement buttons
 */
interface NumberInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  error?: string;
  helperText?: string;
  prefix?: string;
  suffix?: string;
  showButtons?: boolean;
}

/**
 * Number input component with optional prefix, suffix, and increment/decrement buttons.
 * 
 * Features:
 * - Numeric input validation
 * - Optional prefix and suffix
 * - Optional increment/decrement buttons
 * - Min/max constraints
 * - Step support
 * - Error state
 * - Dark mode support
 * 
 * @component
 * @example
 * // Basic number input
 * <NumberInput label="Age" min={0} max={120} />
 * 
 * @example
 * // With prefix (currency)
 * <NumberInput 
 *   label="Price" 
 *   prefix="$"
 *   step={0.01}
 *   min={0}
 * />
 * 
 * @example
 * // With buttons
 * <NumberInput 
 *   label="Quantity" 
 *   showButtons
 *   min={1}
 *   defaultValue={1}
 * />
 * 
 * @param {NumberInputProps} props - Component props
 * @param {React.Ref<HTMLInputElement>} ref - Forwarded ref
 * @returns {JSX.Element} Number input element
 */
export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(({
  label,
  error,
  helperText,
  prefix,
  suffix,
  showButtons = false,
  disabled,
  className = '',
  value,
  onChange,
  min,
  max,
  step = 1,
  ...props
}, ref) => {
  const inputId = props.id || `number-${Math.random().toString(36).substr(2, 9)}`;

  const handleIncrement = () => {
    if (disabled) return;
    const currentValue = Number(value) || 0;
    const newValue = currentValue + Number(step);
    if (max === undefined || newValue <= Number(max)) {
      const event = {
        target: { value: String(newValue) },
      } as React.ChangeEvent<HTMLInputElement>;
      onChange?.(event);
    }
  };

  const handleDecrement = () => {
    if (disabled) return;
    const currentValue = Number(value) || 0;
    const newValue = currentValue - Number(step);
    if (min === undefined || newValue >= Number(min)) {
      const event = {
        target: { value: String(newValue) },
      } as React.ChangeEvent<HTMLInputElement>;
      onChange?.(event);
    }
  };

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
      <div className="relative flex items-center">
        {prefix && (
          <span className="absolute left-3 text-gray-500 dark:text-gray-400 text-sm pointer-events-none">
            {prefix}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          type="number"
          value={value}
          onChange={onChange}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          className={cn(
            fieldClasses({ error: !!error }),
            'tabular-nums',
            prefix && 'pl-8',
            (suffix || showButtons) && 'pr-20',
            className
          )}
          {...props}
        />
        {suffix && !showButtons && (
          <span className="absolute right-3 text-gray-500 dark:text-gray-400 text-sm pointer-events-none">
            {suffix}
          </span>
        )}
        {showButtons && (
          <div className="absolute right-1 flex">
            <button
              type="button"
              onClick={handleDecrement}
              disabled={disabled || (min !== undefined && Number(value) <= Number(min))}
              className="px-2 py-1 text-gray-600 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 
                disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
              </svg>
            </button>
            <button
              type="button"
              onClick={handleIncrement}
              disabled={disabled || (max !== undefined && Number(value) >= Number(max))}
              className="px-2 py-1 text-gray-600 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 
                disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
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

NumberInput.displayName = 'NumberInput';

/**
 * Props for the DateInput component.
 * 
 * @interface DateInputProps
 * @extends {Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>}
 * @property {string} [label] - Label text
 * @property {string} [error] - Error message
 * @property {string} [helperText] - Helper text
 */
interface DateInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  error?: string;
  helperText?: string;
}

/**
 * Date input component with consistent styling.
 * 
 * @component
 * @example
 * <DateInput label="Birth Date" />
 * 
 * @param {DateInputProps} props - Component props
 * @param {React.Ref<HTMLInputElement>} ref - Forwarded ref
 * @returns {JSX.Element} Date input element
 */
export const DateInput = forwardRef<HTMLInputElement, DateInputProps>(({
  label,
  error,
  helperText,
  disabled,
  className = '',
  ...props
}, ref) => {
  const inputId = props.id || `date-${Math.random().toString(36).substr(2, 9)}`;

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
      <input
        ref={ref}
        id={inputId}
        type="date"
        disabled={disabled}
        className={cn(fieldClasses({ error: !!error }), className)}
        {...props}
      />
      {error && (
        <p className={fieldErrorClass}>{error}</p>
      )}
      {!error && helperText && (
        <p className={fieldHelperClass}>{helperText}</p>
      )}
    </div>
  );
});

DateInput.displayName = 'DateInput';
