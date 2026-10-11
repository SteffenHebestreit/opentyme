import { FC, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, FilePen, LoaderCircle, Pencil, Trash2 } from 'lucide-react';
import { formatDate } from '../../../utils/date';
import { Invoice } from '../../../api/types';
import { Table, Column } from '../../common/Table';
import { cn } from '../../../lib/cn';
import { InvoiceStatusBadge } from './InvoiceStatusBadge';
import { RowActionButton } from './RowActionButton';

/**
 * Extended invoice type with optional project name and payments.
 *
 * @type {InvoiceRow}
 */
type InvoiceRow = Invoice & {
  project_name?: string | null;
  payments?: Array<{
    id: string;
    amount: number;
    payment_type: 'payment' | 'refund' | 'expense';
    payment_date: string;
    payment_method?: string | null;
    transaction_id?: string | null;
  }>;
};

/**
 * Table component for displaying invoices.
 *
 * **Features:**
 * - 7-column responsive table layout (scrolls horizontally on narrow screens)
 * - Status chips with one semantic colour per status (see InvoiceStatusBadge)
 * - Right-aligned, tabular amounts in the invoice currency
 * - Compact icon actions (View, Edit, Correct, Delete) with accessible labels
 * - Loading state for delete action
 * - Returns the shared Table's empty state when empty (use with InvoiceEmptyState)
 *
 * **Table Columns:**
 * 1. **Invoice**: Invoice number and project name
 * 2. **Client**: Client name
 * 3. **Status**: Status chip
 * 4. **Issue Date**: When invoice was created
 * 5. **Due Date**: Payment deadline (red when overdue)
 * 6. **Amount**: Total with tax / paid / due breakdown
 * 7. **Actions**: View, Edit, Correct, Delete
 *
 * @component
 * @example
 * <InvoiceTable
 *   invoices={invoices}
 *   onView={(invoice) => setSelectedInvoice(invoice)}
 *   onEdit={(invoice) => openEditModal(invoice)}
 *   onDelete={handleDeleteInvoice}
 *   isDeletingId={deletingInvoiceId}
 * />
 */

/**
 * Props for the InvoiceTable component.
 *
 * @interface InvoiceTableProps
 * @property {InvoiceRow[]} invoices - Array of invoices to display
 * @property {(invoice: InvoiceRow) => void} onView - Callback when View button clicked
 * @property {(invoice: InvoiceRow) => void} onEdit - Callback when Edit button clicked
 * @property {(invoice: InvoiceRow) => void} onDelete - Callback when Delete button clicked
 * @property {string | null} [isDeletingId] - ID of invoice currently being deleted
 */
interface InvoiceTableProps {
  invoices: InvoiceRow[];
  onView: (invoice: InvoiceRow) => void;
  onEdit: (invoice: InvoiceRow) => void;
  onCorrect?: (invoice: InvoiceRow) => void;
  onDelete: (invoice: InvoiceRow) => void;
  isDeletingId?: string | null;
}

/**
 * Fallback currency formatter for USD.
 *
 * @constant
 */
const currencyFormatter = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});

/**
 * Formats a value in the invoice's currency.
 * Falls back to USD if the currency is invalid.
 */
const formatInCurrency = (value: number, currency: string | undefined): string => {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: 2,
    }).format(value);
  } catch (_error) {
    return currencyFormatter.format(value);
  }
};

/** Net amount received for an invoice: payments add, refunds and expenses subtract. */
const sumPaid = (payments: NonNullable<InvoiceRow['payments']>): number =>
  payments.reduce((sum: number, p) => (p.payment_type === 'payment' ? sum + Number(p.amount) : sum - Number(p.amount)), 0);

