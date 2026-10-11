/**
 * @fileoverview Invoice detail modal component for viewing comprehensive invoice information.
 * 
 * Displays a read-only view of invoice details including header information, line items,
 * totals with tax breakdown, and payment history. Fetches invoice data on demand when
 * modal opens and provides loading and error states.
 * 
 * Features:
 * - Invoice header: number, status, issue/due dates
 * - Client and project information
 * - Custom notes display with preserved formatting
 * - Line items table: description, quantity, unit price, total
 * - Financial summary: subtotal, tax rate/amount, total
 * - Payment history table: date, method, amount
 * - Currency formatting with locale detection
 * - Loading skeleton during data fetch
 * - Error handling with retry capability
 * - Responsive layout with grid sections
 * 
 * @module components/business/invoices/InvoiceDetailModal
 */

import { FC, ReactNode, useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Ban,
  BellRing,
  Ellipsis,
  FileDown,
  FileText,
  HandCoins,
  Send,
  Wallet,
} from 'lucide-react';
import { Alert } from '../../common/Alert';
import { Badge } from '../../common/Badge';
import { Button } from '../../common/Button';
import { Dropdown, DropdownItem } from '../../common/Dropdown';
import { SkeletonItem } from '../../common/Skeleton';
import { Modal } from '../../ui/Modal';
import { Table, Column } from '../../common/Table';
import { useCancelInvoice, useInvoice, useInvoiceBillingStatus, useUpdateInvoice, useInvoices } from '../../../hooks/api/useInvoices';
import { downloadInvoicePDF } from '../../../api/services/invoice.service';
import { formatDate } from '../../../utils/date';
import { toast } from '../../../lib/toast';
import { confirmDialog } from '../../../lib/confirm';
import { cn } from '../../../lib/cn';
import { RecordPaymentModal } from './RecordPaymentModal';
import { InvoiceStatusBadge } from './InvoiceStatusBadge';
import { SendEmailModal } from '../../communication/SendEmailModal';
import { InvoiceItem, Payment } from '../../../api/types';

/**
 * Props for the InvoiceDetailModal component.
 * 
 * @interface InvoiceDetailModalProps
 * @property {boolean} open - Whether the modal is currently visible
 * @property {string | null} invoiceId - ID of the invoice to display (null when no invoice selected)
 * @property {() => void} onClose - Handler for modal close (close button or backdrop click)
 */
interface InvoiceDetailModalProps {
  open: boolean;
  invoiceId: string | null;
  onClose: () => void;
}

/**
 * Formats a numeric value as currency with locale detection.
 * 
 * Uses Intl.NumberFormat for locale-aware currency formatting. Falls back to USD
 * if the specified currency code is invalid or unsupported.
 * 
 * @function
 * @param {number} value - The numeric value to format
 * @param {string | undefined} currency - Currency code (e.g., 'USD', 'EUR', 'GBP')
 * @returns {string} Formatted currency string with symbol (e.g., '$1,234.56')
 * @example
 * formatCurrency(1234.56, 'USD') // Returns: '$1,234.56'
 * formatCurrency(1234.56, 'EUR') // Returns: '€1,234.56'
 * formatCurrency(1234.56, 'INVALID') // Falls back to: '$1,234.56'
 * formatCurrency(1234.567, 'USD') // Returns: '$1,234.57' (rounds to 2 decimals)
 */
const formatCurrency = (value: number, currency: string | undefined) => {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: 2,
    }).format(value);
  } catch (_error) {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 2,
    }).format(value);
  }
};

