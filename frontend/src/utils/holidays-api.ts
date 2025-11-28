/**
 * @fileoverview Holiday utilities using Nager.Date Public API
 * 
 * Provides functions to determine day types (weekday, weekend, holiday)
 * and return appropriate colors for chart visualization.
 * Uses the Nager.Date public API (https://date.nager.at) for holiday data.
 * 
 * @module utils/holidays-api
 */

/**
 * German federal states with their codes
 */
export const GERMAN_STATES = [
  { code: 'BW', name: 'Baden-Württemberg' },
  { code: 'BY', name: 'Bayern' },
  { code: 'BE', name: 'Berlin' },
  { code: 'BB', name: 'Brandenburg' },
  { code: 'HB', name: 'Bremen' },
  { code: 'HH', name: 'Hamburg' },
  { code: 'HE', name: 'Hessen' },
  { code: 'MV', name: 'Mecklenburg-Vorpommern' },
  { code: 'NI', name: 'Niedersachsen' },
  { code: 'NW', name: 'Nordrhein-Westfalen' },
  { code: 'RP', name: 'Rheinland-Pfalz' },
  { code: 'SL', name: 'Saarland' },
  { code: 'SN', name: 'Sachsen' },
  { code: 'ST', name: 'Sachsen-Anhalt' },
  { code: 'SH', name: 'Schleswig-Holstein' },
  { code: 'TH', name: 'Thüringen' },
] as const;

export type GermanStateCode = typeof GERMAN_STATES[number]['code'];

export type DayType = 'weekday' | 'weekend' | 'national-holiday' | 'regional-holiday';

export interface HolidayInfo {
  type: DayType;
  name?: string;
  color: string;
}

interface NagerHoliday {
  date: string;
  localName: string;
  name: string;
  countryCode: string;
  fixed: boolean;
  global: boolean;
  counties: string[] | null;
  launchYear: number | null;
  types: string[];
}

// Mapping of German state codes to Nager.Date county codes
const STATE_TO_COUNTY_MAP: Record<string, string> = {
  'BW': 'DE-BW',
  'BY': 'DE-BY',
  'BE': 'DE-BE',
  'BB': 'DE-BB',
  'HB': 'DE-HB',
  'HH': 'DE-HH',
  'HE': 'DE-HE',
  'MV': 'DE-MV',
  'NI': 'DE-NI',
  'NW': 'DE-NW',
  'RP': 'DE-RP',
  'SL': 'DE-SL',
  'SN': 'DE-SN',
  'ST': 'DE-ST',
  'SH': 'DE-SH',
  'TH': 'DE-TH',
};

// Cache for API responses with localStorage persistence
const CACHE_VERSION = 'v1';
const CACHE_KEY_PREFIX = 'holidays_cache_';

// Initialize cache from localStorage
function initializeCacheFromStorage(): Map<string, NagerHoliday[]> {
  const cache = new Map<string, NagerHoliday[]>();
  try {
    // Check if we need to clear cache (first day of month)
    const lastClearDate = localStorage.getItem('holidays_last_clear');
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    if (!lastClearDate || new Date(lastClearDate).getMonth() !== today.getMonth()) {
      // Clear cache on first run of new month
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(CACHE_KEY_PREFIX)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
      localStorage.setItem('holidays_last_clear', todayStr);
      return cache;
    }
    
    // Load existing cache from localStorage
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(CACHE_KEY_PREFIX)) {
        const cacheKey = key.substring(CACHE_KEY_PREFIX.length);
        const data = localStorage.getItem(key);
        if (data) {
          const parsed = JSON.parse(data);
          if (parsed.version === CACHE_VERSION) {
            const holidays: NagerHoliday[] = parsed.holidays;
            cache.set(cacheKey, holidays);
            
            // Populate holidayDateCache for fast lookup
            holidays.forEach(holiday => {
              holidayDateCache.set(holiday.date, {
                type: holiday.global ? 'national-holiday' : 'regional-holiday',
                name: holiday.localName,
                global: holiday.global,
                counties: holiday.counties,
              });
            });
          }
        }
      }
    }
  } catch (e) {
    console.error('Error loading holiday cache from localStorage:', e);
  }
  return cache;
}

// Cache for processed holiday dates (for fast synchronous lookup)
export const holidayDateCache: Map<string, { type: DayType; name: string; global: boolean; counties: string[] | null }> = new Map();

const holidayCache: Map<string, NagerHoliday[]> = initializeCacheFromStorage();

/**
 * Fetch holidays from Nager.Date API
 * 
 * @param year - The year to fetch holidays for
 * @param countryCode - ISO 3166-1 alpha-2 country code (e.g., 'DE')
 * @returns Promise of holiday data
 */
