/**
 * @fileoverview Class helpers shared by the client and project screens, so
 * their row actions, quick picks and checkboxes look the same.
 *
 * @module components/business/projects/uiClasses
 */

import { cn } from '@/lib/cn';

/** Parent of several `FormSection`s: draws a divider between them. */
export const formSectionsClass = 'divide-y divide-gray-100 dark:divide-gray-800';

/** Checkbox look used across these forms. */
export const checkboxClass =
  'h-4 w-4 shrink-0 rounded border-gray-300 text-brand-600 accent-brand-600 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-900';

/** Square, icon-only button for row actions. Always pair with an `aria-label`. */
export function iconButtonClass(tone: 'default' | 'danger' = 'default', size: 'sm' | 'md' = 'md') {
  return cn(
    'inline-flex shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:pointer-events-none disabled:opacity-50',
    'dark:text-gray-400',
    size === 'sm' ? 'h-7 w-7' : 'h-8 w-8',
    tone === 'danger'
      ? 'hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400'
      : 'hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-white/5 dark:hover:text-white'
  );
}

/** Pill-shaped quick pick (e.g. "From today", "+12 months"). */
export function chipClass(active: boolean) {
  return cn(
    'rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition-colors',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
    active
      ? 'bg-brand-50 text-brand-700 ring-brand-600/20 dark:bg-brand-500/10 dark:text-brand-300 dark:ring-brand-400/30'
      : 'bg-white text-gray-600 ring-gray-200 hover:bg-gray-50 hover:text-gray-900 dark:bg-transparent dark:text-gray-400 dark:ring-gray-700 dark:hover:bg-white/5 dark:hover:text-gray-200'
  );
}
