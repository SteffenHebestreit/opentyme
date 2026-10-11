/**
 * @fileoverview Small icon-only action used in the rows of finance tables.
 *
 * @module components/business/invoices/RowActionButton
 */

import { FC, MouseEvent, ReactNode } from 'react';
import { cn } from '../../../lib/cn';

interface RowActionButtonProps {
  /** Accessible name, also shown as the native tooltip */
  label: string;
  onClick: () => void;
  children: ReactNode;
  /** Hover tint: neutral, positive (emerald), warning (amber) or danger (red) */
  tone?: 'default' | 'success' | 'warning' | 'danger';
  disabled?: boolean;
}

const toneClasses: Record<NonNullable<RowActionButtonProps['tone']>, string> = {
  default: 'hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-white/5 dark:hover:text-white',
  success: 'hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-300',
  warning: 'hover:bg-amber-50 hover:text-amber-700 dark:hover:bg-amber-500/10 dark:hover:text-amber-300',
  danger: 'hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400',
};

/**
 * Icon-only row action. Stops the click from also triggering the row's own click handler.
 *
 * @example
 * <RowActionButton label={t('edit')} onClick={() => onEdit(row)}><Pencil className="h-4 w-4" /></RowActionButton>
 */
export const RowActionButton: FC<RowActionButtonProps> = ({ label, onClick, children, tone = 'default', disabled }) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    disabled={disabled}
    onClick={(event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      onClick();
    }}
    className={cn(
      'inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:pointer-events-none disabled:opacity-40 dark:text-gray-400',
      toneClasses[tone]
    )}
  >
    {children}
  </button>
);

export default RowActionButton;
