/**
 * Placeholder utility for invoice text templates and headlines
 * Provides preview of placeholders in the frontend
 */

export interface PlaceholderInfo {
  key: string;
  label: string;
  example: string;
}

/**
 * Get list of available placeholders with examples
 */
export const AVAILABLE_PLACEHOLDERS: PlaceholderInfo[] = [
  { key: '{client_name}', label: 'Client Name', example: 'ACME Corp' },
  { key: '{project_name}', label: 'Project Name', example: 'Website Redesign' },
  { key: '{invoice_number}', label: 'Invoice Number', example: 'INV-2025-001' },
  { key: '{issue_date}', label: 'Issue Date', example: '31. Oktober 2025' },
  { key: '{due_date}', label: 'Due Date', example: '30. November 2025' },
  { key: '{period}', label: 'Period Range', example: '1. August 2025 - 31. August 2025' },
  { key: '{period_start}', label: 'Period Start', example: '1. August 2025' },
  { key: '{period_end}', label: 'Period End', example: '31. August 2025' },
  { key: '{total_amount}', label: 'Total Amount', example: '5.000,00 €' },
  { key: '{currency}', label: 'Currency', example: 'EUR' },
  { key: '{company_name}', label: 'Your Company', example: 'My Company GmbH' },
];

/**
 * Get preview text with example placeholder values
 */
export function getPlaceholderPreview(text: string): string {
  if (!text) return '';
  
  let preview = text;
  AVAILABLE_PLACEHOLDERS.forEach(({ key, example }) => {
    preview = preview.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), example);
  });
  
  return preview;
}

/**
 * Insert placeholder at cursor position
 */
export function insertPlaceholder(
  currentValue: string,
  placeholder: string,
  cursorPosition: number
): { newValue: string; newCursorPosition: number } {
  const before = currentValue.substring(0, cursorPosition);
  const after = currentValue.substring(cursorPosition);
  const newValue = before + placeholder + after;
  const newCursorPosition = cursorPosition + placeholder.length;
  
  return { newValue, newCursorPosition };
}
