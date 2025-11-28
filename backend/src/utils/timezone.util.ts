/**
 * Timezone utility functions for handling European (Berlin) timezone conversions.
 * 
 * All time entries should be stored and displayed in Europe/Berlin timezone (CET/CEST),
 * which automatically handles daylight saving time transitions.
 * 
 * @module utils/timezone
 */

import moment from 'moment-timezone';

/**
 * The application's default timezone.
 * Europe/Berlin handles both CET (UTC+1) and CEST (UTC+2) automatically.
 */
export const APP_TIMEZONE = 'Europe/Berlin';

/**
 * Gets the current date and time in the application's timezone.
 * 
 * @returns {Date} Current date/time in Europe/Berlin timezone
 * 
 * @example
 * const now = getCurrentTime();
 * console.log(now); // 2025-11-12T14:30:00.000Z (represents Berlin time)
 */
export function getCurrentTime(): Date {
  return moment.tz(APP_TIMEZONE).toDate();
}

/**
 * Gets the current date in YYYY-MM-DD format in the application's timezone.
 * 
 * @returns {string} Current date in YYYY-MM-DD format
 * 
 * @example
 * const today = getCurrentDate();
 * console.log(today); // "2025-11-12"
 */
export function getCurrentDate(): string {
  return moment.tz(APP_TIMEZONE).format('YYYY-MM-DD');
}

/**
 * Gets the current time in HH:mm:ss format in the application's timezone.
 * 
 * @returns {string} Current time in HH:mm:ss format
 * 
 * @example
 * const time = getCurrentTimeString();
 * console.log(time); // "14:30:45"
 */
export function getCurrentTimeString(): string {
  return moment.tz(APP_TIMEZONE).format('HH:mm:ss');
}

/**
 * Converts a Date object to the application's timezone.
 * 
 * @param {Date} date - The date to convert
 * @returns {Date} Date adjusted to Europe/Berlin timezone
 * 
 * @example
 * const utcDate = new Date('2025-11-12T13:30:00Z');
 * const berlinDate = toAppTimezone(utcDate);
 * // Returns date representing 14:30 or 15:30 depending on DST
 */
export function toAppTimezone(date: Date): Date {
  return moment(date).tz(APP_TIMEZONE).toDate();
}

/**
 * Formats a Date object as a time string (HH:mm:ss) in the application's timezone.
 * 
 * @param {Date} date - The date to format
 * @returns {string} Time string in HH:mm:ss format
 * 
 * @example
 * const date = new Date();
 * const timeStr = formatTimeString(date);
 * console.log(timeStr); // "14:30:45"
 */
export function formatTimeString(date: Date): string {
  return moment(date).tz(APP_TIMEZONE).format('HH:mm:ss');
}

/**
 * Formats a Date object as a date string (YYYY-MM-DD) in the application's timezone.
 * 
 * @param {Date} date - The date to format
 * @returns {string} Date string in YYYY-MM-DD format
 * 
 * @example
 * const date = new Date();
 * const dateStr = formatDateString(date);
 * console.log(dateStr); // "2025-11-12"
 */
export function formatDateString(date: Date): string {
  return moment(date).tz(APP_TIMEZONE).format('YYYY-MM-DD');
}

/**
 * Parses a date string and returns a Date object in the application's timezone.
 * 
 * @param {string} dateStr - Date string in YYYY-MM-DD format
 * @returns {Date} Date object in Europe/Berlin timezone
 * 
 * @example
 * const date = parseDate('2025-11-12');
 * console.log(date); // Date object representing midnight on Nov 12 in Berlin
 */
export function parseDate(dateStr: string): Date {
  return moment.tz(dateStr, 'YYYY-MM-DD', APP_TIMEZONE).toDate();
}

/**
 * Parses a date and time string and returns a Date object in the application's timezone.
 * 
 * @param {string} dateStr - Date string in YYYY-MM-DD format
 * @param {string} timeStr - Time string in HH:mm:ss or HH:mm format
 * @returns {Date} Date object in Europe/Berlin timezone
 * 
 * @example
 * const datetime = parseDateTime('2025-11-12', '14:30:00');
 * console.log(datetime); // Date object representing 14:30 on Nov 12 in Berlin
 */
export function parseDateTime(dateStr: string, timeStr: string): Date {
  return moment.tz(`${dateStr} ${timeStr}`, 'YYYY-MM-DD HH:mm:ss', APP_TIMEZONE).toDate();
}

/**
 * Calculates duration in hours between two dates.
 * 
 * @param {Date} startDate - Start date/time
 * @param {Date} endDate - End date/time
 * @returns {number} Duration in hours (rounded to 2 decimal places)
 * 
 * @example
 * const start = new Date('2025-11-12T09:00:00');
 * const end = new Date('2025-11-12T17:30:00');
 * const duration = calculateDurationHours(start, end);
 * console.log(duration); // 8.5
 */
export function calculateDurationHours(startDate: Date, endDate: Date): number {
  const durationMs = endDate.getTime() - startDate.getTime();
  const durationHours = durationMs / (1000 * 60 * 60);
  return Math.round(durationHours * 100) / 100;
}

/**
 * Rounds a time down to the nearest quarter-hour (15-minute interval) with 5-minute tolerance.
 * Used for rounding start times when stopping a timer.
 * 
 * Rules:
 * - Within 5 minutes of the previous quarter: round down to that quarter
 * - Otherwise: round down to current quarter
 * 
 * @param {Date} date - The date/time to round
 * @returns {Date} Rounded date/time
 * 
 * @example
 * roundStartTimeToQuarter(new Date('2025-11-12T19:07:00')); // 19:00
 * roundStartTimeToQuarter(new Date('2025-11-12T19:10:00')); // 19:00
 * roundStartTimeToQuarter(new Date('2025-11-12T19:11:00')); // 19:15
 * roundStartTimeToQuarter(new Date('2025-11-12T19:03:00')); // 19:00
 */
