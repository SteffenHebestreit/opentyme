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

import { FC, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Alert } from '../../common/Alert';
import { Button } from '../../common/Button';
import { Modal } from '../../ui/Modal';
import { Table, Column } from '../../common/Table';
import { useCancelInvoice, useInvoice, useInvoiceBillingStatus, useUpdateInvoice, useInvoices } from '../../../hooks/api/useInvoices';
import { downloadInvoicePDF } from '../../../api/services/invoice.service';
import { formatDate } from '../../../utils/date';
import { RecordPaymentModal } from './RecordPaymentModal';
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
 * - Animated pulse effect on placeholder elements
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
export const InvoiceDetailModal: FC<InvoiceDetailModalProps> = ({ open, invoiceId, onClose }) => {
  const { t } = useTranslation('invoices');
  const queryClient = useQueryClient();
  const enabled = open && Boolean(invoiceId);
  const { data, isLoading, isError, error, refetch } = useInvoice(enabled ? invoiceId ?? undefined : undefined);
  const { data: billingValidation } = useInvoiceBillingStatus(enabled ? invoiceId ?? undefined : undefined);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isDownloadingPDF, setIsDownloadingPDF] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [enableZugferd, setEnableZugferd] = useState(false);
  const [sendEmailType, setSendEmailType] = useState<'invoice' | 'reminder' | null>(null);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const cancelMutation = useCancelInvoice();
  const updateInvoice = useUpdateInvoice();
  // Fetch all invoices to offer same-client invoices as optional attachments
  const { data: allInvoices = [] } = useInvoices();

  const currency = data?.currency ?? 'USD';

  const handleCancelInvoice = () => {
    if (!invoiceId) return;

    cancelMutation.mutate(invoiceId, {
      onSuccess: () => {
        setShowCancelConfirm(false);
        void refetch();
      },
      onError: (err: unknown) => {
        console.error('Cancel invoice error:', err);
        const errorMessage = err instanceof Error ? err.message : 'Failed to cancel invoice';
        alert(errorMessage + '. Please try again.');
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
      alert('Failed to download PDF. Please try again.');
    } finally {
      setIsDownloadingPDF(false);
    }
  };

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
        <span className="text-gray-800 dark:text-gray-200">{item.description}</span>
      ),
      sortable: true,
    },
    {
      key: 'quantity',
      accessorKey: 'quantity',
      header: t('detail.table.qty'),
      align: 'right',
      render: (item) => (
        <span className="text-gray-700 dark:text-gray-300">{item.quantity}</span>
      ),
      sortable: true,
    },
    {
      key: 'unitPrice',
      accessorKey: 'unit_price',
      header: t('detail.table.unitPrice'),
      align: 'right',
      render: (item) => (
        <span className="text-gray-700 dark:text-gray-300">
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
        <span className="font-medium text-gray-900 dark:text-gray-100">
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
        <span className="text-gray-800 dark:text-gray-200">
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
          <span
            className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
              isPayment
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : isRefund
                ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                : isExpense
                ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                : 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400'
            }`}
          >
            {isPayment ? t('detail.payments.typePayment') : isRefund ? t('detail.payments.typeRefund') : isExpense ? t('detail.payments.typeExpense') : payment.payment_type}
          </span>
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
        <span className="text-gray-700 dark:text-gray-300">{payment.transaction_id ?? '—'}</span>
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
          <span className={`font-medium ${
            isPayment
              ? 'text-green-700 dark:text-green-400'
              : isRefund
              ? 'text-red-700 dark:text-red-400'
              : isExpense
              ? 'text-yellow-700 dark:text-yellow-400'
              : 'text-gray-900 dark:text-gray-100'
          }`}>
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

  return (
    <>
    <Modal
      open={open}
      onClose={onClose}
      title={t('detail.title')}
      size="xl"
      footer={
        <div className="flex flex-col gap-3 w-full">
          {/* ZUGFeRD Option */}
          <div className="flex items-center gap-2 px-1">
            <input
              type="checkbox"
              id="zugferd-download"
              checked={enableZugferd}
              onChange={(e) => setEnableZugferd(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:ring-offset-gray-800"
            />
            <label 
              htmlFor="zugferd-download" 
              className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer"
            >
              {t('detail.enableZugferd')}
            </label>
          </div>
          
          {/* Action Buttons */}
          <div className="flex justify-between items-center w-full">
            <div className="flex flex-wrap gap-2">
              {canRecordPayment && (
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => setIsPaymentModalOpen(true)}
                >
                  {t('detail.recordPayment')}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={handleDownloadPDF}
                disabled={isDownloadingPDF || !data}
              >
                {isDownloadingPDF ? t('detail.downloading') : t('detail.downloadPDF')}
              </Button>
              {data && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSendEmailType('invoice')}
                >
                  Send Invoice
                </Button>
              )}
              {data && (data.status === 'sent' || data.status === 'overdue') && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSendEmailType('reminder')}
                >
                  Send Reminder
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              {canCancelInvoice && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCancelConfirm(true)}
                  className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                >
                  {t('detail.cancelInvoice')}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
              >
                {t('close')}
              </Button>
            </div>
          </div>
        </div>
      }
    >
      {isLoading ? (
        <div className="space-y-4">
          <div className="h-5 w-2/5 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
          <div className="space-y-2">
            <div className="h-4 w-full animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-4 w-5/6 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
          </div>
          <div className="h-64 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800/60" />
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
              className={`rounded-lg p-4 ${
                billingValidation.status === 'overbilled'
                  ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                  : 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800'
              }`}
            >
              <div className="space-y-2">
                <div
                  className={`font-semibold text-lg ${
                    billingValidation.status === 'overbilled'
                      ? 'text-red-800 dark:text-red-200'
                      : 'text-yellow-800 dark:text-yellow-200'
                  }`}
                >
                  {billingValidation.status === 'overbilled' ? t('detail.billing.overbilled') : t('detail.billing.underbilled')}
                </div>
                <div
                  className={`text-sm ${
                    billingValidation.status === 'overbilled'
                      ? 'text-red-700 dark:text-red-300'
                      : 'text-yellow-700 dark:text-yellow-300'
                  }`}
                >
                  <div className="mb-1">
                    <strong>{t('detail.billing.invoiceTotal')}:</strong> {formatCurrency(billingValidation.invoice_total, billingValidation.currency)}
                  </div>
                  <div className="mb-1">
                    <strong>{t('detail.billing.totalPaid')}:</strong> {formatCurrency(billingValidation.total_paid, billingValidation.currency)}
                  </div>
                  <div className="mb-2 font-bold">
                    <strong>{t('detail.billing.balance')}:</strong> {formatCurrency(billingValidation.balance, billingValidation.currency)}
                  </div>
                  <div className="border-t border-current/30 pt-2">
                    {billingValidation.warnings.map((warning, idx) => (
                      <div key={idx} className="mb-1">• {warning}</div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
          
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {t('detail.sections.invoice')}
              </h3>
              <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{data.invoice_number}</p>
              <p className="text-sm text-gray-600 dark:text-gray-300">{t('detail.sections.status')}: {data.status}</p>
            </div>
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {t('detail.sections.dates')}
              </h3>
              <dl className="mt-2 space-y-1 text-sm text-gray-700 dark:text-gray-300">
                <div className="flex items-center justify-between">
                  <dt>{t('detail.sections.issued')}</dt>
                  <dd>{formatDate(data.issue_date)}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt>{t('detail.sections.due')}</dt>
                  <dd>{formatDate(data.due_date)}</dd>
                </div>
              </dl>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {t('detail.sections.client')}
              </h3>
              <p className="mt-1 text-gray-800 dark:text-gray-200">{data.client_name ?? '—'}</p>
            </div>
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {t('detail.sections.project')}
              </h3>
              <p className="mt-1 text-gray-800 dark:text-gray-200">{data.project_name ?? '—'}</p>
            </div>
          </div>

          {data.notes ? (
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {t('detail.sections.notes')}
              </h3>
              <p className="mt-2 whitespace-pre-line text-sm text-gray-700 dark:text-gray-300">{data.notes}</p>
            </div>
          ) : null}

          {data.items && data.items.length > 0 ? (
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {t('detail.sections.lineItems')}
              </h3>
              <div className="mt-3 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
                <Table
                  data={data.items}
                  columns={itemColumns}
                />
              </div>
            </div>
          ) : null}

          {totals ? (
            <div className="flex flex-col items-end gap-1">
              <dl className="w-full max-w-xs space-y-1 text-sm text-gray-700 dark:text-gray-300">
                <div className="flex items-center justify-between">
                  <dt>{t('detail.totals.subtotal')}</dt>
                  <dd>{formatCurrency(totals.subTotal, currency)}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt>{t('detail.totals.tax', { rate: (totals.taxRate * 100).toFixed(0) })}</dt>
                  <dd>{formatCurrency(totals.taxAmount, currency)}</dd>
                </div>
                <div className="flex items-center justify-between font-semibold text-gray-900 dark:text-white">
                  <dt>{t('detail.totals.total')}</dt>
                  <dd>{formatCurrency(totals.total, currency)}</dd>
                </div>
                {totals.totalPaid > 0 && (
                  <>
                    <div className="flex items-center justify-between border-t border-gray-200 pt-1 dark:border-gray-700">
                      <dt>{t('detail.totals.totalPaid')}</dt>
                      <dd className="text-green-600 dark:text-green-400">
                        {formatCurrency(totals.totalPaid, currency)}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between font-bold text-lg">
                      <dt className={totals.remainingBalance > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-green-600 dark:text-green-400'}>
                        {totals.remainingBalance > 0 ? t('detail.totals.balanceDue') : t('detail.totals.paidInFull')}
                      </dt>
                      <dd className={totals.remainingBalance > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-green-600 dark:text-green-400'}>
                        {formatCurrency(totals.remainingBalance, currency)}
                      </dd>
                    </div>
                  </>
                )}
              </dl>
            </div>
          ) : null}

          {data.payments && data.payments.length > 0 ? (
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {t('detail.sections.payments')}
              </h3>
              <div className="mt-3 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
                <Table
                  data={data.payments}
                  columns={paymentColumns}
                />
              </div>
            </div>
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

    {/* Cancel Invoice Confirmation Modal */}
    {showCancelConfirm && data && (
      <Modal
        open={showCancelConfirm}
        onClose={() => setShowCancelConfirm(false)}
        title={t('cancelModal.title')}
        size="md"
        footer={
          <div className="flex justify-end gap-2 w-full">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowCancelConfirm(false)}
              disabled={cancelMutation.isPending}
            >
              {t('cancelModal.no')}
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handleCancelInvoice}
              disabled={cancelMutation.isPending}
              className="bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800"
            >
              {cancelMutation.isPending ? t('cancelModal.cancelling') : t('cancelModal.yes')}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-gray-700 dark:text-gray-300">
            {t('cancelModal.confirmMessage', { invoiceNumber: data.invoice_number })}
          </p>
          
          {totals && totals.totalPaid > 0 && (
            <div className="rounded-md bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                    {t('cancelModal.warning.title')}
                  </h3>
                  <div className="mt-2 text-sm text-yellow-700 dark:text-yellow-300">
                    <ul className="list-disc list-inside space-y-1">
                      <li>{t('cancelModal.warning.totalPaid')}: {formatCurrency(totals.totalPaid, currency)}</li>
                      <li>{t('cancelModal.warning.totalAmount')}: {formatCurrency(data.total_amount, currency)}</li>
                    </ul>
                    <p className="mt-2">
                      {t('cancelModal.warning.paymentsNotice')}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <p className="text-sm text-gray-600 dark:text-gray-400">
            {t('cancelModal.notice')}
          </p>
        </div>
      </Modal>
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
          title={sendEmailType === 'invoice' ? 'Send Invoice' : 'Send Reminder'}
          defaultTo={data.client_email ?? ''}
          defaultTemplateCategory={sendEmailType}
          attachmentOptions={[
            {
              type: 'invoice',
              label: `Invoice PDF (${data.invoice_number ?? invoiceId})`,
              invoiceId,
              defaultChecked: true,
            },
            // Other invoices for the same client — all unchecked by default
            ...otherClientInvoices.map((inv) => ({
              type: 'invoice' as const,
              label: `Invoice PDF (${inv.invoice_number})`,
              invoiceId: inv.id,
              defaultChecked: false,
            })),
            {
              type: 'report' as const,
              label: 'Time Tracking Report',
              reportType: 'time-tracking',
              dateFrom: monthStart,
              dateTo: monthEnd,
              lang: 'de',
              currency: data.currency ?? 'EUR',
              defaultChecked: false,
            },
            {
              type: 'report' as const,
              label: 'Expense Report',
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
        title="Update Invoice Status?"
        onClose={() => {
          setShowStatusDialog(false);
          void queryClient.invalidateQueries({ queryKey: ['invoices'] });
          void refetch();
        }}
        size="sm"
        footer={
          <div className="flex justify-end gap-2 w-full">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowStatusDialog(false);
                void queryClient.invalidateQueries({ queryKey: ['invoices'] });
                void refetch();
              }}
            >
              Keep as Draft
            </Button>
            <Button
              variant="primary"
              size="sm"
              isLoading={updateInvoice.isPending}
              onClick={async () => {
                await updateInvoice.mutateAsync({ id: invoiceId, payload: { status: 'sent' } });
                setShowStatusDialog(false);
                void queryClient.invalidateQueries({ queryKey: ['invoices'] });
                void refetch();
              }}
            >
              Mark as Sent
            </Button>
          </div>
        }
      >
        <p className="text-sm text-gray-600 dark:text-gray-300">
          The email was sent successfully. Do you want to update the invoice status to <strong>Sent</strong>, or keep it as <strong>Draft</strong>?
        </p>
      </Modal>
    )}
    </>
  );
};
