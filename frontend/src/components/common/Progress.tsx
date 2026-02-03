import React from 'react';

/**
 * Available progress bar variants.
 * @type {('primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'info')}
 */
type ProgressVariant = 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'info';

/**
 * Available progress bar sizes.
 * @type {('sm' | 'md' | 'lg')}
 */
type ProgressSize = 'sm' | 'md' | 'lg';

/**
 * Props for the ProgressBar component.
 * 
 * @interface ProgressBarProps
 * @property {number} value - Current progress value (0-100)
 * @property {number} [max=100] - Maximum value
 * @property {string} [label] - Optional label text
 * @property {boolean} [showValue] - Show percentage value
 * @property {ProgressVariant} [variant='primary'] - Color variant
 * @property {ProgressSize} [size='md'] - Size variant
 * @property {boolean} [striped] - Show striped pattern
 * @property {boolean} [animated] - Animate stripes
 * @property {string} [className] - Additional CSS classes
 */
interface ProgressBarProps {
  value: number;
  max?: number;
  label?: string;
  showValue?: boolean;
  variant?: ProgressVariant;
  size?: ProgressSize;
  striped?: boolean;
  animated?: boolean;
  className?: string;
}

const variantClasses: Record<ProgressVariant, string> = {
  primary: 'bg-gradient-to-r from-purple-600 to-pink-600',
  secondary: 'bg-gray-600 dark:bg-gray-500',
  success: 'bg-green-600',
  warning: 'bg-yellow-500',
  danger: 'bg-red-600',
  info: 'bg-blue-600',
};

const sizeClasses: Record<ProgressSize, string> = {
  sm: 'h-1',
  md: 'h-2',
  lg: 'h-3',
};

/**
 * Progress bar component for showing completion status.
 * 
 * Features:
 * - Multiple color variants
 * - Three size options
 * - Optional label and value display
 * - Striped and animated options
 * - Dark mode support
 * - Accessible (role="progressbar", aria-valuenow, etc.)
 * 
 * @component
 * @example
 * // Basic progress bar
 * <ProgressBar value={60} />
 * 
 * @example
 * // With label and value
 * <ProgressBar 
 *   value={75} 
 *   label="Upload Progress"
 *   showValue
 *   variant="success"
 * />
 * 
 * @example
 * // Animated striped
 * <ProgressBar 
 *   value={45} 
 *   striped 
 *   animated
 *   variant="primary"
 * />
 * 
 * @param {ProgressBarProps} props - Component props
 * @returns {JSX.Element} Progress bar element
 */
export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  max = 100,
  label,
  showValue = false,
  variant = 'primary',
  size = 'md',
  striped = false,
  animated = false,
  className = '',
}) => {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div className={`w-full ${className}`}>
      {(label || showValue) && (
        <div className="mb-2 flex items-center justify-between">
          {label && (
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {label}
            </span>
          )}
          {showValue && (
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {Math.round(percentage)}%
            </span>
          )}
        </div>
      )}
      <div
        className={`w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700 ${sizeClasses[size]}`}
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
      >
        <div
          className={`h-full transition-all duration-300 ease-out ${variantClasses[variant]} ${
            striped ? 'bg-stripes' : ''
          } ${animated ? 'animate-stripes' : ''}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};

/**
 * Props for the CircularProgress component.
 * 
 * @interface CircularProgressProps
 * @property {number} value - Current progress value (0-100)
 * @property {number} [size=120] - Size in pixels
 * @property {number} [strokeWidth=8] - Stroke width
 * @property {string} [label] - Center label text
 * @property {boolean} [showValue] - Show percentage in center
 * @property {ProgressVariant} [variant='primary'] - Color variant
 * @property {string} [className] - Additional CSS classes
 */
interface CircularProgressProps {
  value: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  showValue?: boolean;
  variant?: ProgressVariant;
  className?: string;
}

const circularVariantClasses: Record<ProgressVariant, string> = {
  primary: 'stroke-purple-600',
  secondary: 'stroke-gray-600',
  success: 'stroke-green-600',
  warning: 'stroke-yellow-500',
  danger: 'stroke-red-600',
  info: 'stroke-blue-600',
};

/**
 * Circular progress component.
 * 
 * Features:
 * - Circular progress indicator
 * - Multiple color variants
 * - Configurable size and stroke width
 * - Optional center label or value
 * - Smooth animation
 * - Dark mode support
 * 
 * @component
 * @example
 * // Basic circular progress
 * <CircularProgress value={75} />
 * 
 * @example
 * // With label
 * <CircularProgress 
 *   value={85} 
 *   label="Completion"
 *   showValue
 *   variant="success"
 *   size={150}
 * />
 * 
 * @param {CircularProgressProps} props - Component props
 * @returns {JSX.Element} Circular progress element
 */
export const CircularProgress: React.FC<CircularProgressProps> = ({
  value,
  size = 120,
  strokeWidth = 8,
  label,
  showValue = false,
  variant = 'primary',
  className = '',
}) => {
  const percentage = Math.min(100, Math.max(0, value));
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          className="stroke-gray-200 dark:stroke-gray-700"
          fill="none"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={`${circularVariantClasses[variant]} transition-all duration-300 ease-out`}
          fill="none"
        />
      </svg>
      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {showValue && (
          <span className="text-2xl font-bold text-gray-900 dark:text-white">
            {Math.round(percentage)}%
          </span>
        )}
        {label && (
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {label}
          </span>
        )}
      </div>
    </div>
  );
};
