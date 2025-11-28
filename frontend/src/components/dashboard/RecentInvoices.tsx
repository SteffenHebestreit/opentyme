import { FC, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Invoice } from '../../api/types';
import { formatDate, formatDistanceToNow } from '../../utils/date';
import clsx from 'clsx';
import { Table, Column } from '../common/Table';

/**
 * Props for the RecentInvoices component.
 * 
 * @interface RecentInvoicesProps
 * @property {Invoice[]} invoices - Array of recent invoice records
 */
interface RecentInvoicesProps {
  invoices: Invoice[];
}

/**
 * Status badge styling map.
 * Maps invoice status to Tailwind CSS classes for color-coded badges.
 * 
 * @constant
 */
const statusStyles: Record<string, string> = {
  paid: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  sent: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  draft: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
  overdue: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  cancelled: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
};

/**
 * Formats amount as USD currency.
 * 
 * @param {number} amount - Dollar amount to format
 * @returns {string} Formatted currency (e.g., "$1,234.56")
 * 
 * @example
 * formatCurrency(1234.56) // "$1,234.56"
 * formatCurrency(1000000) // "$1,000,000.00"
 */
function formatCurrency(amount: number): string {
  return amount.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  });
}

/**
 * Displays a table of recent invoices from the dashboard.
 * 
 * Features:
 * - Responsive table with horizontal scroll
 * - Six columns: Invoice #, Client, Due Date, Amount, Status, Last Updated
 * - Color-coded status badges (paid, sent, draft, overdue, cancelled)
 * - Currency formatting with locale support
 * - Relative timestamp for updates
 * - Hover effects on rows
 * - Empty state with dashed border
 * - Dark mode support
 * 
 * Status colors:
 * - Paid: emerald (green)
 * - Sent: blue
 * - Draft: gray
 * - Overdue: rose (red)
 * - Cancelled: gray (lighter)
 * 
 * @component
 * @example
 * // With invoices
 * <RecentInvoices invoices={dashboardData.recentInvoices} />
 * 
 * @example
 * // Empty state
 * <RecentInvoices invoices={[]} />
 * 
 * @param {RecentInvoicesProps} props - Component props
 * @returns {JSX.Element} Table of recent invoices or empty state
 */
export const RecentInvoices: FC<RecentInvoicesProps> = ({ invoices }) => {
  const { t } = useTranslation('dashboard');
  
  const columns: Column<Invoice>[] = useMemo(() => [
    {
      key: 'invoice_number',
      accessorKey: 'invoice_number',
      header: t('recentInvoices.invoice'),
      render: (invoice) => (
        <span className="font-medium text-gray-900 dark:text-white">
          {invoice.invoice_number}
        </span>
      ),
      sortable: true,
    },
    {
      key: 'client_name',
      accessorKey: 'client_name',
      header: t('recentInvoices.client'),
      render: (invoice) => (
        <span className="text-gray-600 dark:text-gray-300">
          {invoice.client_name ?? '—'}
        </span>
      ),
      sortable: true,
    },
    {
      key: 'due_date',
      accessorKey: 'due_date',
      header: t('recentInvoices.due'),
      render: (invoice) => (
        <span className="text-gray-600 dark:text-gray-300">
          {formatDate(invoice.due_date)}
        </span>
      ),
      sortable: true,
    },
    {
      key: 'total_amount',
      accessorKey: 'total_amount',
      header: t('recentInvoices.amount'),
      render: (invoice) => (
        <span className="font-medium text-gray-900 dark:text-white">
          {formatCurrency(invoice.total_amount)}
        </span>
      ),
      sortable: true,
    },
    {
      key: 'status',
      accessorKey: 'status',
      header: t('recentInvoices.status'),
      render: (invoice) => (
        <span
          className={clsx(
            'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold capitalize',
            statusStyles[invoice.status] ?? statusStyles.draft
          )}
        >
          {invoice.status}
        </span>
      ),
      sortable: true,
    },
    {
      key: 'updated_at',
      accessorKey: 'updated_at',
      header: t('recentInvoices.updated'),
      render: (invoice) => (
        <span className="text-gray-500 dark:text-gray-400">
          {formatDistanceToNow(invoice.updated_at ?? invoice.issue_date)}
        </span>
      ),
      sortable: true,
    },
  ], [t]);

  if (invoices.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
        {t('recentInvoices.noInvoices')}
      </div>
    );
  }

  return (
    <Table
      data={invoices}
      columns={columns}
      className="border-0 shadow-none"
      pageSize={10}
    />
  );
};
