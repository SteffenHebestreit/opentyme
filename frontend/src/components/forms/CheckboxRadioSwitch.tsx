import { forwardRef, useState } from 'react';
import type { InputHTMLAttributes } from 'react';

/**
 * Props for the Checkbox component.
 * 
 * @interface CheckboxProps
 * @extends {Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>}
 * @property {string} label - Label text for checkbox
 * @property {string} [description] - Optional description below label
 * @property {string} [error] - Error message
 */
interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  description?: string;
  error?: string;
}

/**
 * Checkbox component with label and description.
 * 
 * Features:
 * - Custom styled checkbox
 * - Label and optional description
 * - Error state support
 * - Disabled state
 * - Focus ring
 * - Dark mode support
 * - Accessible (proper label association)
 * 
 * @component
 * @example
 * // Basic checkbox
 * <Checkbox label="I agree to terms" />
 * 
 * @example
 * // With description
 * <Checkbox 
 *   label="Enable notifications"
 *   description="Receive updates about your account"
 * />
 * 
 * @example
 * // With error
 * <Checkbox 
 *   label="Accept terms"
 *   error="You must accept the terms to continue"
 * />
 * 
 * @param {CheckboxProps} props - Component props
 * @param {React.Ref<HTMLInputElement>} ref - Forwarded ref
 * @returns {JSX.Element} Checkbox element
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(({
  label,
  description,
  error,
  className = '',
  disabled,
  ...props
}, ref) => {
  const checkboxId = props.id || `checkbox-${Math.random().toString(36).substr(2, 9)}`;

  return (
    <div className="mb-4">
      <div className="flex items-start">
        <div className="flex items-center h-5">
          <input
            ref={ref}
            id={checkboxId}
            type="checkbox"
            className={`w-4 h-4 rounded border-gray-300 dark:border-gray-600 
              text-purple-600 focus:ring-2 focus:ring-purple-500 focus:ring-offset-0
              dark:bg-gray-800 dark:checked:bg-purple-600 dark:checked:border-purple-600
              disabled:opacity-50 disabled:cursor-not-allowed
              ${error ? 'border-red-500' : ''}
              ${className}`}
            disabled={disabled}
            {...props}
          />
        </div>
        <div className="ml-3">
          <label
            htmlFor={checkboxId}
            className={`text-sm font-medium ${
              error
                ? 'text-red-600 dark:text-red-400'
                : 'text-gray-900 dark:text-gray-100'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            {label}
          </label>
          {description && (
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              {description}
            </p>
          )}
        </div>
      </div>
      {error && (
        <p className="mt-1 ml-7 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
});

Checkbox.displayName = 'Checkbox';

/**
 * Props for the Radio component.
 * 
 * @interface RadioProps
 * @extends {Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>}
 * @property {string} label - Label text for radio
 * @property {string} [description] - Optional description below label
 */
interface RadioProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  description?: string;
}

/**
 * Radio button component with label and description.
 * 
 * Features:
 * - Custom styled radio button
 * - Label and optional description
 * - Disabled state
 * - Focus ring
 * - Dark mode support
 * - Accessible (proper label association)
 * 
 * @component
 * @example
 * // Basic radio
 * <Radio name="plan" value="free" label="Free Plan" />
 * 
 * @example
 * // Radio group with descriptions
 * <div>
 *   <Radio 
 *     name="plan" 
 *     value="basic" 
 *     label="Basic" 
 *     description="$9/month"
 *   />
 *   <Radio 
 *     name="plan" 
 *     value="pro" 
 *     label="Pro" 
 *     description="$29/month"
 *   />
 * </div>
 * 
 * @param {RadioProps} props - Component props
 * @param {React.Ref<HTMLInputElement>} ref - Forwarded ref
 * @returns {JSX.Element} Radio element
 */
export const Radio = forwardRef<HTMLInputElement, RadioProps>(({
  label,
  description,
  className = '',
  disabled,
  ...props
}, ref) => {
  const radioId = props.id || `radio-${Math.random().toString(36).substr(2, 9)}`;

  return (
    <div className="mb-3">
      <div className="flex items-start">
        <div className="flex items-center h-5">
          <input
            ref={ref}
            id={radioId}
            type="radio"
            className={`w-4 h-4 border-gray-300 dark:border-gray-600 
              text-purple-600 focus:ring-2 focus:ring-purple-500 focus:ring-offset-0
              dark:bg-gray-800 dark:checked:bg-purple-600 dark:checked:border-purple-600
              disabled:opacity-50 disabled:cursor-not-allowed
              ${className}`}
            disabled={disabled}
            {...props}
          />
        </div>
        <div className="ml-3">
          <label
            htmlFor={radioId}
            className={`text-sm font-medium text-gray-900 dark:text-gray-100 ${
              disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
            }`}
          >
            {label}
          </label>
          {description && (
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              {description}
            </p>
          )}
        </div>
      </div>
    </div>
  );
});

Radio.displayName = 'Radio';

/**
 * Props for the Switch component.
 * 
 * @interface SwitchProps
 * @extends {Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>}
 * @property {string} label - Label text for switch
 * @property {string} [description] - Optional description below label
 */
interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  description?: string;
}

/**
 * Toggle switch component.
 * 
 * Features:
 * - Custom styled toggle switch
 * - Label and optional description
 * - Disabled state
 * - Smooth animation
 * - Dark mode support
 * - Accessible
 * 
 * @component
 * @example
 * // Basic switch
 * <Switch label="Enable dark mode" />
 * 
 * @example
 * // With description
 * <Switch 
 *   label="Email notifications"
 *   description="Receive updates via email"
 * />
 * 
 * @param {SwitchProps} props - Component props
 * @param {React.Ref<HTMLInputElement>} ref - Forwarded ref
 * @returns {JSX.Element} Switch element
 */
export const Switch = forwardRef<HTMLInputElement, SwitchProps>(({
  label,
  description,
  className = '',
  disabled,
  checked,
  ...props
}, ref) => {
  const [isChecked, setIsChecked] = useState(checked || false);
  const switchId = props.id || `switch-${Math.random().toString(36).substr(2, 9)}`;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsChecked(e.target.checked);
    if (props.onChange) {
      props.onChange(e);
    }
  };

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <label
            htmlFor={switchId}
            className={`text-sm font-medium text-gray-900 dark:text-gray-100 ${
              disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
            }`}
          >
            {label}
          </label>
          {description && (
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              {description}
            </p>
          )}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={isChecked}
          onClick={() => !disabled && setIsChecked(!isChecked)}
          disabled={disabled}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent 
            transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2
            ${isChecked ? 'bg-purple-600' : 'bg-gray-200 dark:bg-gray-700'}
            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
            ${className}`}
        >
          <input
            ref={ref}
            id={switchId}
            type="checkbox"
            className="sr-only"
            checked={isChecked}
            onChange={handleChange}
            disabled={disabled}
            {...props}
          />
          <span
            aria-hidden="true"
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 
              transition duration-200 ease-in-out
              ${isChecked ? 'translate-x-5' : 'translate-x-0'}`}
          />
        </button>
      </div>
    </div>
  );
});

Switch.displayName = 'Switch';
