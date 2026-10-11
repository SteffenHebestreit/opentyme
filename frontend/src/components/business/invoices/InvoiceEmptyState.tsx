import { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Receipt, SearchX } from 'lucide-react';
import { Button } from '../../common/Button';
import { EmptyState } from '../../common/EmptyState';

/**
 * Empty state component for the invoices list.
 *
 * **Features:**
 * - Centered layout with dashed border (shared EmptyState)
 * - Receipt icon
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
 * @property {boolean} [filtered] - Invoices exist but none match the current filters
 * @property {() => void} [onClearFilters] - Resets the list filters (shown when filtered)
 */
interface InvoiceEmptyStateProps {
  onCreate: () => void;
  filtered?: boolean;
  onClearFilters?: () => void;
}

export const InvoiceEmptyState: FC<InvoiceEmptyStateProps> = ({ onCreate, filtered = false, onClearFilters }) => {
  const { t } = useTranslation('invoices');

  if (filtered) {
    return (
      <EmptyState
        bordered
        icon={SearchX}
        title={t('noInvoices')}
        description={t('empty.filteredMessage')}
        action={
          onClearFilters ? (
            <Button type="button" variant="secondary" onClick={onClearFilters}>
              {t('filters.clear')}
            </Button>
          ) : undefined
        }
      />
    );
  }
  
  return (
    <EmptyState
      bordered
      icon={Receipt}
      title={t('empty.title')}
      description={t('empty.message')}
      action={
        <Button type="button" onClick={onCreate} leftIcon={<Plus className="h-4 w-4" />}>
          {t('create')}
        </Button>
      }
    />
  );
};
