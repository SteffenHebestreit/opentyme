import React from 'react';

/**
 * Available alert severity types.
 * @type {('info' | 'success' | 'warning' | 'error')}
 */
export type AlertType = 'info' | 'success' | 'warning' | 'error';

/**
 * Props for the Alert component.
 * 
 * @interface AlertProps
 * @property {string} message - Main alert message text
 * @property {AlertType} [type='info'] - Alert severity type (default: 'info')
 * @property {string} [title] - Optional alert title/heading
 * @property {() => void} [onClose] - Optional callback for dismissible alerts
 */
interface AlertProps {
  message: string;
  type?: AlertType; // Default is 'info'
  title?: string;
  onClose?: () => void; // For dismissible alerts
}

const alertStyles: Record<AlertType, string> = {
  info: "light:bg-blue-50 dark:bg-blue-900/20 light:text-blue-800 dark:text-blue-200 border-l-4 border-blue-500",
  success: "light:bg-green-50 dark:bg-green-900/20 light:text-green-800 dark:text-green-200 border-l-4 border-green-500",
  warning: "light:bg-yellow-50 dark:bg-yellow-900/20 light:text-yellow-800 dark:text-yellow-200 border-l-4 border-yellow-500",
  error: "light:bg-red-50 dark:bg-red-900/20 light:text-red-800 dark:text-red-200 border-l-4 border-red-500"
};

const iconMap: Record<AlertType, string> = {
  info: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  success: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z", // Check circle
  warning: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
  error: "M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
};

/**
 * Alert component for displaying notifications, success messages, warnings, and errors.
 * 
 * Features:
 * - Four severity types: info, success, warning, error
 * - Color-coded borders and icons
 * - Optional title and dismissible functionality
 * - Dark mode support
 * - Full ARIA accessibility (role="alert", sr-only text)
 * - Responsive icon sizing
 * 
 * @component
 * @example
 * // Basic info alert
 * <Alert message="Operation completed" />
 * 
 * @example
 * // Success alert with title
 * <Alert 
 *   type="success"
 *   title="Success!"
 *   message="Your data was saved successfully"
 * />
 * 
 * @example
 * // Dismissible error alert
 * <Alert 
 *   type="error"
 *   message="Failed to load data"
 *   onClose={() => setShowAlert(false)}
 * />
 * 
 * @example
 * // Warning alert
 * <Alert 
 *   type="warning"
 *   title="Warning"
 *   message="This action cannot be undone"
 * />
 * 
 * @param {AlertProps} props - Component props
 * @returns {JSX.Element} Alert notification component
 */
export const Alert: React.FC<AlertProps> = ({ 
  message, 
  type = 'info', 
  title,
  onClose
}) => {
  return (
    <div className={`p-4 rounded-md ${alertStyles[type]} flex items-start`} role="alert">
      {type !== 'success' && ( // For success, the check icon is part of the message style in some designs. Here we keep it consistent.
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          className={`h-5 w-5 flex-shrink-0 mt-0.5 ${type === 'error' ? 'text-red-500' : type === 'warning' ? 'text-yellow-500' : type === 'info' ? 'text-blue-500' : ''}`} 
          viewBox="0 0 20 20" 
          fill="currentColor"
        >
          <path fillRule="evenodd" d={iconMap[type]} clipRule="evenodd" />
        </svg>
      )}
      <div className="ml-3 flex-1">
        {title && (
          <h4 className={`text-sm font-medium ${type === 'error' ? 'text-red-800 dark:text-red-200' : type === 'warning' ? 'text-yellow-800 dark:text-yellow-200' : type === 'info' ? 'text-blue-800 dark:text-blue-200' : 'text-green-800 dark:text-green-200'}`}>
            {title}
          </h4>
        )}
        <div className={`text-sm ${type === 'error' ? 'light:text-red-700 dark:text-red-300' : type === 'warning' ? 'light:text-yellow-700 dark:text-yellow-300' : type === 'info' ? 'light:text-blue-700 dark:text-blue-300' : 'light:text-green-700 dark:text-green-300'}`}>
          {message}
        </div>
      </div>
      {onClose && (
        <button 
          type="button" 
          className={`ml-auto -mx-1.5 -my-1.5 rounded-lg p-1.5 inline-flex h-8 w-8 ${type === 'error' ? 'light:bg-red-50 dark:bg-red-900/30 text-red-500 hover:bg-red-200 dark:hover:bg-red-800' : type === 'warning' ? 'light:bg-yellow-50 dark:bg-yellow-900/30 text-yellow-500 hover:bg-yellow-200 dark:hover:bg-yellow-800' : type === 'info' ? 'light:bg-blue-50 dark:bg-blue-900/30 text-blue-500 hover:bg-blue-200 dark:hover:bg-blue-800' : 'light:bg-green-50 dark:bg-green-900/30 text-green-500 hover:bg-green-200 dark:hover:bg-green-800'} focus:ring-2 focus:ring-offset-2 ${type === 'error' ? 'focus:ring-red-500' : type === 'warning' ? 'focus:ring-yellow-500' : type === 'info' ? 'focus:ring-blue-500' : 'focus:ring-green-500'} transition-colors`}
          aria-label="Dismiss"
          onClick={onClose}
        >
          <span className="sr-only">Dismiss</span>
          <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      )}
    </div>
  );
};

/**
 * Convenience component for error alerts.
 * Pre-configured Alert with type="error".
 * 
 * @component
 * @example
 * <ErrorAlert message="Failed to save data" />
 * 
 * @param {Omit<AlertProps, 'type'>} props - Alert props without type
 * @returns {JSX.Element} Error alert component
 */
export const ErrorAlert: React.FC<Omit<AlertProps, 'type'>> = (props) => <Alert type="error" {...props} />;

/**
 * Convenience component for success alerts.
 * Pre-configured Alert with type="success".
 * 
 * @component
 * @example
 * <SuccessAlert message="Data saved successfully" />
 * 
 * @param {Omit<AlertProps, 'type'>} props - Alert props without type
 * @returns {JSX.Element} Success alert component
 */
export const SuccessAlert: React.FC<Omit<AlertProps, 'type'>> = (props) => <Alert type="success" {...props} />;
