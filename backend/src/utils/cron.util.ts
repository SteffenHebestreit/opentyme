/**
 * @fileoverview Standard 5-field cron expression parsing and next-run calculation.
 *
 * Supports the common cron syntax used by node-cron:
 *   ┌───────────── minute (0 - 59)
 *   │ ┌───────────── hour (0 - 23)
 *   │ │ ┌───────────── day of month (1 - 31)
 *   │ │ │ ┌───────────── month (1 - 12)
 *   │ │ │ │ ┌───────────── day of week (0 - 6, 0 = Sunday; 7 also = Sunday)
 *   * * * * *
 *
 * Each field supports: `*`, single values, comma lists (`1,15`), ranges (`1-5`),
 * and steps (`*\/5`, `1-30/2`). This is sufficient for scheduled backups and
 * avoids pulling in an additional dependency.
 *
 * @module utils/cron.util
 */

interface CronFields {
  minutes: Set<number>;
  hours: Set<number>;
  daysOfMonth: Set<number>;
  months: Set<number>;
  daysOfWeek: Set<number>;
  dayOfMonthRestricted: boolean;
  dayOfWeekRestricted: boolean;
}

/**
 * Expand a single cron field into the set of matching integer values.
 *
 * @param field - The raw field text (e.g. "*", "1,15", "1-5", "*\/10")
 * @param min - Minimum valid value for this field
 * @param max - Maximum valid value for this field
 * @returns Set of matching values
 * @throws Error if the field is malformed or out of range
 */
function parseField(field: string, min: number, max: number): Set<number> {
  const result = new Set<number>();

  for (const part of field.split(',')) {
    const [rangePart, stepPart] = part.split('/');
    const step = stepPart !== undefined ? parseInt(stepPart, 10) : 1;

    if (!Number.isFinite(step) || step <= 0) {
      throw new Error(`Invalid step in cron field: "${part}"`);
    }

    let rangeStart: number;
    let rangeEnd: number;

    if (rangePart === '*') {
      rangeStart = min;
      rangeEnd = max;
    } else if (rangePart.includes('-')) {
      const [startStr, endStr] = rangePart.split('-');
      rangeStart = parseInt(startStr, 10);
      rangeEnd = parseInt(endStr, 10);
    } else {
      rangeStart = parseInt(rangePart, 10);
      rangeEnd = rangeStart;
    }

    if (!Number.isFinite(rangeStart) || !Number.isFinite(rangeEnd)) {
      throw new Error(`Invalid range in cron field: "${part}"`);
    }
    if (rangeStart < min || rangeEnd > max || rangeStart > rangeEnd) {
      throw new Error(`Cron field value out of range [${min}-${max}]: "${part}"`);
    }

    for (let v = rangeStart; v <= rangeEnd; v += step) {
      result.add(v);
    }
  }

  return result;
}

/**
 * Parse a 5-field cron expression into expanded value sets.
 *
 * @param expression - The cron expression
 * @returns Parsed cron fields
 * @throws Error if the expression does not have exactly 5 fields or any field is invalid
 */
export function parseCronExpression(expression: string): CronFields {
  const parts = expression.trim().split(/\s+/);

  if (parts.length !== 5) {
    throw new Error(`Cron expression must have exactly 5 fields, got ${parts.length}: "${expression}"`);
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  // Normalise day-of-week 7 to 0 (both mean Sunday)
  const daysOfWeek = parseField(dayOfWeek, 0, 7);
  if (daysOfWeek.has(7)) {
    daysOfWeek.delete(7);
    daysOfWeek.add(0);
  }

  return {
    minutes: parseField(minute, 0, 59),
    hours: parseField(hour, 0, 23),
    daysOfMonth: parseField(dayOfMonth, 1, 31),
    months: parseField(month, 1, 12),
    daysOfWeek,
    dayOfMonthRestricted: dayOfMonth !== '*',
    dayOfWeekRestricted: dayOfWeek !== '*',
  };
}

/**
 * Determine whether a given date matches the day constraints of a cron expression.
 *
 * Per cron semantics, when BOTH day-of-month and day-of-week are restricted
 * (not `*`), the date matches if EITHER constraint matches. When only one is
 * restricted, only that one must match.
 */
function dayMatches(date: Date, fields: CronFields): boolean {
  const dom = date.getDate();
  const dow = date.getDay(); // 0 = Sunday

  const domMatch = fields.daysOfMonth.has(dom);
  const dowMatch = fields.daysOfWeek.has(dow);

  if (fields.dayOfMonthRestricted && fields.dayOfWeekRestricted) {
    return domMatch || dowMatch;
  }
  if (fields.dayOfMonthRestricted) {
    return domMatch;
  }
  if (fields.dayOfWeekRestricted) {
    return dowMatch;
  }
  return true; // Neither restricted
}

/**
 * Compute the next date/time at which a cron expression fires after `from`.
 *
 * Uses local server time (matching node-cron's default behaviour). Scans
 * minute-by-minute up to a safe horizon (~4 years) to find the next match.
 *
 * @param expression - A standard 5-field cron expression
 * @param from - The reference time to search after (default: now)
 * @returns The next matching Date, or null if the expression never matches within the horizon
 */
export function getNextCronRun(expression: string, from: Date = new Date()): Date | null {
  const fields = parseCronExpression(expression);

  // Start at the next whole minute (cron has minute resolution)
  const candidate = new Date(from.getTime());
  candidate.setSeconds(0, 0);
  candidate.setMinutes(candidate.getMinutes() + 1);

  // Horizon: 4 years of minutes is an upper bound that covers Feb-29 schedules.
  const maxIterations = 4 * 366 * 24 * 60;

  for (let i = 0; i < maxIterations; i++) {
    if (
      fields.months.has(candidate.getMonth() + 1) &&
      dayMatches(candidate, fields) &&
      fields.hours.has(candidate.getHours()) &&
      fields.minutes.has(candidate.getMinutes())
    ) {
      return new Date(candidate.getTime());
    }
    candidate.setMinutes(candidate.getMinutes() + 1);
  }

  return null;
}
