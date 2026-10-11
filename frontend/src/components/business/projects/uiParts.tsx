/**
 * @fileoverview Small presentational pieces shared by the client and project
 * screens, so their forms and dialogs look the same:
 *
 * - {@link FormSection}: a titled group of fields inside a form
 * - {@link InlineConfirm}: "really delete?" right where the action was taken
 * - {@link TableSkeleton}: a loading placeholder shaped like the list table
 *
 * Class helpers (icon buttons, chips, checkboxes) live in `./uiClasses`.
 *
 * @module components/business/projects/uiParts
 */

import { FC, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/common/Button';
import { SkeletonItem } from '@/components/common/Skeleton';

/**
 * A titled group of fields. Inside a `formSectionsClass` parent,
 * sections are separated by a hairline divider.
 *
 * Field components bring their own bottom margin, so the section adds only a
 * little padding underneath to keep the spacing above and below a divider even.
 */
export const FormSection: FC<{
  title?: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}> = ({ title, description, children, className }) => (
  <section className={cn('pb-1 pt-5 first:pt-0 last:pb-0', className)}>
    {title || description ? (
      <div className="mb-4">
        {title ? <h3 className="eyebrow">{title}</h3> : null}
        {description ? <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{description}</p> : null}
      </div>
    ) : null}
    {children}
  </section>
);

/**
 * Asks "really delete?" in place, next to the item, instead of a blocking
 * browser dialog. The caller decides the labels (e.g. "Deleting…" while busy).
 */
export const InlineConfirm: FC<{
  message: ReactNode;
  cancelLabel: string;
  confirmLabel: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  className?: string;
}> = ({ message, cancelLabel, confirmLabel, busy, onCancel, onConfirm, className }) => (
  <div
    className={cn(
      'flex animate-fade-in flex-wrap items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5',
      'dark:border-red-500/20 dark:bg-red-500/[0.06]',
      className
    )}
  >
    <AlertTriangle className="h-4 w-4 shrink-0 text-red-500 dark:text-red-400" aria-hidden="true" />
    <p className="min-w-0 flex-1 text-sm text-red-800 dark:text-red-200">{message}</p>
    <div className="flex shrink-0 items-center gap-2">
      <Button type="button" size="sm" variant="secondary" onClick={onCancel}>
        {cancelLabel}
      </Button>
      <Button type="button" size="sm" variant="danger" onClick={onConfirm} disabled={busy}>
        {confirmLabel}
      </Button>
    </div>
  </div>
);

/** Loading placeholder shaped like a list table (header row + a few rows). */
export const TableSkeleton: FC<{ columns: number; rows?: number; label: string }> = ({ columns, rows = 5, label }) => (
  <div
    className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-soft dark:border-gray-800 dark:bg-gray-900 dark:shadow-none"
    role="status"
    aria-label={label}
  >
    <div className="flex gap-6 border-b border-gray-200 bg-gray-50/80 px-5 py-3 dark:border-gray-800 dark:bg-white/[0.02]">
      {Array.from({ length: columns }).map((_, index) => (
        <div key={index} className="flex-1">
          <SkeletonItem className="h-3 w-16" />
        </div>
      ))}
    </div>
    <div className="divide-y divide-gray-100 dark:divide-gray-800/70">
      {Array.from({ length: rows }).map((_, row) => (
        <div key={row} className="flex items-center gap-6 px-5 py-4">
          {Array.from({ length: columns }).map((__, column) => (
            <div key={column} className="flex-1 space-y-2">
              <SkeletonItem className={cn('h-3.5', column === 0 ? 'w-3/4' : 'w-1/2')} />
              {column === 0 ? <SkeletonItem className="h-3 w-1/2" /> : null}
            </div>
          ))}
        </div>
      ))}
    </div>
  </div>
);
