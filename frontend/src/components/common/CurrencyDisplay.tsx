/**
 * @fileoverview Currency display component for consistent formatting of monetary values.
 * 
 * Provides a reusable component for displaying currency amounts with proper formatting,
 * localization, and styling. Handles different currencies, color coding for positive/negative
 * values, and optional prefix symbols.
 * 
 * @module components/common/CurrencyDisplay
 */

import { FC } from 'react';
import { formatCurrency } from '../../utils/currency';

/**
 * Props for the CurrencyDisplay component.
 * 
 * @interface CurrencyDisplayProps
 * @property {number | string} value - The numeric value to display
 * @property {string} [currency='USD'] - ISO 4217 currency code (e.g., 'USD', 'EUR', 'GBP')
 * @property {string} [className] - Additional CSS classes to apply
 * @property {boolean} [showSign=false] - Whether to show +/- prefix for positive/negative values
 * @property {boolean} [colorize=false] - Whether to color code positive (green) and negative (red) values
 */
interface CurrencyDisplayProps {
  value: number | string;
  currency?: string;
  className?: string;
  showSign?: boolean;
  colorize?: boolean;
}

/**
 * Component for displaying currency amounts with consistent formatting.
 * 
 * Automatically formats the value using Intl.NumberFormat with the specified currency.
 * Supports optional features like +/- signs, color coding, and custom styling.
 * 
 * Features:
 * - Automatic locale detection for proper formatting
 * - Support for all major world currencies
 * - Optional +/- sign prefix
 * - Optional color coding (green for positive, red for negative)
 * - Custom className support
 * - Handles invalid values gracefully
 * 
 * @component
 * @example
 * // Basic usage
 * <CurrencyDisplay value={1234.56} currency="USD" />
 * // Output: $1,234.56
 * 
 * @example
 * // With sign and color
 * <CurrencyDisplay 
 *   value={-500} 
 *   currency="EUR" 
 *   showSign 
 *   colorize 
 * />
 * // Output: -€500.00 (in red)
 * 
 * @example
 * // Custom styling
 * <CurrencyDisplay 
 *   value={1000} 
 *   currency="GBP" 
 *   className="text-lg font-bold"
 * />
 * // Output: £1,000.00 (with custom styles)
 */
export const CurrencyDisplay: FC<CurrencyDisplayProps> = ({
  value,
  currency = 'USD',
  className = '',
  showSign = false,
  colorize = false,
}) => {
  const numericValue = typeof value === 'string' ? parseFloat(value) : value;
  const isNegative = numericValue < 0;
  const isPositive = numericValue > 0;
  
  // Format the currency
  const formattedValue = formatCurrency(Math.abs(numericValue), currency);
  
  // Determine sign prefix
  let sign = '';
  if (showSign) {
    if (isPositive) {
      sign = '+';
    } else if (isNegative) {
      sign = '-';
    }
  } else if (isNegative) {
    sign = '-';
  }
  
  // Determine color classes
  let colorClass = '';
  if (colorize) {
    if (isPositive) {
      colorClass = 'text-green-700 dark:text-green-400';
    } else if (isNegative) {
      colorClass = 'text-red-700 dark:text-red-400';
    }
  }
  
  const combinedClassName = `${colorClass} ${className}`.trim();
  
  return (
    <span className={combinedClassName}>
      {sign}{formattedValue}
    </span>
  );
};
