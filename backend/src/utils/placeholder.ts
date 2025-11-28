/**
 * @fileoverview Placeholder processing utility for invoices and templates.
 * 
 * Processes text containing placeholders in double curly-braces format {{ placeholder }}
 * and replaces them with actual values from invoice context.
 * 
 * Supported placeholders:
 * - Date/Time: {{date}}, {{month}}, {{month-1}}, {{year}}, {{day}}, {{time}}
 * - Invoice: {{invoice_number}}, {{issue_date}}, {{due_date}}, {{total}}, {{currency}}
 * - Client: {{client}}, {{client_name}}, {{client_email}}, {{client_phone}}
 * - Project: {{project}}, {{project_name}}
 * - Custom: Any other placeholder returns empty string
 * 
 * @module utils/placeholder
 */

/**
 * Context data available for placeholder replacement in invoices.
 * 
 * @interface PlaceholderContext
 * @property {string} [invoice_number] - Invoice number (e.g., "INV-20250430-001")
 * @property {Date} [issue_date] - Invoice issue date
 * @property {Date} [due_date] - Invoice due date
 * @property {number} [total] - Total amount
 * @property {string} [currency] - Currency code (e.g., "EUR", "USD")
 * @property {string} [client_name] - Client name
 * @property {string} [client_email] - Client email
 * @property {string} [client_phone] - Client phone
 * @property {string} [project_name] - Project name
 * @property {string} [language] - Language code (e.g., "de", "en")
 * @property {Date} [referenceDate] - Reference date for date calculations (defaults to current date)
 */
export interface PlaceholderContext {
  invoice_number?: string;
  issue_date?: Date;
  due_date?: Date;
  total?: number;
  currency?: string;
  client_name?: string;
  client_email?: string;
  client_phone?: string;
  project_name?: string;
  language?: string;
  referenceDate?: Date;
}

/**
 * Month names in different languages.
 * Used for formatting month placeholders with localization.
 */
const MONTH_NAMES: Record<string, string[]> = {
  en: [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ],
  de: [
    'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
    'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'
  ]
};

/**
 * Formats a date according to language preferences.
 * 
 * @param {Date} date - Date to format
 * @param {string} language - Language code (e.g., "de", "en")
 * @returns {string} Formatted date string
 * 
 * @example
 * formatDate(new Date('2025-04-01'), 'de') // "01.04.2025"
 * formatDate(new Date('2025-04-01'), 'en') // "04/01/2025"
 */
function formatDate(date: Date, language: string = 'en'): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();

  if (language === 'de') {
    return `${day}.${month}.${year}`;
  }
  return `${month}/${day}/${year}`;
}

/**
 * Gets the month name for a given date.
 * 
 * @param {Date} date - Date to get month name from
 * @param {string} language - Language code (e.g., "de", "en")
 * @returns {string} Month name in the specified language
 * 
 * @example
 * getMonthName(new Date('2025-04-01'), 'de') // "April"
 * getMonthName(new Date('2025-03-01'), 'de') // "März"
 */
function getMonthName(date: Date, language: string = 'en'): string {
  const monthIndex = date.getMonth();
  const monthNames = MONTH_NAMES[language] || MONTH_NAMES.en;
  return monthNames[monthIndex];
}

/**
 * Gets the month name for a date offset by a number of months.
 * 
 * @param {Date} referenceDate - Starting date
 * @param {number} offset - Number of months to offset (can be negative)
 * @param {string} language - Language code (e.g., "de", "en")
 * @returns {string} Month name in the specified language
 * 
 * @example
 * getMonthNameWithOffset(new Date('2025-04-01'), -1, 'de') // "März"
 * getMonthNameWithOffset(new Date('2025-01-01'), -1, 'de') // "Dezember" (previous year)
 */
function getMonthNameWithOffset(referenceDate: Date, offset: number, language: string = 'en'): string {
  const date = new Date(referenceDate);
  date.setMonth(date.getMonth() + offset);
  return getMonthName(date, language);
}

/**
 * Formats a number as currency.
 * 
 * @param {number} amount - Amount to format
 * @param {string} currency - Currency code (e.g., "EUR", "USD")
 * @param {string} language - Language code for number formatting
 * @returns {string} Formatted currency string
 * 
 * @example
 * formatCurrency(1500.50, 'EUR', 'de') // "1.500,50 €"
 * formatCurrency(1500.50, 'USD', 'en') // "$1,500.50"
 */
function formatCurrency(amount: number, currency: string = 'EUR', language: string = 'en'): string {
  const locale = language === 'de' ? 'de-DE' : 'en-US';
  
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency,
    }).format(amount);
  } catch (error) {
    // Fallback if currency is invalid
    return `${amount.toFixed(2)} ${currency}`;
  }
}

/**
 * Processes a single placeholder and returns its replacement value.
 * 
 * @param {string} placeholder - The placeholder name (without braces)
 * @param {PlaceholderContext} context - Context data for replacement
 * @returns {string} The replacement value
 * 
 * @example
 * processPlaceholder('month-1', { referenceDate: new Date('2025-04-01'), language: 'de' })
 * // Returns "März"
 */
