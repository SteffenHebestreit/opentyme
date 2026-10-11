/**
 * @fileoverview Number formatting for dashboard chart axes and tooltips.
 *
 * @module components/dashboard/charts/chartFormat
 */

import { getDefaultCurrency } from '../../../utils/currency';

/** Short currency for axis ticks: `€12K`, `1,2 Tsd. €`. */
export function formatCompactCurrency(value: number, locale?: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: getDefaultCurrency(),
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value);
  } catch {
    return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(value);
  }
}

/** Fixed-decimal number in the app language: `12.5` / `12,5`. */
export function formatDecimal(value: number, locale?: string, digits: number = 1): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}
