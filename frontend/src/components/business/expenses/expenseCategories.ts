import type { TFunction } from 'i18next';

/**
 * Expense categories offered when recording or editing an expense, grouped the
 * way the select lists them (IT, office, vehicles, tools, services, other).
 *
 * The values are stored on the expense and drive the backend's AfA lookup, so
 * they must not be renamed.
 */
export const EXPENSE_CATEGORY_VALUES = [
  // IT & digital equipment
  'computer',
  'software',
  'peripherals',
  'storage',
  'display',
  'printer',
  // Office
  'office_furniture',
  'office_equipment',
  'office_supplies',
  // Vehicles
  'vehicle_car',
  'vehicle_motorcycle',
  // Tools
  'camera',
  'tools',
  'machinery',
  // Services & operating expenses
  'insurance',
  'professional_services',
  'marketing',
  'utilities',
  'travel',
  'meals',
  'training',
  'rent',
  'telecommunications',
  'other',
] as const;

/** Translated label of an expense category; falls back to the raw value. */
export function expenseCategoryLabel(t: TFunction, value: string | null | undefined): string {
  if (!value) return '—';
  return t(`categories.${value}`, { defaultValue: value.replace(/_/g, ' ') });
}

/** Options for a category select, in display order. */
export function getExpenseCategoryOptions(t: TFunction): Array<{ value: string; label: string }> {
  return EXPENSE_CATEGORY_VALUES.map((value) => ({ value, label: expenseCategoryLabel(t, value) }));
}