export function roundStartTimeToQuarter(date: Date): Date {
  const m = moment(date).tz(APP_TIMEZONE);
  const minutes = m.minutes();
  
  // Calculate the current quarter (0, 15, 30, 45)
  const currentQuarter = Math.floor(minutes / 15) * 15;
  
  // Calculate minutes past the current quarter
  const minutesPastQuarter = minutes % 15;
  
  // If within 5 minutes of the next quarter (11-14 minutes past quarter), round up to next quarter
  if (minutesPastQuarter >= 11) {
    const nextQuarter = (currentQuarter + 15) % 60;
    const hoursToAdd = nextQuarter === 0 ? 1 : 0;
    return m.minutes(nextQuarter).seconds(0).milliseconds(0).add(hoursToAdd, 'hours').toDate();
  }
  
  // Otherwise, round down to current quarter
  return m.minutes(currentQuarter).seconds(0).milliseconds(0).toDate();
}

/**
 * Rounds a time up to the nearest quarter-hour (15-minute interval) with 5-minute tolerance.
 * Used for rounding end times when stopping a timer.
 * 
 * Rules:
 * - Within 5 minutes of the next quarter: round up to that quarter
 * - Otherwise: round up to current quarter
 * 
 * @param {Date} date - The date/time to round
 * @returns {Date} Rounded date/time
 * 
 * @example
 * roundEndTimeToQuarter(new Date('2025-11-12T19:50:00')); // 20:00
 * roundEndTimeToQuarter(new Date('2025-11-12T19:53:00')); // 20:00
 * roundEndTimeToQuarter(new Date('2025-11-12T19:47:00')); // 19:45
 * roundEndTimeToQuarter(new Date('2025-11-12T19:14:00')); // 19:15
 */
export function roundEndTimeToQuarter(date: Date): Date {
  const m = moment(date).tz(APP_TIMEZONE);
  const minutes = m.minutes();
  
  // Calculate the current quarter (0, 15, 30, 45)
  const currentQuarter = Math.floor(minutes / 15) * 15;
  
  // Calculate minutes past the current quarter
  const minutesPastQuarter = minutes % 15;
  
  // If within 5 minutes before the next quarter (11-14 minutes past quarter), round up to next quarter
  // Or if any time past the quarter, round up to next quarter
  if (minutesPastQuarter > 0 && minutesPastQuarter <= 10) {
    // Round up to next quarter
    const nextQuarter = (currentQuarter + 15) % 60;
    const hoursToAdd = nextQuarter === 0 ? 1 : 0;
    return m.minutes(nextQuarter).seconds(0).milliseconds(0).add(hoursToAdd, 'hours').toDate();
  } else if (minutesPastQuarter > 10) {
    // Within 5 minutes of next quarter, round up to next quarter
    const nextQuarter = (currentQuarter + 15) % 60;
    const hoursToAdd = nextQuarter === 0 ? 1 : 0;
    return m.minutes(nextQuarter).seconds(0).milliseconds(0).add(hoursToAdd, 'hours').toDate();
  }
  
  // Exactly on a quarter, keep it
  return m.minutes(currentQuarter).seconds(0).milliseconds(0).toDate();
}

/**
 * Rounds timer start and end times according to billing rules and ensures minimum 15-minute duration.
 * 
 * Rules:
 * 1. Minimum duration: 15 minutes (0.25 hours)
 * 2. Start time: Round down to nearest quarter with 5-minute tolerance
 *    - XX:00-XX:10 → XX:00
 *    - XX:11-XX:25 → XX:15
 *    - XX:26-XX:40 → XX:30
 *    - XX:41-XX:55 → XX:45
 * 3. End time: Round up to nearest quarter with 5-minute tolerance
 *    - XX:01-XX:10 → XX:15
 *    - XX:11-XX:25 → XX:15
 *    - XX:26-XX:40 → XX:30
 *    - XX:41-XX:55 → XX:45
 *    - XX:46-XX:59 → next hour XX:00
 * 
 * @param {Date} startDate - Original start date/time
 * @param {Date} endDate - Original end date/time
 * @returns {{ startTime: Date, endTime: Date, durationHours: number }} Rounded times and duration
 * 
 * @example
 * // Start at 19:03, end at 19:14 → Start 19:00, end 19:15, duration 0.25h
 * roundTimerToQuarters(new Date('2025-11-12T19:03:00'), new Date('2025-11-12T19:14:00'));
 * // Returns: { startTime: 19:00, endTime: 19:15, durationHours: 0.25 }
 */
export function roundTimerToQuarters(startDate: Date, endDate: Date): {
  startTime: Date;
  endTime: Date;
  durationHours: number;
} {
  let roundedStart = roundStartTimeToQuarter(startDate);
  let roundedEnd = roundEndTimeToQuarter(endDate);
  
  // Calculate duration in hours
  let durationMs = roundedEnd.getTime() - roundedStart.getTime();
  let durationHours = durationMs / (1000 * 60 * 60);
  
  // Ensure minimum 15 minutes (0.25 hours)
  if (durationHours < 0.25) {
    // Adjust end time to be exactly 15 minutes after start
    roundedEnd = moment(roundedStart).add(15, 'minutes').toDate();
    durationHours = 0.25;
  }
  
  // Round duration to 2 decimal places
  durationHours = Math.round(durationHours * 100) / 100;
  
  return {
    startTime: roundedStart,
    endTime: roundedEnd,
    durationHours,
  };
}