function processPlaceholder(placeholder: string, context: PlaceholderContext): string {
  const {
    invoice_number,
    issue_date,
    due_date,
    total,
    currency,
    client_name,
    client_email,
    client_phone,
    project_name,
    language = 'en',
    referenceDate = new Date(),
  } = context;

  // Normalize placeholder (trim and lowercase)
  const normalizedPlaceholder = placeholder.trim().toLowerCase();

  // Date placeholders
  if (normalizedPlaceholder === 'date') {
    return formatDate(referenceDate, language);
  }
  if (normalizedPlaceholder === 'month') {
    return getMonthName(referenceDate, language);
  }
  if (normalizedPlaceholder.startsWith('month-') || normalizedPlaceholder.startsWith('month+')) {
    const offsetStr = normalizedPlaceholder.substring(5).trim(); // Remove "month"
    const offset = parseInt(offsetStr, 10);
    if (!isNaN(offset)) {
      return getMonthNameWithOffset(referenceDate, offset, language);
    }
  }
  if (normalizedPlaceholder === 'year') {
    return String(referenceDate.getFullYear());
  }
  if (normalizedPlaceholder === 'day') {
    return String(referenceDate.getDate());
  }
  if (normalizedPlaceholder === 'time') {
    const hours = String(referenceDate.getHours()).padStart(2, '0');
    const minutes = String(referenceDate.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  // Invoice placeholders
  if (normalizedPlaceholder === 'invoice_number' || normalizedPlaceholder === 'invoice') {
    return invoice_number || '';
  }
  if (normalizedPlaceholder === 'issue_date') {
    return issue_date ? formatDate(issue_date, language) : '';
  }
  if (normalizedPlaceholder === 'due_date') {
    return due_date ? formatDate(due_date, language) : '';
  }
  if (normalizedPlaceholder === 'total') {
    return total !== undefined && currency ? formatCurrency(total, currency, language) : '';
  }
  if (normalizedPlaceholder === 'currency') {
    return currency || '';
  }

  // Client placeholders
  if (normalizedPlaceholder === 'client' || normalizedPlaceholder === 'client_name' || normalizedPlaceholder === 'customer') {
    return client_name || '';
  }
  if (normalizedPlaceholder === 'client_email') {
    return client_email || '';
  }
  if (normalizedPlaceholder === 'client_phone') {
    return client_phone || '';
  }

  // Project placeholders
  if (normalizedPlaceholder === 'project' || normalizedPlaceholder === 'project_name') {
    return project_name || '';
  }

  // Unknown placeholder - return empty string
  return '';
}

/**
 * Processes text containing placeholders and replaces them with actual values.
 * Placeholders use double curly-braces format: {{ placeholder }}
 * 
 * @param {string} text - Text containing placeholders
 * @param {PlaceholderContext} context - Context data for replacement
 * @returns {string} Processed text with placeholders replaced
 * 
 * @example
 * const text = "Invoice for {{client}} - {{month-1}} {{year}}";
 * const context = {
 *   client_name: "Acme Corp",
 *   referenceDate: new Date('2025-04-01'),
 *   language: 'de'
 * };
 * const result = processPlaceholders(text, context);
 * // Returns "Invoice for Acme Corp - März 2025"
 */
export function processPlaceholders(text: string, context: PlaceholderContext): string {
  if (!text) {
    return text;
  }

  // Regular expression to match {{ placeholder }} with optional whitespace
  const placeholderRegex = /\{\{\s*([^}]+)\s*\}\}/g;

  return text.replace(placeholderRegex, (match, placeholder) => {
    return processPlaceholder(placeholder, context);
  });
}

/**
 * Gets a list of all available placeholders with descriptions.
 * Useful for displaying help text in the UI.
 * 
 * @param {string} language - Language code for month examples
 * @returns {Array<{placeholder: string, description: string, example: string}>} List of placeholders
 * 
 * @example
 * const placeholders = getAvailablePlaceholders('de');
 * // Returns array like:
 * // [
 * //   { placeholder: '{{date}}', description: 'Current date', example: '01.04.2025' },
 * //   { placeholder: '{{month}}', description: 'Current month name', example: 'April' },
 * //   ...
 * // ]
 */
export function getAvailablePlaceholders(language: string = 'en'): Array<{
  placeholder: string;
  description: string;
  example: string;
}> {
  const now = new Date();
  const exampleContext: PlaceholderContext = {
    invoice_number: 'INV-20250430-001',
    issue_date: now,
    due_date: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    total: 1500.50,
    currency: 'EUR',
    client_name: 'Acme Corporation',
    client_email: 'info@acme.com',
    client_phone: '+49 123 456789',
    project_name: 'Website Redesign',
    language,
    referenceDate: now,
  };

  const placeholders = [
    { placeholder: '{{date}}', description: 'Current date' },
    { placeholder: '{{month}}', description: 'Current month name' },
    { placeholder: '{{month-1}}', description: 'Previous month name' },
    { placeholder: '{{month+1}}', description: 'Next month name' },
    { placeholder: '{{year}}', description: 'Current year' },
    { placeholder: '{{day}}', description: 'Current day of month' },
    { placeholder: '{{time}}', description: 'Current time (HH:MM)' },
    { placeholder: '{{invoice_number}}', description: 'Invoice number' },
    { placeholder: '{{issue_date}}', description: 'Invoice issue date' },
    { placeholder: '{{due_date}}', description: 'Invoice due date' },
    { placeholder: '{{total}}', description: 'Invoice total with currency' },
    { placeholder: '{{currency}}', description: 'Currency code' },
    { placeholder: '{{client}}', description: 'Client/customer name' },
    { placeholder: '{{client_email}}', description: 'Client email address' },
    { placeholder: '{{client_phone}}', description: 'Client phone number' },
    { placeholder: '{{project}}', description: 'Project name' },
  ];

  return placeholders.map(p => ({
    ...p,
    example: processPlaceholder(p.placeholder.replace(/[{}]/g, ''), exampleContext),
  }));
}
