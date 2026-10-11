/**
 * @fileoverview Building blocks for the configuration pages (/config/:tab):
 * a page heading, grouped setting cards, labelled fields, a switch row and a
 * sticky save bar — so every settings page reads the same way.
 *
 * @module components/admin/SettingsSection
 */

import type { ChangeEvent, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';
import { fieldHelperClass, fieldLabelClass } from '../forms/fieldStyles';

/**
 * Heading of one settings page: title, one line of explanation, actions on the right.
 */
export function SettingsHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold tracking-tight text-gray-900 dark:text-white">{title}</h2>
        {description && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

interface SettingsSectionProps {
  title: string;
  description?: ReactNode;
  icon?: LucideIcon;
  /** Element at the right of the header (a switch, a button) */
  action?: ReactNode;
  /** Buttons in a muted bar under the fields */
  footer?: ReactNode;
  children?: ReactNode;
  className?: string;
  bodyClassName?: string;
}

/**
 * A group of related settings: header (title + description) above the fields.
 */
export function SettingsSection({
  title,
  description,
  icon: Icon,
  action,
  footer,
  children,
  className,
  bodyClassName,
}: SettingsSectionProps) {
  return (
    <section className={cn('surface overflow-hidden', className)}>
      <div
        className={cn(
          'flex items-start gap-3 px-5 py-4 sm:px-6',
          children !== undefined && 'border-b border-gray-100 dark:border-gray-800'
        )}
      >
        {Icon && (
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-50 text-gray-500 ring-1 ring-inset ring-gray-200 dark:bg-white/[0.04] dark:text-gray-400 dark:ring-gray-800">
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="section-label">{title}</h3>
          {description && <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{description}</p>}
        </div>
        {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
      </div>
      {children !== undefined && <div className={cn('px-5 py-5 sm:px-6', bodyClassName)}>{children}</div>}
      {footer && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 bg-gray-50/70 px-5 py-3 sm:px-6 dark:border-gray-800 dark:bg-white/[0.02]">
          {footer}
        </div>
      )}
    </section>
  );
}

/**
 * Label + control + optional hint. Pass the control's id as `htmlFor`.
 */
export function SettingsField({
  label,
  htmlFor,
  hint,
  className,
  children,
}: {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className={fieldLabelClass()}>
        {label}
      </label>
      {children}
      {hint && <p className={fieldHelperClass}>{hint}</p>}
    </div>
  );
}

/**
 * Accessible on/off switch (a styled checkbox button).
 */
export function SettingsSwitch({
  checked,
  onChange,
  label,
  id,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Accessible name when no visible label points at the switch */
  label?: string;
  id?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900',
        'disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-brand-600 dark:bg-brand-500' : 'bg-gray-200 dark:bg-gray-700'
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'inline-block h-5 w-5 rounded-full bg-white shadow-sm ring-1 ring-black/5 transition-transform duration-200 ease-out',
          checked ? 'translate-x-[22px]' : 'translate-x-0.5'
        )}
      />
    </button>
  );
}

/**
 * Checkbox with a label and an optional description underneath.
 */
export function SettingsCheckbox({
  checked,
  onChange,
  label,
  description,
  name,
  disabled,
}: {
  checked: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  label: ReactNode;
  description?: ReactNode;
  name?: string;
  disabled?: boolean;
}) {
  return (
    <label className={cn('flex items-start gap-3', disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer')}>
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-brand-600 accent-brand-600 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-900"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">{description}</span>}
      </span>
    </label>
  );
}

/**
 * Save bar that sticks to the bottom of the viewport while a long settings
 * page scrolls. `status` sits on the left (e.g. an "unsaved changes" hint).
 */
export function SettingsSaveBar({ status, children }: { status?: ReactNode; children: ReactNode }) {
  return (
    <div className="sticky bottom-4 z-20">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white/90 px-4 py-3 shadow-lifted backdrop-blur-md sm:px-5 dark:border-gray-800 dark:bg-gray-900/90 dark:shadow-edge">
        <div className="min-w-0 text-sm text-gray-500 dark:text-gray-400">{status}</div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>
      </div>
    </div>
  );
}
