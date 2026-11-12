import { toYmd } from '../../../utils/date';

/** First and last day of the month `now` falls in, as YYYY-MM-DD — the default period of a run. */
export function currentMonth(now = new Date()): { start: string; end: string } {
  return {
    start: toYmd(new Date(now.getFullYear(), now.getMonth(), 1)),
    end: toYmd(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
}
