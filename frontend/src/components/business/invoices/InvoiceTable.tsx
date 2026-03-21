import { FC, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { formatDate } from '../../../utils/date';
import { Invoice, InvoiceStatus } from '../../../api/types';
import { Button } from '../../common/Button';
import { Table, Column } from '../../common/Table';

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
 * - 7-column responsive table layout
 * - Color-coded status badges (draft, sent, paid, overdue, cancelled)
 * - Currency formatting with automatic currency detection
 * - Date formatting with relative timestamps
 * - Action buttons (View, Edit, Delete)
 * - Loading state for delete action
 * - Hover effects on rows
 * - Dark mode support
 * - Returns null when empty (use with InvoiceEmptyState)
 *
 * **Table Columns:**
 * 1. **Invoice**: Invoice number and project name
 * 2. **Client**: Client name
 * 3. **Status**: Color-coded status badge
 * 4. **Issue Date**: When invoice was created
 * 5. **Due Date**: Payment deadline
 * 6. **Amount**: Total with tax breakdown
 * 7. **Actions**: View, Edit, Delete buttons
 *
 * **Status Colors:**
 * - **Draft**: Gray
 * - **Sent**: Blue
 * - **Paid**: Green
 * - **Overdue**: Red
 * - **Cancelled**: Light gray
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
 *
 * @example
 * // With empty state handling
 * {invoices.length === 0 ? (
 *   <InvoiceEmptyState onCreate={handleCreate} />
 * ) : (
 *   <InvoiceTable
 *     invoices={invoices}
 *     onView={handleView}
 *     onEdit={handleEdit}
 *     onDelete={handleDelete}
 *   />
 * )}
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
 * Tailwind classes for status badge colors.
 *
 * @constant
 */
const statusClasses: Record<InvoiceStatus, string> = {
  draft: 'bg-gray-200 text-gray-700 dark:bg-gray-800/60 dark:text-gray-300',
  sent: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
  partially_paid: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200',
  paid: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
  overdue: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
  cancelled: 'bg-gray-100 text-gray-600 dark:bg-gray-800/60 dark:text-gray-400',
};

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
 * Formats invoice amount with currency symbol.
 * Falls back to USD if currency is invalid.
 *
 * @param {Invoice} invoice - Invoice with currency and amount
 * @returns {string} Formatted currency string
 */
const formatAmount = (invoice: Invoice): string => {
  try {
    const formatter = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: invoice.currency || 'USD',
      maximumFractionDigits: 2,
    });
    return formatter.format(invoice.total_amount ?? 0);
  } catch (_error) {
    return currencyFormatter.format(invoice.total_amount ?? 0);
  }
};

