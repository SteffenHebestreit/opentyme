import { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Receipt } from 'lucide-react';
import { Button } from '../../common/Button';

/**
 * Empty state component for the invoices list.
 *
 * **Features:**
 * - Centered layout with dashed border
 * - Receipt icon in indigo circle
 * - Descriptive message about creating invoices
 * - Call-to-action button
 * - Dark mode support
 *
 * **Usage:**
 * Display when no invoices exist to guide users to create their first invoice.
 *
 * @component
 * @example
 * <InvoiceEmptyState
 *   onCreate={() => setShowCreateModal(true)}
 * />
 *
 * @example
 * // Conditional rendering
 * {invoices.length === 0 ? (
 *   <InvoiceEmptyState onCreate={handleCreateInvoice} />
 * ) : (
 *   <InvoiceTable invoices={invoices} onView={handleView} />
 * )}
 */

/**
 * Props for the InvoiceEmptyState component.
 *
 * @interface InvoiceEmptyStateProps
 * @property {() => void} onCreate - Callback when create button is clicked
 */
interface InvoiceEmptyStateProps {
  onCreate: () => void;
}

export const InvoiceEmptyState: FC<InvoiceEmptyStateProps> = ({ onCreate }) => {
  const { t } = useTranslation('invoices');
  
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-gray-300 bg-white p-12 text-center shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-50 text-indigo-500 dark:bg-indigo-500/10">
        <Receipt className="h-8 w-8" />
      </div>
      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('empty.title')}</h3>
        <p className="max-w-md text-sm text-gray-500 dark:text-gray-400">
          {t('empty.message')}
        </p>
      </div>
      <Button type="button" onClick={onCreate}>
        {t('create')}
      </Button>
    </div>
  );
};
