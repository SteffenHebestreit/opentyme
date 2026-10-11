import React from 'react';
import { cn } from '../../lib/cn';

interface SkeletonProps {
  className?: string;
  lines?: number; // Number of skeleton lines to render
}

/** A shimmering placeholder block. Size it with className (defaults to one text line). */
export const SkeletonItem: React.FC<{ className?: string }> = ({ className }) => (
  <div className={cn('skeleton', className || 'h-4 w-full')} aria-hidden="true" />
);

export const SkeletonText: React.FC<SkeletonProps> = ({
  className = 'space-y-2',
  lines = 3,
}) => {
  return (
    <div className={className}>
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonItem key={i} className={cn('h-4', i === lines - 1 ? 'w-3/4' : 'w-full')} />
      ))}
    </div>
  );
};

export const SkeletonCard: React.FC<{ className?: string }> = ({ className }) => (
  <div className={cn('surface overflow-hidden', className)} aria-busy="true">
    <div className="border-b border-gray-100 px-6 py-4 dark:border-gray-800">
      <SkeletonItem className="mb-2 h-5 w-1/3" />
      <SkeletonItem className="h-4 w-2/3" />
    </div>
    <div className="px-6 py-4">
      <SkeletonText lines={3} />
    </div>
    <div className="border-t border-gray-100 bg-gray-50/60 px-6 py-4 dark:border-gray-800 dark:bg-gray-900/40">
      <div className="flex gap-2">
        <SkeletonItem className="h-8 w-24" />
        <SkeletonItem className="h-8 w-24" />
      </div>
    </div>
  </div>
);

export const SkeletonCardList: React.FC<{ count?: number, className?: string }> = ({
  count = 3,
  className = 'space-y-6',
}) => {
  return (
    <div className={className}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
};