/**
 * Modal component for viewing detailed invoice information.
 * 
 * Displays comprehensive invoice details in a read-only format with organized sections
 * for header info, line items, financial totals, and payment history. Automatically
 * fetches invoice data when modal opens and handles loading/error states gracefully.
 * 
 * Display Sections:
 * 1. **Invoice Header**: Invoice number, status, issue/due dates (2-column grid)
 * 2. **Client & Project**: Client name and associated project (2-column grid)
 * 3. **Notes**: Custom notes with preserved whitespace/line breaks
 * 4. **Line Items Table**: Description, quantity, unit price, total (per item)
 * 5. **Financial Summary**: Subtotal, tax (rate + amount), total amount
 * 6. **Payment History**: Payment date, method, amount (if payments exist)
 * 
 * Currency Formatting:
 * - Uses invoice currency or defaults to USD
 * - Formats all monetary values consistently
 * - Handles invalid currency codes gracefully
 * - Locale-aware formatting (e.g., €1.234,56 vs $1,234.56)
 * 
 * Loading States:
 * - Shows skeleton loaders while fetching invoice data
 * - Shimmering placeholders shaped like the overview, items and totals
 * - Maintains layout during loading
 * 
 * Error Handling:
 * - Displays error Alert with message from API
 * - Provides retry button to refetch data
 * - Handles missing invoice ID gracefully
 * 
 * Data Fetching:
 * - Only fetches when modal is open and invoiceId is provided
 * - Uses useInvoice hook with conditional enabled flag
 * - Automatically refetches on retry button click
 * 
 * @component
 * @example
 * // View invoice details
 * <InvoiceDetailModal
 *   open={isDetailModalOpen}
 *   invoiceId={selectedInvoiceId}
 *   onClose={() => {
 *     setIsDetailModalOpen(false);
 *     setSelectedInvoiceId(null);
 *   }}
 * />
 * 
 * @example
 * // Open from invoice table row click
 * const handleRowClick = (invoice: Invoice) => {
 *   setSelectedInvoiceId(invoice.id);
 *   setIsDetailModalOpen(true);
 * };
 * 
 * <InvoiceDetailModal
 *   open={isDetailModalOpen}
 *   invoiceId={selectedInvoiceId}
 *   onClose={() => setIsDetailModalOpen(false)}
 * />
 * 
 * @param {InvoiceDetailModalProps} props - Component props
 * @returns {JSX.Element} Invoice detail modal component
 */
/** Opens the shared Dropdown's menu upwards — it sits in the modal's sticky footer. */
const dropUpClass =
  '[&_[role=menu]]:bottom-full [&_[role=menu]]:mb-1.5 [&_[role=menu]]:mt-0 [&_[role=menu]]:origin-bottom-right';

/** Label + value in the invoice overview grid. */
const MetaItem: FC<{ label: string; children: ReactNode; valueClassName?: string }> = ({ label, children, valueClassName }) => (
  <div className="min-w-0">
    <dt className="eyebrow">{label}</dt>
    <dd className={cn('mt-1 truncate text-sm font-medium text-gray-900 dark:text-white', valueClassName)}>{children}</dd>
  </div>
);

