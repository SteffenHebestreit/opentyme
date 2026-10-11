import { cn } from '../../lib/cn';

/**
 * Shared look of text-like form fields (input, select, textarea): bordered,
 * rounded, with a soft focus ring. Keeps every field in the app consistent.
 */

export type FieldSize = 'sm' | 'md' | 'lg';

const base =
  'block w-full rounded-lg border bg-white text-gray-900 shadow-sm transition-[border-color,box-shadow,background-color] duration-150 ' +
  'placeholder:text-gray-400 focus:outline-none focus:ring-4 ' +
  'disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 ' +
  'dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500 dark:disabled:bg-gray-900/40 dark:disabled:text-gray-500';

const states = {
  normal:
    'border-gray-300 hover:border-gray-400 focus:border-purple-500 focus:ring-purple-500/15 ' +
    'dark:border-gray-700 dark:hover:border-gray-600 dark:focus:border-purple-400 dark:focus:ring-purple-400/15',
  error:
    'border-red-400 hover:border-red-500 focus:border-red-500 focus:ring-red-500/15 ' +
    'dark:border-red-500/60 dark:focus:border-red-400 dark:focus:ring-red-400/15',
};

/** Single-line fields (input, select). */
export const fieldSizes: Record<FieldSize, string> = {
  sm: 'h-8 px-2.5 text-sm',
  md: 'h-10 px-3 text-sm',
  lg: 'h-11 px-3.5 text-base',
};

/** Multi-line fields (textarea). */
export const areaSizes: Record<FieldSize, string> = {
  sm: 'px-2.5 py-1.5 text-sm',
  md: 'px-3 py-2 text-sm',
  lg: 'px-3.5 py-2.5 text-base',
};

export function fieldClasses({ size = 'md', error = false, multiline = false }: { size?: FieldSize; error?: boolean; multiline?: boolean } = {}) {
  return cn(base, error ? states.error : states.normal, multiline ? areaSizes[size] : fieldSizes[size]);
}

export const fieldWrapperClass = 'mb-4';
export const fieldHelperClass = 'mt-1.5 text-xs text-gray-500 dark:text-gray-400';
export const fieldErrorClass = 'mt-1.5 text-xs font-medium text-red-600 dark:text-red-400';

export function fieldLabelClass(error?: boolean) {
  return cn('mb-1.5 block text-sm font-medium', error ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-300');
}
