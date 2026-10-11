import React from 'react';
import { cn } from '../../lib/cn';

export type SpinnerSize = 'sm' | 'md' | 'lg' | 'xl';

/**
 * Props for the LoadingSpinner component.
 *
 * @property {SpinnerSize} [size='md'] - Spinner size
 * @property {string} [color] - Ignored; the spinner always uses the brand colour (kept for API compatibility)
 * @property {boolean} [fullScreen] - Centre in a tall area
 * @property {string} [text] - Caption under the spinner
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
  md: 'h-6 w-6 border-2',
  lg: 'h-10 w-10 border-[3px]',
  xl: 'h-14 w-14 border-[3px]',
};

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  className = '',
  fullScreen = false,
  text,
}) => {
  const spinner = (
    <div className={cn('flex flex-col items-center', fullScreen && 'min-h-[200px] justify-center')}>
      <div
        className={cn(
          'animate-spin rounded-full border-brand-500/25 border-t-brand-600 dark:border-brand-400/20 dark:border-t-brand-400',
          sizeClasses[size],
          className
        )}
        role="status"
        aria-label="Loading"
      >
        <span className="sr-only">Loading...</span>
      </div>
      {text && <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">{text}</p>}
    </div>
  );

  if (fullScreen) {
    return <div className="flex min-h-[50vh] items-center justify-center">{spinner}</div>;
  }

  return spinner;
};
