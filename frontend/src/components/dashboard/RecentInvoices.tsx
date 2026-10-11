import { FC, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { FilePlus2, FileText } from 'lucide-react';
import { Invoice } from '../../api/types';
import { formatDistanceToNow, formatYmd } from '../../utils/date';
import { formatCurrency } from '../../utils/currency';
import { Button } from '../common/Button';
import { Card, CardHeader } from '../common/Card';
import { EmptyState } from '../common/EmptyState';
import { Table, Column } from '../common/Table';
import { InvoiceStatusBadge } from '../business/invoices/InvoiceStatusBadge';
import { ViewAllLink } from './DashboardSection';

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
 * Card with a table of the most recent invoices on the dashboard.
 *
 * Features:
 * - Six sortable columns: Invoice #, Client, Due Date, Amount, Status, Last Updated
 * - Status chips shared with the invoice list (InvoiceStatusBadge: colour + icon per status)
 * - Amount in the invoice's own currency, right-aligned
 * - Relative timestamp for updates
 * - Header link to the full invoice list
 * - Intentional empty state with a "Create invoice" action
 * - Horizontal scroll on narrow screens
 *
 * @component
 * @example
 * <RecentInvoices invoices={dashboardData.recentInvoices} />
 *
 * @param {RecentInvoicesProps} props - Component props
 * @returns {JSX.Element} Card with recent invoices or an empty state
 */
export const RecentInvoices: FC<RecentInvoicesProps> = ({ invoices }) => {
  const { t, i18n } = useTranslation('dashboard');
  const navigate = useNavigate();
  const locale = i18n.language;

  const columns: Column<Invoice>[] = useMemo(() => [
    {
      key: 'invoice_number',
      accessorKey: 'invoice_number',
      header: t('recentInvoices.invoice'),
      className: 'whitespace-nowrap',
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
        <span className="block max-w-[12rem] truncate text-gray-600 dark:text-gray-300">
          {invoice.client_name ?? '—'}
        </span>
      ),
      sortable: true,
    },
    {
      key: 'due_date',
      accessorKey: 'due_date',
      header: t('recentInvoices.due'),
      className: 'whitespace-nowrap',
      render: (invoice) => (
        <span className="tabular-nums text-gray-600 dark:text-gray-300">
          {formatYmd(invoice.due_date, locale)}
        </span>
      ),
      sortable: true,
    },
    {
      key: 'total_amount',
      accessorKey: 'total_amount',
      header: t('recentInvoices.amount'),
      align: 'right',
      className: 'whitespace-nowrap',
      render: (invoice) => (
        <span className="font-medium tabular-nums text-gray-900 dark:text-white">
          {formatCurrency(invoice.total_amount, invoice.currency)}
        </span>
      ),
      sortable: true,
    },
    {
      key: 'status',
      accessorKey: 'status',
      header: t('recentInvoices.status'),
      render: (invoice) => <InvoiceStatusBadge status={invoice.status} />,
      sortable: true,
    },
    {
      key: 'updated_at',
      accessorKey: 'updated_at',
      header: t('recentInvoices.updated'),
      className: 'whitespace-nowrap',
      render: (invoice) => (
        <span className="text-gray-500 dark:text-gray-400">
          {formatDistanceToNow(invoice.updated_at ?? invoice.issue_date)}
        </span>
      ),
      sortable: true,
    },
  ], [t, locale]);

  return (
    <Card className="flex h-full flex-col">
      <CardHeader
        title={t('recentInvoices.title')}
        action={<ViewAllLink to="/finances?tab=invoices">{t('recentInvoices.viewAll')}</ViewAllLink>}
      />

      {invoices.length === 0 ? (
        <EmptyState
          compact
          className="flex-1"
          icon={FileText}
          title={t('recentInvoices.noInvoices')}
          description={t('recentInvoices.createInvoice')}
          action={
            <Button
              type="button"
              variant="secondary"
              size="sm"
              leftIcon={<FilePlus2 className="h-4 w-4" />}
              onClick={() => navigate('/invoices?wizard=start')}
            >
              {t('quickActions.createInvoice')}
            </Button>
          }
        />
      ) : (
        <Table
          data={invoices}
          columns={columns}
          className="!rounded-none !border-0 !shadow-none"
          pageSize={10}
        />
      )}
    </Card>
  );
};
