import React, { ReactNode, FormEvent } from 'react';

/**
 * Props for the Form component.
 * 
 * @interface FormProps
 * @property {ReactNode} children - Form content and inputs
 * @property {(e: FormEvent<HTMLFormElement>) => void} [onSubmit] - Form submission handler
 * @property {string} [title] - Optional form title
 * @property {string} [description] - Optional form description
 * @property {ReactNode} [actions] - Action buttons (submit, cancel, etc.)
 * @property {boolean} [loading] - Shows loading state on submit button
 * @property {string} [className] - Additional CSS classes
 */
interface FormProps {
  children: ReactNode;
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void;
  title?: string;
  description?: string;
  actions?: ReactNode;
  loading?: boolean;
  className?: string;
}

/**
 * Form wrapper component with consistent styling and structure.
 * 
 * Features:
 * - Optional title and description
 * - Automatic form submission handling
 * - Action buttons area
 * - Loading state
 * - Consistent padding and spacing
 * - Dark mode support
 * - Accessible form structure
 * 
 * @component
 * @example
 * // Basic form
 * <Form onSubmit={handleSubmit}>
 *   <Input label="Name" />
 *   <Input label="Email" type="email" />
 * </Form>
 * 
 * @example
 * // With title and actions
 * <Form 
 *   title="Create Account"
 *   description="Fill in your details below"
 *   onSubmit={handleSubmit}
 *   actions={
 *     <>
 *       <Button variant="outline" onClick={handleCancel}>Cancel</Button>
 *       <Button type="submit">Create</Button>
 *     </>
 *   }
 * >
 *   <Input label="Username" />
 *   <Input label="Password" type="password" />
 * </Form>
 * 
 * @example
 * // With loading state
 * <Form 
 *   onSubmit={handleSubmit}
 *   loading={isSubmitting}
 *   actions={
 *     <Button type="submit" isLoading={isSubmitting}>
 *       Submit
 *     </Button>
 *   }
 * >
 *   <Input label="Feedback" />
 * </Form>
 * 
 * @param {FormProps} props - Component props
 * @returns {JSX.Element} Form container
 */
export const Form: React.FC<FormProps> = ({
  children,
  onSubmit,
  title,
  description,
  actions,
  loading,
  className = '',
}) => {
  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (onSubmit && !loading) {
      onSubmit(e);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={`space-y-6 ${className}`}>
      {(title || description) && (
        <div className="mb-6">
          {title && (
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              {title}
            </h2>
          )}
          {description && (
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              {description}
            </p>
          )}
        </div>
      )}
      
      <div className="space-y-6">
        {children}
      </div>

      {actions && (
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
          {actions}
        </div>
      )}
    </form>
  );
};
