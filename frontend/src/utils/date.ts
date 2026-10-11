const relativeFormatter = new Intl.RelativeTimeFormat(undefined, {
  numeric: 'auto',
});

const SECOND = 1000;
const MINUTE = SECOND * 60;
const HOUR = MINUTE * 60;
const DAY = HOUR * 24;
const WEEK = DAY * 7;
const MONTH = DAY * 30;
const YEAR = DAY * 365;

export function formatDistanceToNow(dateLike: string | Date | null | undefined): string {
  if (!dateLike) {
    return 'unknown time';
  }

  const date = typeof dateLike === 'string' ? new Date(dateLike) : dateLike;
  if (Number.isNaN(date.getTime())) {
    return 'invalid date';
  }

  const now = new Date();
  const diff = date.getTime() - now.getTime();
  const absDiff = Math.abs(diff);

  if (absDiff < MINUTE) {
    return relativeFormatter.format(Math.round(diff / SECOND), 'second');
  }
  if (absDiff < HOUR) {
    return relativeFormatter.format(Math.round(diff / MINUTE), 'minute');
  }
  if (absDiff < DAY) {
    return relativeFormatter.format(Math.round(diff / HOUR), 'hour');
  }
  if (absDiff < WEEK) {
    return relativeFormatter.format(Math.round(diff / DAY), 'day');
  }
  if (absDiff < MONTH) {
    return relativeFormatter.format(Math.round(diff / WEEK), 'week');
  }
  if (absDiff < YEAR) {
    return relativeFormatter.format(Math.round(diff / MONTH), 'month');
  }
  return relativeFormatter.format(Math.round(diff / YEAR), 'year');
}

export function formatDate(dateLike: string | Date | null | undefined, options?: Intl.DateTimeFormatOptions): string {
  if (!dateLike) return '—';
  const date = typeof dateLike === 'string' ? new Date(dateLike) : dateLike;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, options ?? { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
}

/*
 * Date-only helpers (YYYY-MM-DD).
 *
 * Validity dates, rate periods and contract terms are calendar days, not
 * instants. `new Date('2026-11-01')` parses as UTC midnight, which shows as
 * 31 Oct for anyone west of UTC — so these helpers build LOCAL dates from the
 * parts and never round-trip through an ISO timestamp.
 */

/** Parses `YYYY-MM-DD` (or a longer ISO string) into a local Date, or null. */
export function parseYmd(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** Formats a local Date as `YYYY-MM-DD`. */
export function toYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Today as `YYYY-MM-DD` in local time. */
export function todayYmd(): string {
  return toYmd(new Date());
}

/** Adds (or subtracts) whole days to a `YYYY-MM-DD` date. */
export function addDaysYmd(value: string, days: number): string {
  const date = parseYmd(value) ?? new Date();
  date.setDate(date.getDate() + days);
  return toYmd(date);
}

/**
 * Adds whole months, clamping to the last day of the target month, so
 * 31 Jan + 1 month is 28/29 Feb rather than rolling over into March.
 */
export function addMonthsYmd(value: string, months: number): string {
  const date = parseYmd(value) ?? new Date();
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + months);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, lastDay));
  return toYmd(date);
}

/** The 1st of next month as `YYYY-MM-DD` — the usual start of a new rate. */
export function firstOfNextMonthYmd(): string {
  const now = new Date();
  return toYmd(new Date(now.getFullYear(), now.getMonth() + 1, 1));
}

/** 1 January of next year as `YYYY-MM-DD`. */
export function nextNewYearYmd(): string {
  return toYmd(new Date(new Date().getFullYear() + 1, 0, 1));
}

/** Whole calendar days from today until the given date (negative when past). */
export function daysUntilYmd(value: string): number {
  const target = parseYmd(value);
  if (!target) return 0;
  const today = parseYmd(todayYmd()) as Date;
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/**
 * Formats a calendar date for display in the app's language — `01.11.2026`
 * for German. Uses the language the user picked in the app, not the browser's,
 * so dates match the rest of the interface.
 */
export function formatYmd(value: string | null | undefined, locale?: string): string {
  const date = parseYmd(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat(locale || undefined, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}
