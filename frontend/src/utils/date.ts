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