export const InvoiceTable: FC<InvoiceTableProps> = ({ invoices, onView, onEdit, onCorrect, onDelete, isDeletingId }) => {
  const { t } = useTranslation('invoices');

  const columns: Column<InvoiceRow>[] = useMemo(() => [
    {
      key: 'invoice',
      accessorKey: 'invoice_number',
      header: t('table.invoice'),
      render: (invoice) => (
        <>
          <div className="font-medium text-gray-900 dark:text-white">{invoice.invoice_number}</div>
          {invoice.project_name ? (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{invoice.project_name}</p>
          ) : invoice.project_id ? (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('table.project')} {invoice.project_id}</p>
          ) : null}
        </>
      ),
      sortable: true,
    },
    {
      key: 'client',
      accessorKey: 'client_name',
      header: t('table.client'),
      render: (invoice) => (
        <div className="font-medium text-gray-900 dark:text-gray-100">
          {invoice.client_name ?? '—'}
        </div>
      ),
      sortable: true,
    },
    {
      key: 'status',
      accessorKey: 'status',
      header: t('table.status'),
      render: (invoice) => (
        <span className={clsx('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold', statusClasses[invoice.status])}>
          {t(`status.${invoice.status}`)}
        </span>
      ),
      sortable: true,
    },
    {
      key: 'issueDate',
      accessorKey: 'issue_date',
      header: t('table.issueDate'),
      render: (invoice) => (
        <div className="text-gray-600 dark:text-gray-400">
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
        <div className="text-gray-600 dark:text-gray-400">
          {formatDate(invoice.due_date)}
        </div>
      ),
      sortable: true,
    },
    {
      key: 'amount',
      accessorKey: 'total_amount',
      header: t('table.amount'),
      render: (invoice) => (
        <div className="text-gray-900 dark:text-gray-100">
          <div className="font-semibold">{formatAmount(invoice)}</div>
          {invoice.status === 'partially_paid' && invoice.payments && invoice.payments.length > 0 ? (
            <>
              <p className="text-xs text-green-600 dark:text-green-400">
                {t('table.paid')}: {(() => {
                  const totalPaid = invoice.payments.reduce((sum: number, p) => {
                    return p.payment_type === 'payment' ? sum + Number(p.amount) : sum - Number(p.amount);
                  }, 0);
                  try {
                    return new Intl.NumberFormat(undefined, {
                      style: 'currency',
                      currency: invoice.currency || 'USD',
                      maximumFractionDigits: 2,
                    }).format(totalPaid);
                  } catch {
                    return currencyFormatter.format(totalPaid);
                  }
                })()}
              </p>
              <p className="text-xs font-medium text-orange-600 dark:text-orange-400">
                {t('table.due')}: {(() => {
                  const totalPaid = invoice.payments.reduce((sum: number, p) => {
                    return p.payment_type === 'payment' ? sum + Number(p.amount) : sum - Number(p.amount);
                  }, 0);
                  const remaining = (invoice.total_amount ?? 0) - totalPaid;
                  try {
                    return new Intl.NumberFormat(undefined, {
                      style: 'currency',
                      currency: invoice.currency || 'USD',
                      maximumFractionDigits: 2,
                    }).format(remaining);
                  } catch {
                    return currencyFormatter.format(remaining);
                  }
                })()}
              </p>
            </>
          ) : (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t('table.tax')}: {(() => {
                try {
                  return new Intl.NumberFormat(undefined, {
                    style: 'currency',
                    currency: invoice.currency || 'USD',
                    maximumFractionDigits: 2,
                  }).format(invoice.tax_amount ?? 0);
                } catch {
                  return currencyFormatter.format(invoice.tax_amount ?? 0);
                }
              })()}
            </p>
          )}
        </div>
      ),
      sortable: true,
      sortValue: (invoice) => Number(invoice.total_amount),
    },
    {
      key: 'actions',
      header: t('table.actions'),
      align: 'right',
      render: (invoice) => {
        const isDraft = invoice.status === 'draft';
        const isCancelled = invoice.status === 'cancelled';
        const canEdit = isDraft;
        const canCorrect = !isDraft && !isCancelled && onCorrect;
        const canDelete = isDraft; // Only draft invoices can be deleted
        
        return (
          <div className="flex justify-end gap-2">
            <Button 
              type="button" 
              size="sm" 
              variant="ghost" 
              onClick={(e) => {
                e.stopPropagation();
                onView(invoice);
              }}
            >
              {t('view')}
            </Button>
            {canEdit && (
              <Button 
                type="button" 
                size="sm" 
                variant="outline" 
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(invoice);
                }}
              >
                {t('edit')}
              </Button>
            )}
            {canCorrect && (
              <Button 
                type="button" 
                size="sm" 
                variant="outline"
                className="text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300"
                onClick={(e) => {
                  e.stopPropagation();
                  onCorrect(invoice);
                }}
              >
                {t('correct')}
              </Button>
            )}
            {canDelete && (
              <Button
                type="button"
                size="sm"
                variant="danger"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(invoice);
                }}
                disabled={isDeletingId === invoice.id}
              >
                {isDeletingId === invoice.id ? t('deleting') : t('delete')}
              </Button>
            )}
          </div>
        );
      },
    },
  ], [t, onView, onEdit, onCorrect, onDelete, isDeletingId]);
  
  return <Table data={invoices} columns={columns} onRowClick={onView} pageSize={10} />;
};
