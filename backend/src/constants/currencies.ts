/**
 * @fileoverview Currency constants and definitions for multi-currency support.
 * 
 * Provides a comprehensive list of supported currencies with their metadata including
 * display names, symbols, and country information. Used for currency dropdowns and
 * validation throughout the application.
 * 
 * @module constants/currencies
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
 * Ordered by global usage and popularity. Includes major world currencies
 * commonly used in international business transactions.
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
 * Used for validation in schemas.
 * 
 * @constant
 * @example
 * // Joi validation
 * currency: Joi.string().valid(...CURRENCY_CODES).required()
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
