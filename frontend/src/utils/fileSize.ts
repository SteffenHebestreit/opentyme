/**
 * @fileoverview Human-readable file sizes.
 * @module utils/fileSize
 */

/**
 * Formats a byte count: "69 Bytes", "1,4 MB".
 *
 * @param {number | null | undefined} bytes - Size in bytes
 * @param {string} [locale] - Display language
 * @returns {string | null} Human-readable size, or null when unknown
 */
export function formatFileSize(bytes: number | null | undefined, locale?: string): string | null {
  if (bytes === null || bytes === undefined) return null;
  if (bytes < 1024) return `${bytes} Bytes`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)} ${units[unit]}`;
}
