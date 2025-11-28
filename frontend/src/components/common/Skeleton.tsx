import React from 'react';

/**
 * Props for skeleton components.
 * 
 * @interface SkeletonProps
 * @property {string} [className] - Additional CSS classes for customization
 * @property {number} [lines=3] - Number of skeleton lines to render (for SkeletonText)
 */
interface SkeletonProps {
  className?: string;
  lines?: number; // Number of skeleton lines to render
}

const baseClasses = "animate-pulse rounded bg-gray-200 dark:bg-gray-700";

/**
 * Individual skeleton item for a single loading placeholder.
 * 
 * Base building block for other skeleton components.
 * Animated pulse effect with rounded corners and theme-aware colors.
 * 
 * @component
 * @example
 * // Default skeleton line
 * <SkeletonItem />
 * 
 * @example
 * // Custom height and width
 * <SkeletonItem className="h-8 w-1/2" />
 * 
 * @param {{ className?: string }} props - Component props
 * @returns {JSX.Element} Animated skeleton placeholder
 */
export const SkeletonItem: React.FC<{ className?: string }> = ({ className }) => (
  <div className={`${baseClasses} ${className || 'h-4 w-full'}`}></div>
);

/**
 * Skeleton component for text block loading states.
 * 
 * Renders multiple lines with last line at 75% width for natural text appearance.
 * Useful for loading paragraphs or multi-line content.
 * 
 * @component
 * @example
 * // Basic text skeleton (3 lines)
 * <SkeletonText />
 * 
 * @example
 * // Custom number of lines
 * <SkeletonText lines={5} />
 * 
 * @example
 * // With custom spacing
 * <SkeletonText lines={4} className="space-y-4" />
 * 
 * @param {SkeletonProps} props - Component props
 * @returns {JSX.Element} Multi-line text skeleton
 */
export const SkeletonText: React.FC<SkeletonProps> = ({ 
  className = "space-y-2",
  lines = 3 
}) => {
  return (
    <div className={className}>
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonItem key={i} className={i === lines - 1 ? 'w-3/4' : 'w-full'} />
      ))}
    </div>
  );
};

/**
 * Skeleton component for card loading states.
 * 
 * Mimics Card component structure with header, body, and footer sections.
 * Each section contains appropriate skeleton items for realistic loading state.
 * 
 * @component
 * @example
 * // Basic card skeleton
 * <SkeletonCard />
 * 
 * @example
 * // With custom width
 * <SkeletonCard className="max-w-md" />
 * 
 * @param {{ className?: string }} props - Component props
 * @returns {JSX.Element} Card-shaped skeleton with header, body, and footer
 */
export const SkeletonCard: React.FC<{ className?: string }> = ({ className }) => (
  <div className={`bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden ${className}`}>
    {/* Card Header Skeleton */}
    <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
      <SkeletonItem className="h-6 w-1/3 mb-2" />
      <SkeletonItem className="h-4 w-full" />
    </div>
    {/* Card Body Skeleton */}
    <div className="px-6 py-4">
      <SkeletonText lines={3} />
    </div>
    {/* Card Footer Skeleton (optional) */}
    <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30">
        <div className="flex space-x-2">
            <SkeletonItem className="h-8 w-1/4" />
            <SkeletonItem className="h-8 w-1/4" />
        </div>
    </div>
  </div>
);

/**
 * Skeleton component for a list of card loading states.
 * 
 * Renders multiple SkeletonCard components with consistent spacing.
 * Useful for loading states of data grids, dashboards, or lists.
 * 
 * @component
 * @example
 * // Basic list skeleton (3 cards)
 * <SkeletonCardList />
 * 
 * @example
 * // Custom number of cards
 * <SkeletonCardList count={5} />
 * 
 * @example
 * // With custom spacing
 * <SkeletonCardList count={4} className="space-y-8" />
 * 
 * @param {{ count?: number, className?: string }} props - Component props
 * @returns {JSX.Element} List of card skeletons
 */
export const SkeletonCardList: React.FC<{ count?: number, className?: string }> = ({ 
  count = 3,
  className = "space-y-6"
}) => {
  return (
    <div className={className}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
};
