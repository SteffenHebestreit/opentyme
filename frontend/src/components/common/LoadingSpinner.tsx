import React from 'react';

/**
 * Available spinner size variants.
 * @type {('sm' | 'md' | 'lg' | 'xl')}
 */
export type SpinnerSize = 'sm' | 'md' | 'lg' | 'xl';

/**
 * Props for the LoadingSpinner component.
 * 
 * @interface LoadingSpinnerProps
 * @property {SpinnerSize} [size='md'] - Size of the spinner
 * @property {string} [color='purple'] - Color of the spinner (tailwind color name)
 * @property {string} [className] - Additional CSS classes
 * @property {boolean} [fullScreen=false] - Whether to display centered in full screen
 * @property {string} [text] - Optional loading text to display below spinner
 */
interface LoadingSpinnerProps {
  size?: SpinnerSize;
  color?: string;
  className?: string;
  fullScreen?: boolean;
  text?: string;
}

const sizeClasses: Record<SpinnerSize, string> = {
  sm: 'h-4 w-4 border-2',
  md: 'h-8 w-8 border-2',
  lg: 'h-12 w-12 border-b-2',
  xl: 'h-16 w-16 border-b-2',
};

/**
 * Reusable loading spinner component with customizable size and color.
 * 
 * Features:
 * - Four size variants: sm, md, lg, xl
 * - Customizable color (uses Tailwind color classes)
 * - Optional full-screen centered display
 * - Optional loading text below spinner
 * - Smooth animation
 * - ARIA accessibility (aria-label, role="status")
 * 
 * @component
 * @example
 * // Basic spinner
 * <LoadingSpinner />
 * 
 * @example
 * // Large spinner with text
 * <LoadingSpinner size="lg" text="Loading data..." />
 * 
 * @example
 * // Full screen spinner
 * <LoadingSpinner fullScreen text="Please wait..." />
 * 
 * @example
 * // Custom color
 * <LoadingSpinner color="blue" />
 * 
 * @param {LoadingSpinnerProps} props - Component props
 * @returns {JSX.Element} Loading spinner element
 */
export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  color = 'purple',
  className = '',
  fullScreen = false,
  text,
}) => {
  const spinner = (
    <div className={fullScreen ? 'flex flex-col items-center justify-center min-h-[200px]' : 'flex flex-col items-center'}>
      <div
        className={`animate-spin rounded-full border-${color}-500 border-t-transparent ${sizeClasses[size]} ${className}`}
        role="status"
        aria-label="Loading"
      >
        <span className="sr-only">Loading...</span>
      </div>
      {text && (
        <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">{text}</p>
      )}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        {spinner}
      </div>
    );
  }

  return spinner;
};
