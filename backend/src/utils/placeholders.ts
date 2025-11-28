/**
 * Placeholder replacement utility for invoice text templates and headlines
 * 
 * Supports dynamic placeholders like:
 * - {client_name} - Client company name
 * - {project_name} - Project name
 * - {invoice_number} - Invoice number
 * - {issue_date} - Invoice issue date
 * - {due_date} - Invoice due date
 * - {period_start} - Start date of invoiced period
 * - {period_end} - End date of invoiced period
 * - {total_amount} - Invoice total amount
 * - {currency} - Invoice currency
 * - {company_name} - User's company name
 */

interface PlaceholderData {
  client_name?: string;
  project_name?: string;
  invoice_number?: string;
  issue_date?: Date | string;
  due_date?: Date | string;
  period_start?: Date | string;
  period_end?: Date | string;
  total_amount?: number;
  currency?: string;
  company_name?: string;
  [key: string]: any;
}

/**
 * Format date to localized string
 */
function formatDate(date: Date | string | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('de-DE', { year: 'numeric', month: 'long', day: 'numeric' });
}

/**
 * Format currency amount
 */
function formatCurrency(amount: number | undefined, currency: string = 'EUR'): string {
  if (amount === undefined) return '';
  return new Intl.NumberFormat('de-DE', { 
    style: 'currency', 
    currency 
  }).format(amount);
}

/**
 * Replace placeholders in text with actual values
 * 
 * @param text - Template text with {placeholder} markers
 * @param data - Data object containing placeholder values
 * @returns Text with placeholders replaced
 */
export function replacePlaceholders(text: string, data: PlaceholderData): string {
  if (!text) return '';

  let result = text;

  // Replace basic string placeholders
  result = result.replace(/{client_name}/g, data.client_name || '');
  result = result.replace(/{project_name}/g, data.project_name || '');
  result = result.replace(/{invoice_number}/g, data.invoice_number || '');
  result = result.replace(/{company_name}/g, data.company_name || '');
  result = result.replace(/{currency}/g, data.currency || 'EUR');

  // Replace date placeholders with formatted dates
  result = result.replace(/{issue_date}/g, formatDate(data.issue_date));
  result = result.replace(/{due_date}/g, formatDate(data.due_date));
  result = result.replace(/{period_start}/g, formatDate(data.period_start));
  result = result.replace(/{period_end}/g, formatDate(data.period_end));

  // Replace amount with formatted currency
  result = result.replace(/{total_amount}/g, formatCurrency(data.total_amount, data.currency));

  // Handle period range placeholder
  if (data.period_start && data.period_end) {
    const periodText = `${formatDate(data.period_start)} - ${formatDate(data.period_end)}`;
    result = result.replace(/{period}/g, periodText);
  } else {
    result = result.replace(/{period}/g, '');
  }

  return result;
}

/**
 * Get list of available placeholders with descriptions
 */
export function getAvailablePlaceholders(): Array<{ key: string; description: string }> {
  return [
    { key: '{client_name}', description: 'Client company name' },
    { key: '{project_name}', description: 'Project name' },
    { key: '{invoice_number}', description: 'Invoice number' },
    { key: '{issue_date}', description: 'Invoice issue date' },
    { key: '{due_date}', description: 'Invoice due date' },
    { key: '{period}', description: 'Date range (start - end)' },
    { key: '{period_start}', description: 'Period start date' },
    { key: '{period_end}', description: 'Period end date' },
    { key: '{total_amount}', description: 'Invoice total with currency' },
    { key: '{currency}', description: 'Currency code' },
    { key: '{company_name}', description: 'Your company name' },
  ];
}