export const InvoiceTable: FC<InvoiceTableProps> = ({ invoices, onView, onEdit, onCorrect, onDelete, isDeletingId }) => {
  const { t } = useTranslation('invoices');

  const columns: Column<InvoiceRow>[] = useMemo(() => [
    {
      key: 'invoice',
      accessorKey: 'invoice_number',
      header: t('table.invoice'),
      render: (invoice) => (
        <div className="min-w-0">
          <div className="whitespace-nowrap font-medium text-gray-900 dark:text-white">{invoice.invoice_number}</div>
          {invoice.project_name ? (
            <p className="mt-0.5 max-w-[16rem] truncate text-xs text-gray-500 dark:text-gray-400">{invoice.project_name}</p>
          ) : invoice.project_id ? (
            <p className="mt-0.5 max-w-[16rem] truncate text-xs text-gray-500 dark:text-gray-400">{t('table.project')} {invoice.project_id}</p>
          ) : null}
        </div>
      ),
      sortable: true,
    },
    {
      key: 'client',
      accessorKey: 'client_name',
      header: t('table.client'),
      render: (invoice) => (
        <div className="text-gray-900 dark:text-gray-100">
          {invoice.client_name ?? '—'}
        </div>
      ),
      sortable: true,
    },
    {
      key: 'status',
      accessorKey: 'status',
      header: t('table.status'),
      render: (invoice) => <InvoiceStatusBadge status={invoice.status} />,
      sortable: true,
    },
    {
      key: 'issueDate',
      accessorKey: 'issue_date',
      header: t('table.issueDate'),
      render: (invoice) => (
        <div className="whitespace-nowrap tabular-nums text-gray-600 dark:text-gray-400">
          {formatDate(invoice.issue_date)}
        </div>
      ),
      sortable: true,
    },
    {
      key: 'dueDate',
      accessorKey: 'due_date',
      header: t('table.dueDate'),
      render: (invoice) => (
        <div
          className={cn(
            'whitespace-nowrap tabular-nums',
            invoice.status === 'overdue'
              ? 'font-medium text-red-600 dark:text-red-400'
              : 'text-gray-600 dark:text-gray-400'
          )}
        >
          {formatDate(invoice.due_date)}
        </div>
      ),
      sortable: true,
    },
    {
      key: 'amount',
      accessorKey: 'total_amount',
      header: t('table.amount'),
      align: 'right',
      render: (invoice) => (
        <div className="whitespace-nowrap tabular-nums">
          <div className="font-semibold text-gray-900 dark:text-white">
            {formatInCurrency(invoice.total_amount ?? 0, invoice.currency)}
          </div>
          {invoice.status === 'partially_paid' && invoice.payments && invoice.payments.length > 0 ? (
            <>
              <p className="text-xs text-emerald-600 dark:text-emerald-400">
                {t('table.paid')}: {formatInCurrency(sumPaid(invoice.payments), invoice.currency)}
              </p>
              <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
                {t('table.due')}: {formatInCurrency((invoice.total_amount ?? 0) - sumPaid(invoice.payments), invoice.currency)}
              </p>
            </>
          ) : (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t('table.tax')}: {formatInCurrency(invoice.tax_amount ?? 0, invoice.currency)}
            </p>
          )}
        </div>
      ),
      sortable: true,
      sortValue: (invoice) => Number(invoice.total_amount),
    },
    {
      key: 'actions',
      header: <span className="sr-only">{t('table.actions')}</span>,
      align: 'right',
      render: (invoice) => {
        const isDraft = invoice.status === 'draft';
        const isCancelled = invoice.status === 'cancelled';
        const canEdit = isDraft;
        const canCorrect = !isDraft && !isCancelled && onCorrect;
        const canDelete = isDraft; // Only draft invoices can be deleted
        const isDeleting = isDeletingId === invoice.id;

        return (
          <div className="flex items-center justify-end gap-0.5">
            <RowActionButton label={t('view')} onClick={() => onView(invoice)}>
              <Eye className="h-4 w-4" aria-hidden="true" />
            </RowActionButton>
            {canEdit && (
              <RowActionButton label={t('edit')} onClick={() => onEdit(invoice)}>
                <Pencil className="h-4 w-4" aria-hidden="true" />
              </RowActionButton>
            )}
            {canCorrect && (
              <RowActionButton label={t('correct')} tone="warning" onClick={() => onCorrect(invoice)}>
                <FilePen className="h-4 w-4" aria-hidden="true" />
              </RowActionButton>
            )}
            {canDelete && (
              <RowActionButton
                label={isDeleting ? t('deleting') : t('delete')}
                tone="danger"
                onClick={() => onDelete(invoice)}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                )}
              </RowActionButton>
            )}
          </div>
        );
      },
    },
  ], [t, onView, onEdit, onCorrect, onDelete, isDeletingId]);

  return <Table data={invoices} columns={columns} onRowClick={onView} pageSize={10} />;
};
