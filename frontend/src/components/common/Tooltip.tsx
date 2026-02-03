import React, { useState, useRef, useEffect, ReactNode } from 'react';

/**
 * Available tooltip positions.
 * @type {('top' | 'bottom' | 'left' | 'right')}
 */
type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';

/**
 * Props for the Tooltip component.
 * 
 * @interface TooltipProps
 * @property {ReactNode} children - Trigger element
 * @property {string} content - Tooltip text content
 * @property {TooltipPosition} [position='top'] - Tooltip position
 * @property {number} [delay=200] - Show delay in milliseconds
 * @property {boolean} [disabled] - Disable tooltip
 * @property {string} [className] - Additional CSS classes for trigger
 */
interface TooltipProps {
  children: ReactNode;
  content: string;
  position?: TooltipPosition;
  delay?: number;
  disabled?: boolean;
  className?: string;
}

const positionClasses: Record<TooltipPosition, { tooltip: string; arrow: string }> = {
  top: {
    tooltip: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    arrow: 'top-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-b-transparent border-t-gray-900 dark:border-t-gray-700',
  },
  bottom: {
    tooltip: 'top-full left-1/2 -translate-x-1/2 mt-2',
    arrow: 'bottom-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-t-transparent border-b-gray-900 dark:border-b-gray-700',
  },
  left: {
    tooltip: 'right-full top-1/2 -translate-y-1/2 mr-2',
    arrow: 'left-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-r-transparent border-l-gray-900 dark:border-l-gray-700',
  },
  right: {
    tooltip: 'left-full top-1/2 -translate-y-1/2 ml-2',
    arrow: 'right-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-l-transparent border-r-gray-900 dark:border-r-gray-700',
  },
};

/**
 * Tooltip component for contextual information.
 * 
 * Features:
 * - Four position options (top, bottom, left, right)
 * - Configurable show delay
 * - Automatic arrow positioning
 * - Can be disabled
 * - Dark mode support
 * - Accessible (role="tooltip", aria-describedby)
 * 
 * @component
 * @example
 * // Basic tooltip
 * <Tooltip content="Click to save">
 *   <button>Save</button>
 * </Tooltip>
 * 
 * @example
 * // Bottom positioned with delay
 * <Tooltip content="Delete this item" position="bottom" delay={500}>
 *   <button className="text-red-600">Delete</button>
 * </Tooltip>
 * 
 * @example
 * // Disabled tooltip
 * <Tooltip content="Not available" disabled={!hasPermission}>
 *   <button disabled={!hasPermission}>Restricted Action</button>
 * </Tooltip>
 * 
 * @param {TooltipProps} props - Component props
 * @returns {JSX.Element} Tooltip wrapper element
 */
export const Tooltip: React.FC<TooltipProps> = ({
  children,
  content,
  position = 'top',
  delay = 200,
  disabled = false,
  className = '',
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const tooltipId = useRef(`tooltip-${Math.random().toString(36).substr(2, 9)}`);

  const handleMouseEnter = () => {
    if (disabled) return;
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, delay);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsVisible(false);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const classes = positionClasses[position];

  return (
    <div
      className={`relative inline-block ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleMouseEnter}
      onBlur={handleMouseLeave}
    >
      {/* Trigger element */}
      <div aria-describedby={isVisible ? tooltipId.current : undefined}>
        {children}
      </div>

      {/* Tooltip */}
      {isVisible && !disabled && (
        <div
          id={tooltipId.current}
          role="tooltip"
          className={`pointer-events-none absolute z-50 whitespace-nowrap rounded-lg bg-gray-900 px-3 py-2 text-sm text-white shadow-lg dark:bg-gray-700 ${classes.tooltip}`}
          style={{
            animation: 'tooltipFadeIn 0.15s ease-out',
          }}
        >
          {content}
          {/* Arrow */}
          <div
            className={`absolute h-0 w-0 border-4 ${classes.arrow}`}
            style={{ borderWidth: '4px' }}
          />
        </div>
      )}
    </div>
  );
};
