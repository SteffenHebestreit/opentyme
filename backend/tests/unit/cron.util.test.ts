import { getNextCronRun, parseCronExpression } from '../../src/utils/cron.util';

describe('cron.util', () => {
  describe('parseCronExpression', () => {
    it('throws on wrong field count', () => {
      expect(() => parseCronExpression('* * * *')).toThrow(/exactly 5 fields/);
      expect(() => parseCronExpression('* * * * * *')).toThrow(/exactly 5 fields/);
    });

    it('throws on out-of-range values', () => {
      expect(() => parseCronExpression('60 * * * *')).toThrow(/out of range/);
      expect(() => parseCronExpression('* 24 * * *')).toThrow(/out of range/);
      expect(() => parseCronExpression('* * 0 * *')).toThrow(/out of range/);
    });

    it('expands wildcards, lists, ranges and steps', () => {
      const f = parseCronExpression('0,30 9-17 * * 1-5');
      expect(f.minutes.has(0)).toBe(true);
      expect(f.minutes.has(30)).toBe(true);
      expect(f.minutes.has(15)).toBe(false);
      expect(f.hours.has(9)).toBe(true);
      expect(f.hours.has(17)).toBe(true);
      expect(f.hours.has(8)).toBe(false);
      expect(f.daysOfWeek.has(1)).toBe(true);
      expect(f.daysOfWeek.has(5)).toBe(true);
      expect(f.daysOfWeek.has(0)).toBe(false);
    });

    it('normalises day-of-week 7 to 0 (Sunday)', () => {
      const f = parseCronExpression('0 0 * * 7');
      expect(f.daysOfWeek.has(0)).toBe(true);
      expect(f.daysOfWeek.has(7)).toBe(false);
    });

    it('supports step syntax */N', () => {
      const f = parseCronExpression('*/15 * * * *');
      expect([...f.minutes].sort((a, b) => a - b)).toEqual([0, 15, 30, 45]);
    });
  });

  describe('getNextCronRun', () => {
    it('computes the next daily 2:00 AM run', () => {
      const from = new Date('2026-03-15T10:30:00');
      const next = getNextCronRun('0 2 * * *', from)!;
      expect(next.getFullYear()).toBe(2026);
      expect(next.getMonth()).toBe(2); // March
      expect(next.getDate()).toBe(16); // next day
      expect(next.getHours()).toBe(2);
      expect(next.getMinutes()).toBe(0);
    });

    it('returns same-day run when the time is still ahead', () => {
      const from = new Date('2026-03-15T01:00:00');
      const next = getNextCronRun('0 2 * * *', from)!;
      expect(next.getDate()).toBe(15);
      expect(next.getHours()).toBe(2);
    });

    it('computes the next hourly run', () => {
      const from = new Date('2026-03-15T10:30:00');
      const next = getNextCronRun('0 * * * *', from)!;
      expect(next.getHours()).toBe(11);
      expect(next.getMinutes()).toBe(0);
    });

    it('computes the next weekly (Monday 3:00) run', () => {
      // 2026-03-15 is a Sunday
      const from = new Date('2026-03-15T12:00:00');
      const next = getNextCronRun('0 3 * * 1', from)!;
      expect(next.getDay()).toBe(1); // Monday
      expect(next.getDate()).toBe(16);
      expect(next.getHours()).toBe(3);
    });

    it('computes the next monthly (1st at midnight) run', () => {
      const from = new Date('2026-03-15T12:00:00');
      const next = getNextCronRun('0 0 1 * *', from)!;
      expect(next.getMonth()).toBe(3); // April
      expect(next.getDate()).toBe(1);
      expect(next.getHours()).toBe(0);
    });

    it('advances to next minute on */15 schedule', () => {
      const from = new Date('2026-03-15T10:07:00');
      const next = getNextCronRun('*/15 * * * *', from)!;
      expect(next.getMinutes()).toBe(15);
    });

    it('handles Feb 29 on leap years', () => {
      const from = new Date('2026-03-01T00:00:00');
      const next = getNextCronRun('0 0 29 2 *', from)!;
      // Next Feb 29 after March 2026 is 2028
      expect(next.getFullYear()).toBe(2028);
      expect(next.getMonth()).toBe(1); // February
      expect(next.getDate()).toBe(29);
    });
  });
});