async function fetchHolidays(year: number, countryCode: string): Promise<NagerHoliday[]> {
  const cacheKey = `${countryCode}-${year}`;
  
  // Check cache first
  if (holidayCache.has(cacheKey)) {
    return holidayCache.get(cacheKey)!;
  }
  
  try {
    const response = await fetch(`https://date.nager.at/api/v3/publicholidays/${year}/${countryCode}`);
    
    if (!response.ok) {
      console.warn(`Failed to fetch holidays for ${countryCode} ${year}:`, response.statusText);
      return [];
    }
    
    const holidays: NagerHoliday[] = await response.json();
    
    // Store in memory cache
    holidayCache.set(cacheKey, holidays);
    
    // Store in localStorage for persistence
    try {
      localStorage.setItem(
        CACHE_KEY_PREFIX + cacheKey,
        JSON.stringify({
          version: CACHE_VERSION,
          holidays: holidays,
          timestamp: Date.now(),
        })
      );
    } catch (e) {
      console.warn('Failed to persist holiday cache to localStorage:', e);
    }
    
    // Process and cache holiday dates for fast lookup
    holidays.forEach(holiday => {
      holidayDateCache.set(holiday.date, {
        type: holiday.global ? 'national-holiday' : 'regional-holiday',
        name: holiday.localName,
        global: holiday.global,
        counties: holiday.counties,
      });
    });
    
    return holidays;
  } catch (error) {
    console.error(`Error fetching holidays for ${countryCode} ${year}:`, error);
    return [];
  }
}

/**
 * Get chart color for a date (synchronous, uses cached data)
 * Must call prefetchHolidays first to ensure data is available
 * 
 * @param dateStr - Date string in YYYY-MM-DD format
 * @param country - Country code
 * @param region - Region/state code
 * @returns CSS color string
 */
export function getChartColorForDate(
  dateStr: string,
  country?: string,
  region?: string
): string {
  const date = new Date(dateStr + 'T00:00:00Z');
  const dayOfWeek = date.getUTCDay();
  
  // Check if it's a weekend
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return 'rgba(59, 130, 246, 0.8)'; // blue
  }
  
  // Check cached holiday data
  if (country === 'DE' && holidayDateCache.has(dateStr)) {
    const holiday = holidayDateCache.get(dateStr)!;
    
    // National holiday (global)
    if (holiday.global) {
      return 'rgba(34, 197, 94, 0.8)'; // green
    }
    
    // Regional holiday
    if (region && holiday.counties) {
      const countyCode = STATE_TO_COUNTY_MAP[region];
      if (countyCode && holiday.counties.includes(countyCode)) {
        return 'rgba(249, 115, 22, 0.8)'; // orange
      }
    }
  }
  
  // Regular weekday
  return 'rgba(168, 85, 247, 0.8)'; // purple
}

/**
 * Get day type information for a specific date (async version)
 * 
 * @param dateStr - Date string in YYYY-MM-DD format
 * @param country - Country code (ISO 3166-1 alpha-2)
 * @param region - Region/state code
 * @returns Holiday information with type, name, and color
 */
export async function getDayType(
  dateStr: string,
  country?: string,
  region?: string
): Promise<HolidayInfo> {
  const date = new Date(dateStr + 'T00:00:00Z');
  const dayOfWeek = date.getUTCDay();
  
  // Check if it's a weekend
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return {
      type: 'weekend',
      color: 'rgba(59, 130, 246, 0.8)', // blue
    };
  }
  
  if (country === 'DE') {
    const year = date.getUTCFullYear();
    await fetchHolidays(year, 'DE'); // Ensure data is cached
    
    // Check cached holiday data
    if (holidayDateCache.has(dateStr)) {
      const holiday = holidayDateCache.get(dateStr)!;
      
      // Check if it's a national holiday (global=true)
      if (holiday.global) {
        return {
          type: 'national-holiday',
          name: holiday.name,
          color: 'rgba(34, 197, 94, 0.8)', // green
        };
      }
      
      // Check if it's a regional holiday for the specified region
      if (region && holiday.counties) {
        const countyCode = STATE_TO_COUNTY_MAP[region];
        if (countyCode && holiday.counties.includes(countyCode)) {
          return {
            type: 'regional-holiday',
            name: holiday.name,
            color: 'rgba(249, 115, 22, 0.8)', // orange
          };
        }
      }
    }
  }
  
  // Regular weekday
  return {
    type: 'weekday',
    color: 'rgba(168, 85, 247, 0.8)', // purple (default)
  };
}

/**
 * Pre-fetch holidays for a year to populate cache
 * Call this on component mount to ensure data is available
 * 
 * @param year - Year to pre-fetch
 * @param country - Country code
 */
export async function prefetchHolidays(year: number, country: string = 'DE'): Promise<void> {
  await fetchHolidays(year, country);
}