export const InvoiceDetailModal: FC<InvoiceDetailModalProps> = ({ open, invoiceId, onClose }) => {
  const { t } = useTranslation('invoices');
  const queryClient = useQueryClient();
  const enabled = open && Boolean(invoiceId);
  const { data, isLoading, isError, error, refetch } = useInvoice(enabled ? invoiceId ?? undefined : undefined);
  const { data: billingValidation } = useInvoiceBillingStatus(enabled ? invoiceId ?? undefined : undefined);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isDownloadingPDF, setIsDownloadingPDF] = useState(false);
  const [enableZugferd, setEnableZugferd] = useState(false);
  const [sendEmailType, setSendEmailType] = useState<'invoice' | 'reminder' | null>(null);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const cancelMutation = useCancelInvoice();
  const updateInvoice = useUpdateInvoice();
  // Fetch all invoices to offer same-client invoices as optional attachments
  const { data: allInvoices = [] } = useInvoices();

  const currency = data?.currency ?? 'USD';

  const totals = useMemo(() => {
    if (!data) {
      return null;
    }
    
    const subTotal = data.sub_total ?? 0;
    const taxRate = data.tax_rate ?? 0;
    const taxAmount = data.tax_amount ?? 0;
    const total = data.total_amount ?? 0;
    
    // Calculate total paid from payments
    // Add payments, subtract refunds and expenses
    const totalPaid = (data.payments || []).reduce((sum, payment) => {
      if (payment.payment_type === 'payment') {
        return sum + Number(payment.amount);
      } else {
        // Refunds and expenses reduce the amount paid
        return sum - Number(payment.amount);
      }
    }, 0);
    const remainingBalance = total - totalPaid;
    
    return {
      subTotal,
      taxRate,
      taxAmount,
      total,
      totalPaid,
      remainingBalance,
    };
  }, [data]);

  const handleCancelInvoice = async () => {
    if (!invoiceId || !data) return;

    const confirmed = await confirmDialog({
      title: t('cancelModal.title'),
      tone: 'danger',
      confirmLabel: t('cancelModal.yes'),
      cancelLabel: t('cancelModal.no'),
      message: (
        <div className="space-y-3">
          <p>{t('cancelModal.confirmMessage', { invoiceNumber: data.invoice_number })}</p>
          {totals && totals.totalPaid > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
              <p className="font-medium text-amber-900 dark:text-amber-100">{t('cancelModal.warning.title')}</p>
              <dl className="mt-2 space-y-0.5 tabular-nums">
                <div className="flex justify-between gap-4">
                  <dt>{t('cancelModal.warning.totalPaid')}</dt>
                  <dd>{formatCurrency(totals.totalPaid, currency)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>{t('cancelModal.warning.totalAmount')}</dt>
                  <dd>{formatCurrency(data.total_amount, currency)}</dd>
                </div>
              </dl>
              <p className="mt-2">{t('cancelModal.warning.paymentsNotice')}</p>
            </div>
          )}
          <p className="text-gray-500 dark:text-gray-400">{t('cancelModal.notice')}</p>
        </div>
      ),
    });
    if (!confirmed) return;

    cancelMutation.mutate(invoiceId, {
      onSuccess: () => {
        toast.success(t('messages.cancelSuccess'));
        void refetch();
      },
      onError: (err: unknown) => {
        console.error('Cancel invoice error:', err);
        const errorMessage = err instanceof Error ? err.message : t('messages.cancelFailed');
        toast.error(t('messages.cancelFailed'), { description: errorMessage });
      },
    });
  };

  const handleDownloadPDF = async () => {
    if (!invoiceId) return;

    try {
      setIsDownloadingPDF(true);
      await downloadInvoicePDF(invoiceId, enableZugferd);
    } catch (err) {
      console.error('Download PDF error:', err);
      toast.error(t('detail.downloadFailed'));
    } finally {
      setIsDownloadingPDF(false);
    }
  };

  const handlePaymentRecorded = () => {
    // Refetch invoice to get updated status and payments
    refetch();
  };

  const itemColumns: Column<InvoiceItem>[] = useMemo(() => [
    {
      key: 'description',
      accessorKey: 'description',
      header: t('detail.table.description'),
      render: (item) => (
        <span className="text-gray-900 dark:text-gray-100">{item.description}</span>
      ),
      sortable: true,
    },
    {
      key: 'quantity',
      accessorKey: 'quantity',
      header: t('detail.table.qty'),
      align: 'right',
      render: (item) => (
        <span className="tabular-nums text-gray-700 dark:text-gray-300">{item.quantity}</span>
      ),
      sortable: true,
    },
    {
      key: 'unitPrice',
      accessorKey: 'unit_price',
      header: t('detail.table.unitPrice'),
      align: 'right',
      render: (item) => (
        <span className="whitespace-nowrap tabular-nums text-gray-700 dark:text-gray-300">
          {formatCurrency(item.unit_price, currency)}
        </span>
      ),
      sortable: true,
    },
    {
      key: 'total',
      accessorKey: 'total_price',
      header: t('detail.table.total'),
      align: 'right',
      render: (item) => (
        <span className="whitespace-nowrap font-medium tabular-nums text-gray-900 dark:text-white">
          {formatCurrency(item.total_price, currency)}
        </span>
      ),
      sortable: true,
    },
  ], [t, currency]);

  const paymentColumns: Column<Payment>[] = useMemo(() => [
    {
      key: 'date',
      accessorKey: 'payment_date',
      header: t('detail.payments.date'),
      render: (payment) => (
        <span className="whitespace-nowrap tabular-nums text-gray-900 dark:text-gray-100">
          {formatDate(payment.payment_date)}
        </span>
      ),
      sortable: true,
    },
    {
      key: 'type',
      accessorKey: 'payment_type',
      header: t('detail.payments.type'),
      render: (payment) => {
        const isPayment = payment.payment_type === 'payment';
        const isRefund = payment.payment_type === 'refund';
        const isExpense = payment.payment_type === 'expense';
        return (
          <Badge
            variant={isPayment ? 'green' : isRefund ? 'red' : isExpense ? 'amber' : 'gray'}
            icon={
              isPayment ? (
                <ArrowDownLeft className="h-3 w-3" aria-hidden="true" />
              ) : isRefund ? (
                <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
              ) : isExpense ? (
                <Wallet className="h-3 w-3" aria-hidden="true" />
              ) : undefined
            }
          >
            {isPayment ? t('detail.payments.typePayment') : isRefund ? t('detail.payments.typeRefund') : isExpense ? t('detail.payments.typeExpense') : payment.payment_type}
          </Badge>
        );
      },
      sortable: true,
    },
    {
      key: 'method',
      accessorKey: 'payment_method',
      header: t('detail.payments.method'),
      render: (payment) => (
        <span className="text-gray-700 dark:text-gray-300">{payment.payment_method ?? '—'}</span>
      ),
      sortable: true,
    },
    {
      key: 'transactionId',
      accessorKey: 'transaction_id',
      header: t('detail.payments.transactionId'),
      render: (payment) => (
        <span className="font-mono text-xs text-gray-600 dark:text-gray-400">{payment.transaction_id ?? '—'}</span>
      ),
      sortable: true,
    },
    {
      key: 'amount',
      accessorKey: 'amount',
      header: t('detail.payments.amount'),
      align: 'right',
      render: (payment) => {
        const isPayment = payment.payment_type === 'payment';
        const isRefund = payment.payment_type === 'refund';
        const isExpense = payment.payment_type === 'expense';
        return (
          <span className={cn(
            'whitespace-nowrap font-medium tabular-nums',
            isPayment
              ? 'text-emerald-600 dark:text-emerald-400'
              : isRefund
              ? 'text-red-600 dark:text-red-400'
              : isExpense
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-gray-900 dark:text-gray-100'
          )}>
            {isPayment ? '+' : '-'}{formatCurrency(payment.amount, currency)}
          </span>
        );
      },
      sortable: true,
    },
  ], [t, currency]);

  // Check if invoice can accept payments
  // Allow payment recording even if status is 'paid' in case of adjustments, refunds, or fixing overbilling
  const canRecordPayment = data && data.status !== 'cancelled';
  const canCancelInvoice = data && data.status !== 'cancelled';

  // Less frequent actions live in the "more" menu
  const moreActions: DropdownItem[] = [];
  if (data && (data.status === 'sent' || data.status === 'overdue')) {
    moreActions.push({ label: t('detail.sendReminder'), icon: BellRing, onClick: () => setSendEmailType('reminder') });
  }
  if (canCancelInvoice) {
    if (moreActions.length > 0) {
      moreActions.push({ label: '', divider: true, onClick: () => undefined });
    }
    moreActions.push({
      label: t('detail.cancelInvoice'),
      icon: Ban,
      danger: true,
      disabled: cancelMutation.isPending,
      onClick: () => void handleCancelInvoice(),
    });
  }

  const isOverbilled = billingValidation?.status === 'overbilled';

  return (
    <>
    <Modal
      open={open}
      onClose={onClose}
      title={data?.invoice_number || t('detail.title')}
      description={
        data ? (
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
            <InvoiceStatusBadge status={data.status} size="sm" />
            {data.client_name ? <span>{data.client_name}</span> : null}
          </span>
        ) : undefined
      }
      icon={<FileText className="h-4 w-4" />}
      size="xl"
      footer={
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* ZUGFeRD option for the PDF */}
          <label
            htmlFor="zugferd-download"
            className="flex cursor-pointer items-center gap-2 text-sm text-gray-600 dark:text-gray-300"
          >
            <input
              type="checkbox"
              id="zugferd-download"
              checked={enableZugferd}
              onChange={(e) => setEnableZugferd(e.target.checked)}
              className="h-4 w-4 shrink-0 rounded border-gray-300 text-purple-600 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-900"
            />
            {t('detail.enableZugferd')}
          </label>

          {/* Actions — primary last */}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {moreActions.length > 0 && (
              <Dropdown
                align="right"
                items={moreActions}
                className={dropUpClass}
                trigger={
                  <Button
                    type="button"
                    variant="ghost"
                    className="px-2.5"
                    aria-label={t('detail.moreActions')}
                    title={t('detail.moreActions')}
                  >
                    <Ellipsis className="h-4 w-4" aria-hidden="true" />
                  </Button>
                }
              />
            )}
            <Button
              type="button"
              variant="secondary"
              leftIcon={<FileDown className="h-4 w-4" />}
              onClick={handleDownloadPDF}
              disabled={!data}
              isLoading={isDownloadingPDF}
            >
              {isDownloadingPDF ? t('detail.downloading') : t('detail.downloadPDF')}
            </Button>
            {data && (
              <Button
                type="button"
                variant="secondary"
                leftIcon={<Send className="h-4 w-4" />}
                onClick={() => setSendEmailType('invoice')}
              >
                {t('detail.sendInvoice')}
              </Button>
            )}
            {canRecordPayment && (
              <Button
                type="button"
                variant="primary"
                leftIcon={<HandCoins className="h-4 w-4" />}
                onClick={() => setIsPaymentModalOpen(true)}
              >
                {t('detail.recordPayment')}
              </Button>
            )}
          </div>
        </div>
      }
    >
      {isLoading ? (
        <div className="space-y-6" aria-busy="true">
          <div className="grid grid-cols-2 gap-4 rounded-xl border border-gray-200/70 p-4 dark:border-gray-800/70 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="space-y-2">
                <SkeletonItem className="h-3 w-16" />
                <SkeletonItem className="h-4 w-28" />
              </div>
            ))}
          </div>
          <SkeletonItem className="h-48 w-full rounded-xl" />
          <div className="ml-auto w-full max-w-sm space-y-2">
            <SkeletonItem className="h-4 w-full" />
            <SkeletonItem className="h-4 w-full" />
            <SkeletonItem className="h-5 w-full" />
          </div>
        </div>
      ) : isError ? (
        <Alert
          type="error"
          message={error instanceof Error ? error.message : t('detail.error')}
          onClose={() => {
            void refetch();
          }}
        />
      ) : data ? (
        <div className="space-y-6">
          {/* Billing Validation Warnings */}
          {billingValidation && billingValidation.status !== 'valid' && billingValidation.warnings.length > 0 && (
            <div
              className={cn(
                'flex animate-fade-in gap-3 rounded-xl border p-4 text-sm',
                isOverbilled
                  ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200'
                  : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200'
              )}
              role="alert"
            >
              <AlertTriangle
                className={cn('mt-0.5 h-5 w-5 shrink-0', isOverbilled ? 'text-red-500 dark:text-red-400' : 'text-amber-500 dark:text-amber-400')}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className={cn('font-semibold', isOverbilled ? 'text-red-900 dark:text-red-100' : 'text-amber-900 dark:text-amber-100')}>
                  {isOverbilled ? t('detail.billing.overbilled') : t('detail.billing.underbilled')}
                </p>
                <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-2 tabular-nums">
                  <div>
                    <dt className="text-xs opacity-80">{t('detail.billing.invoiceTotal')}</dt>
                    <dd className="font-medium">{formatCurrency(billingValidation.invoice_total, billingValidation.currency)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs opacity-80">{t('detail.billing.totalPaid')}</dt>
                    <dd className="font-medium">{formatCurrency(billingValidation.total_paid, billingValidation.currency)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs opacity-80">{t('detail.billing.balance')}</dt>
                    <dd className="font-semibold">{formatCurrency(billingValidation.balance, billingValidation.currency)}</dd>
                  </div>
                </dl>
                <ul
                  className={cn(
                    'mt-3 list-disc space-y-1 border-t pl-4 pt-3',
                    isOverbilled ? 'border-red-200 dark:border-red-500/20' : 'border-amber-200 dark:border-amber-500/20'
                  )}
                >
                  {billingValidation.warnings.map((warning, idx) => (
                    <li key={idx}>{warning}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Overview */}
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 rounded-xl border border-gray-200/70 bg-gray-50 p-4 dark:border-gray-800/70 dark:bg-white/[0.03] sm:grid-cols-4">
            <MetaItem label={t('detail.sections.project')}>{data.project_name ?? '—'}</MetaItem>
            <MetaItem label={t('detail.sections.issued')} valueClassName="tabular-nums">{formatDate(data.issue_date)}</MetaItem>
            <MetaItem
              label={t('detail.sections.due')}
              valueClassName={cn('tabular-nums', data.status === 'overdue' && 'text-red-600 dark:text-red-400')}
            >
              {formatDate(data.due_date)}
            </MetaItem>
            <MetaItem label={t('detail.totals.total')} valueClassName="tabular-nums">
              {formatCurrency(data.total_amount ?? 0, currency)}
            </MetaItem>
          </dl>

          {data.notes ? (
            <section>
              <h3 className="eyebrow">{t('detail.sections.notes')}</h3>
              <p className="mt-2 whitespace-pre-line text-sm text-gray-700 dark:text-gray-300">{data.notes}</p>
            </section>
          ) : null}

          {data.items && data.items.length > 0 ? (
            <section>
              <h3 className="section-title mb-3">{t('detail.sections.lineItems')}</h3>
              <Table
                data={data.items}
                columns={itemColumns}
              />
            </section>
          ) : null}

          {totals ? (
            <div className="flex justify-end">
              <dl className="w-full space-y-2 rounded-xl border border-gray-200/70 bg-gray-50 p-4 text-sm tabular-nums dark:border-gray-800/70 dark:bg-white/[0.03] sm:max-w-sm">
                <div className="flex items-center justify-between gap-4 text-gray-600 dark:text-gray-400">
                  <dt>{t('detail.totals.subtotal')}</dt>
                  <dd className="text-gray-900 dark:text-gray-100">{formatCurrency(totals.subTotal, currency)}</dd>
                </div>
                <div className="flex items-center justify-between gap-4 text-gray-600 dark:text-gray-400">
                  <dt>{t('detail.totals.tax', { rate: (totals.taxRate * 100).toFixed(0) })}</dt>
                  <dd className="text-gray-900 dark:text-gray-100">{formatCurrency(totals.taxAmount, currency)}</dd>
                </div>
                <div className="flex items-center justify-between gap-4 border-t border-gray-200 pt-2 text-base font-semibold text-gray-900 dark:border-gray-800 dark:text-white">
                  <dt>{t('detail.totals.total')}</dt>
                  <dd>{formatCurrency(totals.total, currency)}</dd>
                </div>
                {totals.totalPaid > 0 && (
                  <>
                    <div className="flex items-center justify-between gap-4 text-gray-600 dark:text-gray-400">
                      <dt>{t('detail.totals.totalPaid')}</dt>
                      <dd className="text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(totals.totalPaid, currency)}
                      </dd>
                    </div>
                    <div
                      className={cn(
                        '-mx-1 flex items-center justify-between gap-4 rounded-lg px-3 py-2 font-semibold',
                        totals.remainingBalance > 0
                          ? 'bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300'
                          : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                      )}
                    >
                      <dt>{totals.remainingBalance > 0 ? t('detail.totals.balanceDue') : t('detail.totals.paidInFull')}</dt>
                      <dd>{formatCurrency(totals.remainingBalance, currency)}</dd>
                    </div>
                  </>
                )}
              </dl>
            </div>
          ) : null}

          {data.payments && data.payments.length > 0 ? (
            <section>
              <h3 className="section-title mb-3">{t('detail.sections.payments')}</h3>
              <Table
                data={data.payments}
                columns={paymentColumns}
              />
            </section>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-gray-500 dark:text-gray-400">{t('detail.noInvoice')}</p>
      )}
    </Modal>

    {/* Record Payment Modal */}
    {data && (
      <RecordPaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        invoice={data}
        onPaymentRecorded={handlePaymentRecorded}
      />
    )}

    {/* Send Email Modal */}
    {sendEmailType && invoiceId && data && (() => {
      // Compute the invoice month as the time-report date range
      const issueDate = data.issue_date ? new Date(data.issue_date) : new Date();
      const monthStart = new Date(issueDate.getFullYear(), issueDate.getMonth(), 1)
        .toISOString().slice(0, 10);
      const monthEnd = new Date(issueDate.getFullYear(), issueDate.getMonth() + 1, 0)
        .toISOString().slice(0, 10);

      // Other non-cancelled invoices for the same client (excluding the current one)
      const otherClientInvoices = allInvoices.filter(
        (inv) => inv.client_id === data.client_id && inv.id !== invoiceId && inv.status !== 'cancelled'
      );

      return (
        <SendEmailModal
          open
          title={sendEmailType === 'invoice' ? t('detail.sendInvoice') : t('detail.sendReminder')}
          defaultTo={data.client_email ?? ''}
          defaultTemplateCategory={sendEmailType}
          attachmentOptions={[
            {
              type: 'invoice',
              label: t('detail.attachments.invoicePdf', { number: data.invoice_number ?? invoiceId }),
              invoiceId,
              defaultChecked: true,
            },
            // Other invoices for the same client — all unchecked by default
            ...otherClientInvoices.map((inv) => ({
              type: 'invoice' as const,
              label: t('detail.attachments.invoicePdf', { number: inv.invoice_number }),
              invoiceId: inv.id,
              defaultChecked: false,
            })),
            {
              type: 'report' as const,
              label: t('detail.attachments.timeReport'),
              reportType: 'time-tracking',
              dateFrom: monthStart,
              dateTo: monthEnd,
              lang: 'de',
              currency: data.currency ?? 'EUR',
              defaultChecked: false,
            },
            {
              type: 'report' as const,
              label: t('detail.attachments.expenseReport'),
              reportType: 'expense',
              dateFrom: monthStart,
              dateTo: monthEnd,
              lang: 'de',
              currency: data.currency ?? 'EUR',
              defaultChecked: false,
            },
          ]}
          onClose={() => setSendEmailType(null)}
          onSent={() => {
            setSendEmailType(null);
            if (data.status === 'draft') {
              setShowStatusDialog(true);
            } else {
              void queryClient.invalidateQueries({ queryKey: ['invoices'] });
              void refetch();
            }
          }}
        />
      );
    })()}

    {/* Post-send status dialog */}
    {showStatusDialog && invoiceId && (
      <Modal
        open
        title={t('detail.statusDialog.title')}
        icon={<Send className="h-4 w-4" />}
        onClose={() => {
          setShowStatusDialog(false);
          void queryClient.invalidateQueries({ queryKey: ['invoices'] });
          void refetch();
        }}
        size="sm"
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setShowStatusDialog(false);
                void queryClient.invalidateQueries({ queryKey: ['invoices'] });
                void refetch();
              }}
            >
              {t('detail.statusDialog.keepDraft')}
            </Button>
            <Button
              type="button"
              variant="primary"
              isLoading={updateInvoice.isPending}
              onClick={async () => {
                await updateInvoice.mutateAsync({ id: invoiceId, payload: { status: 'sent' } });
                setShowStatusDialog(false);
                void queryClient.invalidateQueries({ queryKey: ['invoices'] });
                void refetch();
              }}
            >
              {t('detail.statusDialog.markSent')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-gray-600 dark:text-gray-300">
          <Trans
            t={t}
            i18nKey="detail.statusDialog.message"
            components={{ strong: <strong className="font-semibold text-gray-900 dark:text-white" /> }}
          />
        </p>
      </Modal>
    )}
    </>
  );
};
