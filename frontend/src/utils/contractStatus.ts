/**
 * @fileoverview Where a contract stands in its term — the one thing a stored
 * contract has to tell you at a glance.
 *
 * A validity period is only useful if someone notices it ending. These helpers
 * turn `valid_from` / `valid_until` into a status the UI can colour, sort by
 * and act on ("expires in 25 days → extend").
 *
 * @module utils/contractStatus
 */

import { daysUntilYmd, todayYmd } from './date';

/** Days before the end of a term from which a contract counts as "expiring". */
export const EXPIRY_WARNING_DAYS = 60;

export type ContractStatus =
  | { kind: 'expired'; days: number }
  | { kind: 'expiring'; days: number }
  | { kind: 'upcoming'; days: number }
  | { kind: 'active' }
  | null;

/**
 * Status of a document's validity period on a given day.
 *
 * @param validFrom - Start of the term, YYYY-MM-DD, or null
 * @param validUntil - Last day of the term (inclusive), YYYY-MM-DD, or null
 * @param today - Reference day, YYYY-MM-DD (defaults to today)
 * @returns The status, or null when the document has no term at all
 */
export function contractStatus(
  validFrom: string | null | undefined,
  validUntil: string | null | undefined,
  today: string = todayYmd()
): ContractStatus {
  const from = validFrom ? validFrom.slice(0, 10) : null;
  const until = validUntil ? validUntil.slice(0, 10) : null;
  if (!from && !until) return null;

  if (until && until < today) {
    return { kind: 'expired', days: -daysUntilFrom(until, today) };
  }
  if (from && from > today) {
    return { kind: 'upcoming', days: daysUntilFrom(from, today) };
  }
  if (until) {
    const days = daysUntilFrom(until, today);
    if (days <= EXPIRY_WARNING_DAYS) return { kind: 'expiring', days };
  }
  return { kind: 'active' };
}

/**
 * Sort weight: what needs attention first — expiring, then running, then not
 * yet started, then undated paperwork, then expired.
 */
export function contractStatusRank(status: ContractStatus): number {
  if (!status) return 3;
  switch (status.kind) {
    case 'expiring':
      return 0;
    case 'active':
      return 1;
    case 'upcoming':
      return 2;
    case 'expired':
      return 4;
    default:
      return 3;
  }
}

/** Calendar days from `today` to `target`, both YYYY-MM-DD. */
function daysUntilFrom(target: string, today: string): number {
  if (today === todayYmd()) return daysUntilYmd(target);
  const [ty, tm, td] = target.split('-').map(Number);
  const [ny, nm, nd] = today.split('-').map(Number);
  return Math.round((new Date(ty, tm - 1, td).getTime() - new Date(ny, nm - 1, nd).getTime()) / 86_400_000);
}

/**
 * A readable title from a file name: drops the extension and turns
 * separators into spaces — "Rahmenvertrag_2027-final.pdf" → "Rahmenvertrag 2027 final".
 */
export function titleFromFilename(filename: string): string {
  const withoutExtension = filename.replace(/\.[A-Za-z0-9]{1,5}$/, '');
  return withoutExtension.replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim();
}
