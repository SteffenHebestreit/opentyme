/**
 * @fileoverview Small pure helpers for displaying hourly rate changes.
 *
 * Kept out of the component files so those export only components (fast
 * refresh needs that) and so the helpers can be unit-tested directly.
 *
 * @module utils/rates
 */

/**
 * Percentage change between two rates, or null when there is no "before".
 *
 * @param {number | null} previous - Old rate
 * @param {number | null} next - New rate
 * @returns {number | null} e.g. 11.76 for 85 → 95
 */
export function rateChangePercent(previous: number | null, next: number | null): number | null {
  if (previous === null || next === null || previous === 0 || Number.isNaN(next)) {
    return null;
  }
  return ((next - previous) / previous) * 100;
}

/**
 * Formats a percentage change with sign and the app's decimal separator.
 *
 * @param {number} percent - The change
 * @param {string} locale - App language
 * @returns {string} e.g. "+11,8 %"
 */
export function formatPercentChange(percent: number, locale: string): string {
  const formatted = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
    signDisplay: 'exceptZero',
  }).format(percent);
  return `${formatted} %`;
}

/**
 * Notes the system writes itself (migration, project form, project creation)
 * are stored in English. Shown as-is they would be the only English text in an
 * otherwise German timeline, so known ones are translated on display.
 *
 * @param {string | null} note - Stored note
 * @param {Function} t - Translator for the `projects` namespace
 * @returns {string | null} Display text
 */
export function describeRateNote(note: string | null, t: (key: string) => string): string | null {
  if (!note) return null;
  const systemNotes: Record<string, string> = {
    'Initial rate': 'rates.systemNotes.initial',
    'Initial rate (migrated from project)': 'rates.systemNotes.migrated',
    'Rate changed on project': 'rates.systemNotes.projectForm',
  };
  return systemNotes[note] ? t(systemNotes[note]) : note;
}
