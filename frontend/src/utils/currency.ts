/**
 * @fileoverview Currency utilities for multi-currency support in the frontend.
 * 
 * Provides currency formatting functions, currency data, and helpers for displaying
 * monetary values in different currencies with proper localization.
 * 
 * @module utils/currency
 */

/**
 * Currency definition interface.
 * 
 * @interface Currency
 * @property {string} code - ISO 4217 currency code (e.g., 'USD', 'EUR')
 * @property {string} name - Full currency name (e.g., 'US Dollar', 'Euro')
 * @property {string} symbol - Currency symbol (e.g., '$', '€', '£')
 * @property {string[]} countries - Countries primarily using this currency
 */
export interface Currency {
  code: string;
  name: string;
  symbol: string;
  countries: string[];
}

/**
 * List of supported currencies with metadata.
 * 
 * Ordered by global usage and popularity. Should match backend currency list.
 * 
 * @constant
 */
export const CURRENCIES: Currency[] = [
  {
    code: 'USD',
    name: 'US Dollar',
    symbol: '$',
    countries: ['United States', 'Ecuador', 'El Salvador', 'Zimbabwe'],
  },
  {
    code: 'EUR',
    name: 'Euro',
    symbol: '€',
    countries: ['Germany', 'France', 'Italy', 'Spain', 'Netherlands'],
  },
  {
    code: 'GBP',
    name: 'British Pound',
    symbol: '£',
    countries: ['United Kingdom', 'Jersey', 'Guernsey', 'Isle of Man'],
  },
  {
    code: 'JPY',
    name: 'Japanese Yen',
    symbol: '¥',
    countries: ['Japan'],
  },
  {
    code: 'CAD',
    name: 'Canadian Dollar',
    symbol: 'CA$',
    countries: ['Canada'],
  },
  {
    code: 'AUD',
    name: 'Australian Dollar',
    symbol: 'A$',
    countries: ['Australia', 'Kiribati', 'Nauru'],
  },
  {
    code: 'CHF',
    name: 'Swiss Franc',
    symbol: 'CHF',
    countries: ['Switzerland', 'Liechtenstein'],
  },
  {
    code: 'CNY',
    name: 'Chinese Yuan',
    symbol: '¥',
    countries: ['China'],
  },
  {
    code: 'SEK',
    name: 'Swedish Krona',
    symbol: 'kr',
    countries: ['Sweden'],
  },
  {
    code: 'NOK',
    name: 'Norwegian Krone',
    symbol: 'kr',
    countries: ['Norway'],
  },
  {
    code: 'DKK',
    name: 'Danish Krone',
    symbol: 'kr',
    countries: ['Denmark', 'Greenland', 'Faroe Islands'],
  },
  {
    code: 'NZD',
    name: 'New Zealand Dollar',
    symbol: 'NZ$',
    countries: ['New Zealand', 'Cook Islands', 'Niue'],
  },
  {
    code: 'SGD',
    name: 'Singapore Dollar',
    symbol: 'S$',
    countries: ['Singapore'],
  },
  {
    code: 'HKD',
    name: 'Hong Kong Dollar',
    symbol: 'HK$',
    countries: ['Hong Kong'],
  },
  {
    code: 'KRW',
    name: 'South Korean Won',
    symbol: '₩',
    countries: ['South Korea'],
  },
  {
    code: 'MXN',
    name: 'Mexican Peso',
    symbol: '$',
    countries: ['Mexico'],
  },
  {
    code: 'INR',
    name: 'Indian Rupee',
    symbol: '₹',
    countries: ['India', 'Bhutan'],
  },
  {
    code: 'BRL',
    name: 'Brazilian Real',
    symbol: 'R$',
    countries: ['Brazil'],
  },
  {
    code: 'RUB',
    name: 'Russian Ruble',
    symbol: '₽',
    countries: ['Russia'],
  },
  {
    code: 'ZAR',
    name: 'South African Rand',
    symbol: 'R',
    countries: ['South Africa', 'Lesotho', 'Namibia'],
  },
  {
    code: 'TRY',
    name: 'Turkish Lira',
    symbol: '₺',
    countries: ['Turkey', 'Northern Cyprus'],
  },
  {
    code: 'PLN',
    name: 'Polish Zloty',
    symbol: 'zł',
    countries: ['Poland'],
  },
  {
    code: 'THB',
    name: 'Thai Baht',
    symbol: '฿',
    countries: ['Thailand'],
  },
  {
    code: 'MYR',
    name: 'Malaysian Ringgit',
    symbol: 'RM',
    countries: ['Malaysia'],
  },
  {
    code: 'IDR',
    name: 'Indonesian Rupiah',
    symbol: 'Rp',
    countries: ['Indonesia'],
  },
  {
    code: 'PHP',
    name: 'Philippine Peso',
    symbol: '₱',
    countries: ['Philippines'],
  },
  {
    code: 'CZK',
    name: 'Czech Koruna',
    symbol: 'Kč',
    countries: ['Czech Republic'],
  },
  {
    code: 'ILS',
    name: 'Israeli Shekel',
    symbol: '₪',
    countries: ['Israel', 'Palestine'],
  },
  {
    code: 'AED',
    name: 'UAE Dirham',
    symbol: 'د.إ',
    countries: ['United Arab Emirates'],
  },
  {
    code: 'SAR',
    name: 'Saudi Riyal',
    symbol: '﷼',
    countries: ['Saudi Arabia'],
  },
];

