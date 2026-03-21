/**
 * @fileoverview Placeholder helper component for invoice and template text fields.
 * 
 * Displays a list of available placeholders with descriptions and examples.
 * Can be shown as an expandable section below text inputs.
 * 
 * @module components/business/invoices/PlaceholderHelper
 */

import { FC, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { fetchPlaceholders } from '../../../api/services/invoice.service';

/**
 * Props for the PlaceholderHelper component.
 * 
 * @interface PlaceholderHelperProps
 * @property {boolean} [collapsed] - Whether to start collapsed (default: true)
 */
interface PlaceholderHelperProps {
  collapsed?: boolean;
}

/**
 * Structure of a placeholder returned from the API.
 * 
 * @interface Placeholder
 * @property {string} placeholder - The placeholder syntax (e.g., "{{month-1}}")
 * @property {string} description - Human-readable description
 * @property {string} example - Example output value
 */
interface Placeholder {
  placeholder: string;
  description: string;
  example: string;
}

/**
 * PlaceholderHelper component displays available invoice placeholders.
 * Shows syntax, description, and example values for each placeholder.
 * 
 * @component
 * @example
 * // Usage in a form with text fields:
 * <Textarea
 *   label="Invoice Text"
 *   value={invoiceText}
 *   onChange={handleChange}
 * />
 * <PlaceholderHelper />
 */
export const PlaceholderHelper: FC<PlaceholderHelperProps> = ({ collapsed = true }) => {
  const { t, i18n } = useTranslation('invoices');
  const [isCollapsed, setIsCollapsed] = useState(collapsed);
  const [placeholders, setPlaceholders] = useState<Placeholder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadPlaceholders = async () => {
      try {
        setLoading(true);
        const data = await fetchPlaceholders(i18n.language);
        setPlaceholders(data);
        setError(null);
      } catch (err: any) {
        console.error('Failed to load placeholders:', err);
        const errorMessage = err.response?.data?.message || err.message || 'Failed to load placeholders';
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    loadPlaceholders();
  }, [i18n.language]);

  return (
    <div className="mt-2 border border-gray-200 dark:border-gray-700 rounded-md">
      <button
        type="button"
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center justify-between px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-t-md transition-colors"
      >
        <span>{t('placeholders.title', 'Available Placeholders')}</span>
        {isCollapsed ? (
          <ChevronDown className="w-5 h-5" />
        ) : (
          <ChevronUp className="w-5 h-5" />
        )}
      </button>

      {!isCollapsed && (
        <div className="p-4 bg-white dark:bg-gray-900">
          {loading && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('placeholders.loading', 'Loading placeholders...')}
            </p>
          )}

          {error && (
            <p className="text-sm text-red-500">
              {t('placeholders.error', 'Failed to load placeholders')}
            </p>
          )}

          {!loading && !error && placeholders.length > 0 && (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                {t(
                  'placeholders.description',
                  'Use placeholders in your text to automatically fill in values. Copy and paste them into your text fields.'
                )}
              </p>

              <div className="space-y-2">
                {placeholders.map((ph, index) => (
                  <div
                    key={index}
                    className="flex items-start gap-3 p-2 rounded bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <code className="flex-shrink-0 px-2 py-1 text-xs font-mono text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 rounded">
                      {ph.placeholder}
                    </code>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700 dark:text-gray-300">
                        {ph.description}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {t('placeholders.example', 'Example')}: <span className="font-medium">{ph.example}</span>
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
                <p className="text-xs text-blue-800 dark:text-blue-300">
                  <strong>{t('placeholders.tip', 'Tip')}:</strong>{' '}
                  {t(
                    'placeholders.tipText',
                    'Placeholders are processed when the invoice is created or updated. They will show the actual values in the final invoice.'
                  )}
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default PlaceholderHelper;
