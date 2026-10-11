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
import { ChevronDown, Info } from 'lucide-react';
import { fetchPlaceholders } from '../../../api/services/invoice.service';
import { SkeletonItem } from '../../common/Skeleton';
import { cn } from '../../../lib/cn';

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
    <div className="mt-2 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
      <button
        type="button"
        onClick={() => setIsCollapsed(!isCollapsed)}
        aria-expanded={!isCollapsed}
        className="flex w-full items-center justify-between gap-3 bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-purple-500 dark:bg-white/[0.03] dark:text-gray-300 dark:hover:bg-white/[0.05]"
      >
        <span>{t('placeholders.title', 'Available Placeholders')}</span>
        <ChevronDown
          className={cn('h-4 w-4 text-gray-400 transition-transform duration-200', !isCollapsed && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      <div className="collapsible" data-open={!isCollapsed}>
        <div>
          <div className="border-t border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
            {loading && (
              <div className="space-y-2" aria-busy="true">
                <span className="sr-only">{t('placeholders.loading', 'Loading placeholders...')}</span>
                <SkeletonItem className="h-8 w-full" />
                <SkeletonItem className="h-8 w-full" />
                <SkeletonItem className="h-8 w-3/4" />
              </div>
            )}

            {error && (
              <p className="text-sm text-red-600 dark:text-red-400">
                {t('placeholders.error', 'Failed to load placeholders')}
              </p>
            )}

            {!loading && !error && placeholders.length > 0 && (
              <>
                <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">
                  {t(
                    'placeholders.description',
                    'Use placeholders in your text to automatically fill in values. Copy and paste them into your text fields.'
                  )}
                </p>

                <ul className="divide-y divide-gray-100 rounded-lg border border-gray-100 dark:divide-gray-800 dark:border-gray-800">
                  {placeholders.map((ph, index) => (
                    <li
                      key={index}
                      className="flex items-start gap-3 px-3 py-2 transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.02]"
                    >
                      <code className="flex-shrink-0 select-all rounded-md bg-purple-50 px-1.5 py-0.5 font-mono text-xs text-purple-700 ring-1 ring-inset ring-purple-600/15 dark:bg-purple-500/10 dark:text-purple-300 dark:ring-purple-400/20">
                        {ph.placeholder}
                      </code>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-gray-700 dark:text-gray-300">
                          {ph.description}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                          {t('placeholders.example', 'Example')}: <span className="font-medium text-gray-700 dark:text-gray-300">{ph.example}</span>
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>

                <div className="mt-4 flex gap-2 rounded-lg bg-sky-50 p-3 text-xs text-sky-800 ring-1 ring-inset ring-sky-600/15 dark:bg-sky-500/10 dark:text-sky-200 dark:ring-sky-400/20">
                  <Info className="mt-px h-4 w-4 shrink-0 text-sky-500 dark:text-sky-400" aria-hidden="true" />
                  <p>
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
        </div>
      </div>
    </div>
  );
};

export default PlaceholderHelper;
