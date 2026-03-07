import React, { ReactNode } from 'react';

/**
 * Props for the FormGroup component.
 * 
 * @interface FormGroupProps
 * @property {ReactNode} children - Form inputs and elements to group
 * @property {string} [label] - Optional group label/legend
 * @property {string} [description] - Optional description text
 * @property {string} [error] - Group-level error message
 * @property {boolean} [required] - Shows required indicator on label
 * @property {string} [className] - Additional CSS classes
 */
interface FormGroupProps {
  children: ReactNode;
  label?: string;
  description?: string;
  error?: string;
  required?: boolean;
  className?: string;
}

/**
 * FormGroup component for grouping related form fields.
 * 
 * Features:
 * - Groups related form inputs
 * - Optional label with required indicator
 * - Optional description text
 * - Group-level error messages
 * - Consistent spacing
 * - Dark mode support
 * 
 * @component
 * @example
 * // Basic form group
 * <FormGroup label="Personal Information">
 *   <Input label="First Name" />
 *   <Input label="Last Name" />
 * </FormGroup>
 * 
 * @example
 * // With description and required
 * <FormGroup 
 *   label="Contact Details" 
 *   description="We'll use this to reach you"
 *   required
 * >
 *   <Input label="Email" type="email" />
 *   <Input label="Phone" type="tel" />
 * </FormGroup>
 * 
 * @example
 * // With error
 * <FormGroup 
 *   label="Address"
 *   error="Please fill out all address fields"
 * >
 *   <Input label="Street" />
 *   <Input label="City" />
 * </FormGroup>
 * 
 * @param {FormGroupProps} props - Component props
 * @returns {JSX.Element} Form group container
 */
export const FormGroup: React.FC<FormGroupProps> = ({
  children,
  label,
  description,
  error,
  required,
  className = '',
}) => {
  return (
    <div className={`mb-6 ${className}`}>
      {label && (
        <div className="mb-4">
          <legend className="text-base font-semibold text-gray-900 dark:text-white">
            {label}
            {required && <span className="ml-1 text-red-500">*</span>}
          </legend>
          {description && (
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              {description}
            </p>
          )}
        </div>
      )}
      <div className="space-y-4">
        {children}
      </div>
      {error && (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
};
