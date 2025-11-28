/**
 * Time rounding utilities for timer and time entry forms.
 * Matches the backend rounding logic for consistent behavior.
 * 
 * @module utils/timeRounding
 */

/**
 * Rounds a time down to the nearest quarter-hour (15-minute interval) with 5-minute tolerance.
 * Used for rounding start times.
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
 * roundStartTimeToQuarter(new Date('2025-11-12T19:55:00')); // 19:45
 */
export function roundStartTimeToQuarter(date: Date): Date {
  const result = new Date(date);
  const minutes = result.getMinutes();
  
  // Calculate the current quarter (0, 15, 30, 45)
  const currentQuarter = Math.floor(minutes / 15) * 15;
  
  // Calculate minutes past the current quarter
  const minutesPastQuarter = minutes % 15;
  
  // If within 5 minutes of the next quarter (11-14 minutes past quarter), round up to next quarter
  if (minutesPastQuarter >= 11) {
    const nextQuarter = (currentQuarter + 15) % 60;
    result.setMinutes(nextQuarter, 0, 0);
    if (nextQuarter === 0) {
      result.setHours(result.getHours() + 1);
    }
    return result;
  }
  
  // Otherwise, round down to current quarter
  result.setMinutes(currentQuarter, 0, 0);
  return result;
}

/**
 * Rounds a time up to the nearest quarter-hour (15-minute interval) with 5-minute tolerance.
 * Used for rounding end times.
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
  const result = new Date(date);
  const minutes = result.getMinutes();
  
  // Calculate the current quarter (0, 15, 30, 45)
  const currentQuarter = Math.floor(minutes / 15) * 15;
  
  // Calculate minutes past the current quarter
  const minutesPastQuarter = minutes % 15;
  
  // If any time past the quarter, round up to next quarter
  if (minutesPastQuarter > 0) {
    const nextQuarter = (currentQuarter + 15) % 60;
    result.setMinutes(nextQuarter, 0, 0);
    if (nextQuarter === 0) {
      result.setHours(result.getHours() + 1);
    }
  } else {
    // Exactly on a quarter, keep it
    result.setMinutes(currentQuarter, 0, 0);
  }
  
  return result;
}

/**
 * Formats a time string from a Date object in HH:mm format.
 * 
 * @param {Date} date - The date to format
 * @returns {string} Time string in HH:mm format
 * 
 * @example
 * formatTimeString(new Date('2025-11-12T19:30:00')); // "19:30"
 */
export function formatTimeString(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}