/**
 * Array of all supported currency codes.
 * Used for validation and dropdown options.
 * 
 * @constant
 */
export const CURRENCY_CODES = CURRENCIES.map((c) => c.code);

/**
 * Map of currency codes to currency objects for quick lookup.
 * 
 * @constant
 * @example
 * const usdInfo = CURRENCY_MAP['USD'];
 * console.log(usdInfo.symbol); // '$'
 */
export const CURRENCY_MAP = CURRENCIES.reduce((map, currency) => {
  map[currency.code] = currency;
  return map;
}, {} as Record<string, Currency>);

/**
 * Get the default currency from localStorage settings.
 * Falls back to EUR if no setting is found.
 * 
 * @function
 * @returns {string} Currency code (e.g., 'EUR', 'USD')
 * @example
 * const defaultCurrency = getDefaultCurrency() // Returns: 'EUR' (or user's saved preference)
 */
export function getDefaultCurrency(): string {
  return localStorage.getItem('defaultCurrency') || 'EUR';
}

/**
 * Formats a numeric value as currency with locale detection.
 * 
 * Uses Intl.NumberFormat for locale-aware currency formatting. Falls back to user's
 * default currency (EUR) if no currency specified. Handles different decimal places 
 * for different currencies (e.g., JPY has 0 decimals).
 * 
 * @function
 * @param {number | string} value - The numeric value to format
 * @param {string} [currency] - ISO 4217 currency code (defaults to user's preference or EUR)
 * @returns {string} Formatted currency string with symbol (e.g., '$1,234.56')
 * @example
 * formatCurrency(1234.56) // Returns: '€1,234.56' (uses default)
 * formatCurrency(1234.56, 'USD') // Returns: '$1,234.56'
 * formatCurrency(1234.56, 'EUR') // Returns: '€1,234.56'
 * formatCurrency('1234.56', 'GBP') // Returns: '£1,234.56'
 * formatCurrency(1234, 'JPY') // Returns: '¥1,234' (no decimals)
 */
export function formatCurrency(value: number | string, currency?: string): string {
  const numericValue = typeof value === 'string' ? parseFloat(value) : value;
  const currencyCode = currency || getDefaultCurrency();
  
  if (isNaN(numericValue)) {
    return `${getCurrencySymbol(currencyCode)}0.00`;
  }

  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currencyCode,
    }).format(numericValue);
  } catch (_error) {
    // Fallback to EUR if currency code is invalid
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: 'EUR',
    }).format(numericValue);
  }
}

/**
 * Get currency symbol by currency code.
 * 
 * @function
 * @param {string} code - ISO 4217 currency code
 * @returns {string} Currency symbol or the code itself if not found
 * @example
 * getCurrencySymbol('USD') // Returns: '$'
 * getCurrencySymbol('EUR') // Returns: '€'
 * getCurrencySymbol('INVALID') // Returns: 'INVALID'
 */
export function getCurrencySymbol(code: string): string {
  return CURRENCY_MAP[code]?.symbol || code;
}

/**
 * Get currency name by currency code.
 * 
 * @function
 * @param {string} code - ISO 4217 currency code
 * @returns {string} Currency name or the code itself if not found
 * @example
 * getCurrencyName('USD') // Returns: 'US Dollar'
 * getCurrencyName('EUR') // Returns: 'Euro'
 */
export function getCurrencyName(code: string): string {
  return CURRENCY_MAP[code]?.name || code;
}

/**
 * Get currency object by currency code.
 * 
 * @function
 * @param {string} code - ISO 4217 currency code
 * @returns {Currency | undefined} Currency object or undefined if not found
 * @example
 * const usd = getCurrency('USD');
 * console.log(usd?.symbol); // '$'
 */
export function getCurrency(code: string): Currency | undefined {
  return CURRENCY_MAP[code];
}

/**
 * Format currency for display in dropdowns and selects.
 * 
 * @function
 * @param {Currency} currency - Currency object
 * @returns {string} Formatted string for dropdown display
 * @example
 * formatCurrencyOption(CURRENCY_MAP['USD'])
 * // Returns: "USD ($) - US Dollar"
 */
export function formatCurrencyOption(currency: Currency): string {
  return `${currency.code} (${currency.symbol}) - ${currency.name}`;
}

/**
 * Parse a number string with currency symbols and thousands separators.
 * 
 * @function
 * @param {string} value - The string value to parse (e.g., "$1,234.56")
 * @returns {number} Parsed numeric value
 * @example
 * parseC urrencyString('$1,234.56') // Returns: 1234.56
 * parseCurrencyString('€1.234,56') // Returns: 1234.56
 * parseCurrencyString('1,234.56') // Returns: 1234.56
 */
export function parseCurrencyString(value: string): number {
  // Remove currency symbols, spaces, and thousands separators
  const cleaned = value.replace(/[^\d.,-]/g, '');
  
  // Handle European format (comma as decimal separator)
  const europeanFormat = cleaned.includes(',') && !cleaned.includes('.');
  if (europeanFormat) {
    return parseFloat(cleaned.replace(/\./g, '').replace(',', '.'));
  }
  
  // Handle standard format (dot as decimal separator)
  return parseFloat(cleaned.replace(/,/g, ''));
}
