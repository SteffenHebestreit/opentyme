import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { fetchPayments } from '@/api/services/payment.service';
import { Payment } from '@/api/types';
import { useApp } from '@/store/AppContext';
import { CustomSelect } from '@/components/forms';
import { fieldClasses } from '@/components/forms/fieldStyles';
import { formatCurrency } from '@/utils/currency';
import { formatDate as formatDisplayDate } from '@/utils/date';
import { cn } from '@/lib/cn';
import { PaymentDetailModal } from '@/components/business/payments/PaymentDetailModal';
import { RecordPaymentModal } from '@/components/business/invoices/RecordPaymentModal';
import { RowActionButton } from '@/components/business/invoices/RowActionButton';
import { SummaryStrip } from '@/components/business/invoices/SummaryStrip';
import { Plus, ArrowDownLeft, ArrowUpRight, Landmark, Wallet, CreditCard, Eye, Search } from 'lucide-react';
import { Table, Column, EmptyState, Alert, Badge, Button, SkeletonItem } from '@/components/common';
import type { BadgeVariant } from '@/components/common';

/**
 * Payments page component displaying payment and refund records only.
 * 
 * Features:
 * - Display payments and refunds (expenses moved to separate tab)
 * - Show payment details: invoice, client, amount, date, method
 * - Filter by date range and payment method
 * - Sort by date, amount, or client
 * - Rendered as the Payments tab of the finances page (no page chrome of its own)
 * 
 * @component
 * @returns {JSX.Element} Payments page with table and filters
 */

// Format date
const formatDate = (dateString: string) => formatDisplayDate(dateString);

// Money in (payments and tax refunds) vs. money out (refunds)
const isIncome = (payment: Payment) =>
  payment.payment_type === 'payment' ||
  (payment.payment_type as string) === 'vat_refund' ||
  (payment.payment_type as string) === 'income_tax_refund';

/**
 * Amount with an explicit direction sign ("+" in, "−" out), so the direction does not depend on
 * the green/red colour alone.
 */
const formatSignedAmount = (payment: Payment) => {
  const value = Number(payment.amount);
  const signed = isIncome(payment) ? value : -value;
  const sign = signed > 0 ? '+' : signed < 0 ? '\u2212' : '';
  return `${sign}${formatCurrency(Math.abs(value))}`;
};

interface PaymentsPageProps {
  startDate?: string;
  endDate?: string;
  onNavigateToInvoice?: (invoiceId: string) => void;
}

export default function PaymentsPage({ startDate: propStartDate, endDate: propEndDate, onNavigateToInvoice }: PaymentsPageProps = {}) {
  const { t } = useTranslation('payments');
  const { state: _state } = useApp();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>('all');
  const [paymentTypeFilter, setPaymentTypeFilter] = useState<string>('all');
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [isAddPaymentModalOpen, setIsAddPaymentModalOpen] = useState(false);

  const { data: payments = [], isLoading, error, refetch } = useQuery<Payment[]>({
    queryKey: ['payments'],
    queryFn: fetchPayments,
  });

  // Filter to show ONLY payments and refunds (exclude expenses)
  const paymentsOnly = payments.filter((payment) => 
    payment.payment_type === 'payment' || 
    payment.payment_type === 'refund' || 
    (payment.payment_type as string) === 'vat_refund' || 
    (payment.payment_type as string) === 'income_tax_refund'
  );

  // Filter payments based on search, filters, and date range
  const filteredPayments = paymentsOnly.filter((payment) => {
    const matchesSearch = 
      payment.transaction_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      payment.notes?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      payment.invoice_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      payment.client_name?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesMethod = 
      paymentMethodFilter === 'all' || 
      payment.payment_method === paymentMethodFilter;

    const matchesType =
      paymentTypeFilter === 'all' ||
      payment.payment_type === paymentTypeFilter;

    // Date range filter (if provided by parent)
    let matchesDateRange = true;
    if (propStartDate || propEndDate) {
      const paymentDate = new Date(payment.payment_date);
      if (propStartDate) {
        const start = new Date(propStartDate);
        matchesDateRange = matchesDateRange && paymentDate >= start;
      }
      if (propEndDate) {
        const end = new Date(propEndDate);
        end.setHours(23, 59, 59, 999); // Include entire end date
        matchesDateRange = matchesDateRange && paymentDate <= end;
      }
    }

    return matchesSearch && matchesMethod && matchesType && matchesDateRange;
  });


  // Get unique payment methods
  const paymentMethods = Array.from(
    new Set(paymentsOnly.map((p) => p.payment_method).filter(Boolean))
  );

  // Payment type options
  const paymentTypeOptions = [
    { value: 'all', label: t('filters.allTypes') },
    { value: 'payment', label: t('type.paymentIncome') },
    { value: 'refund', label: t('type.refundOutgoing') },
    { value: 'vat_refund', label: t('type.vat_refund') },
    { value: 'income_tax_refund', label: t('type.income_tax_refund') },
  ];

  // Payment method options
  const paymentMethodOptions = [
    { value: 'all', label: t('filters.allMethods') },
    ...paymentMethods.map(method => ({
      value: method || '',
      label: method || 'Unknown',
    })),
  ];

  const columns: Column<Payment>[] = useMemo(() => [
    {
      key: 'date',
      accessorKey: 'payment_date',
      header: t('table.date'),
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
      header: t('table.type'),
      render: (payment) => {
        const type = payment.payment_type as string;
        const variant: BadgeVariant =
          type === 'payment' ? 'green'
          : type === 'refund' ? 'red'
          : type === 'vat_refund' ? 'emerald'
          : type === 'income_tax_refund' ? 'teal'
          : 'blue';
        const icon =
          type === 'payment' ? <ArrowDownLeft className="h-3 w-3" aria-hidden="true" />
          : type === 'refund' ? <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
          : ['vat_refund', 'income_tax_refund', 'vat_payment', 'income_tax_payment', 'trade_tax_payment', 'surcharge_tax_payment'].includes(type)
          ? <Landmark className="h-3 w-3" aria-hidden="true" />
          : <Wallet className="h-3 w-3" aria-hidden="true" />;
        const label =
          type === 'payment' ? t('type.payment', { defaultValue: 'Payment' })
          : type === 'refund' ? t('type.refund', { defaultValue: 'Refund' })
          : type === 'vat_refund' ? t('type.vat_refund', { defaultValue: 'VAT Refund' })
          : type === 'income_tax_refund' ? t('type.income_tax_refund', { defaultValue: 'Tax Refund' })
          : type === 'vat_payment' ? t('type.vat_payment', { defaultValue: 'VAT Payment' })
          : type === 'income_tax_payment' ? t('type.income_tax_payment', { defaultValue: 'Income Tax' })
          : type === 'trade_tax_payment' ? t('type.trade_tax_payment', { defaultValue: 'Trade Tax' })
          : type === 'surcharge_tax_payment' ? t('type.surcharge_tax_payment', { defaultValue: 'Surcharge Tax' })
          : t('type.expense', { defaultValue: 'Expense' });
        return <Badge variant={variant} icon={icon}>{label}</Badge>;
      },
      sortable: true,
    },
    {
      key: 'client',
      accessorKey: 'client_name',
      header: t('table.client'),
      render: (payment) => (
        <span className="text-gray-900 dark:text-gray-100">
          {payment.client_name || '—'}
        </span>
      ),
      sortable: true,
    },
    {
      key: 'amount',
      accessorKey: 'amount',
      header: t('table.amount'),
      align: 'right',
      render: (payment) => (
        <span className={cn(
          'whitespace-nowrap font-semibold tabular-nums',
          isIncome(payment)
            ? 'text-emerald-600 dark:text-emerald-400'
            : 'text-red-600 dark:text-red-400'
        )}>
          {formatSignedAmount(payment)}
        </span>
      ),
      sortable: true,
      sortValue: (payment) => {
        const val = Number(payment.amount);
        const isPositive = payment.payment_type === 'payment' || 
                           (payment.payment_type as string) === 'vat_refund' || 
                           (payment.payment_type as string) === 'income_tax_refund';
        return isPositive ? val : -val;
      },
    },
    {
      key: 'method',
      accessorKey: 'payment_method',
      header: t('table.method'),
      render: (payment) => (
        <span className="text-gray-600 dark:text-gray-400">
          {payment.payment_method || '—'}
        </span>
      ),
      sortable: true,
    },
    {
      key: 'transactionId',
      accessorKey: 'transaction_id',
      header: t('table.transactionId'),
      render: (payment) => (
        <span className="font-mono text-xs text-gray-600 dark:text-gray-400">
          {payment.transaction_id || '—'}
        </span>
      ),
      sortable: true,
    },
    {
      key: 'notes',
      header: t('table.notes'),
      render: (payment) => (
        <div className="max-w-xs truncate text-gray-600 dark:text-gray-400">
          {payment.notes || '—'}
        </div>
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">{t('table.actions')}</span>,
      align: 'right',
      render: (payment) => (
        <RowActionButton label={t('view')} onClick={() => setSelectedPayment(payment)}>
          <Eye className="h-4 w-4" aria-hidden="true" />
        </RowActionButton>
      ),
    },
  ], [t]);

  if (isLoading) {
    return (
      <div className="space-y-5" aria-busy="true">
        <span className="sr-only">{t('loading', { defaultValue: 'Loading payments...' })}</span>
        <div className="space-y-2">
          <SkeletonItem className="h-5 w-32" />
          <SkeletonItem className="h-4 w-72" />
        </div>
        <SkeletonItem className="h-[5.5rem] w-full rounded-xl" />
        <div className="surface divide-y divide-gray-100 overflow-hidden dark:divide-gray-800/70">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="flex items-center gap-6 px-5 py-4">
              <SkeletonItem className="h-4 w-24" />
              <SkeletonItem className="h-5 w-20 rounded-full" />
              <SkeletonItem className="hidden h-4 w-32 sm:block" />
              <SkeletonItem className="ml-auto h-4 w-20" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert
        type="error"
        title={t('loadError', { defaultValue: 'Error loading payments' })}
        message={error instanceof Error ? error.message : t('unknownError', { defaultValue: 'An unknown error occurred' })}
      />
    );
  }

  const incomeTotal = filteredPayments
    .filter(p => p.payment_type === 'payment' || (p.payment_type as string) === 'vat_refund' || (p.payment_type as string) === 'income_tax_refund')
    .reduce((sum, p) => sum + Number(p.amount), 0);

  const refundsTotal = filteredPayments
    .reduce((sum, p) => {
      if (p.payment_type === 'payment' || (p.payment_type as string) === 'vat_refund' || (p.payment_type as string) === 'income_tax_refund') {
        return sum;
      }
      return sum + Number(p.amount);
    }, 0);

  const netTotal = filteredPayments.reduce((sum, p) => {
    // Add payments and tax refunds, subtract refunds
    if (p.payment_type === 'payment' || (p.payment_type as string) === 'vat_refund' || (p.payment_type as string) === 'income_tax_refund') {
      return sum + Number(p.amount);
    } else {
      return sum - Number(p.amount);
    }
  }, 0);

  const currencyFormat = (value: number) => formatCurrency(value);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="section-title">{t('title')}</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('subtitle')}</p>
        </div>
        <Button
          type="button"
          onClick={() => setIsAddPaymentModalOpen(true)}
          leftIcon={<Plus className="h-4 w-4" />}
        >
          {t('addPayment', { defaultValue: 'Add Payment' })}
        </Button>
      </div>

      {/* Summary */}
      <SummaryStrip
        items={[
          { key: 'transactions', label: t('summary.totalTransactions'), value: filteredPayments.length },
          { key: 'income', label: t('summary.incomePayments'), value: incomeTotal, format: currencyFormat, tone: 'text-emerald-600 dark:text-emerald-400' },
          { key: 'refunds', label: t('summary.refunds'), value: refundsTotal, format: currencyFormat, tone: 'text-red-600 dark:text-red-400' },
          {
            key: 'net',
            label: t('summary.netAmount'),
            value: netTotal,
            format: currencyFormat,
            tone: netTotal < 0 ? 'text-red-600 dark:text-red-400' : undefined,
          },
        ]}
      />

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative w-full sm:max-w-sm sm:flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500"
            aria-hidden="true"
          />
          <input
            type="search"
            placeholder={t('searchPlaceholder')}
            aria-label={t('searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={cn(fieldClasses(), 'pl-9')}
            autoComplete="off"
          />
        </div>
        <div className="grid w-full grid-cols-2 gap-3 sm:ml-auto sm:flex sm:w-auto">
          <CustomSelect
            value={paymentTypeFilter}
            onChange={setPaymentTypeFilter}
            options={paymentTypeOptions}
            size="md"
            className="sm:w-48"
            aria-label={t('filters.paymentType')}
          />
          <CustomSelect
            value={paymentMethodFilter}
            onChange={setPaymentMethodFilter}
            options={paymentMethodOptions}
            size="md"
            className="sm:w-44"
            aria-label={t('filters.paymentMethod')}
          />
        </div>
      </div>

      {/* Payments Table */}
      <Table
        data={filteredPayments}
        columns={columns}
        pageSize={10}
        onRowClick={(payment) => setSelectedPayment(payment)}
        emptyMessage={
          <EmptyState
            compact
            icon={CreditCard}
            title={t('noPayments')}
            description={
              searchTerm || paymentMethodFilter !== 'all' || paymentTypeFilter !== 'all'
                ? t('tryAdjustingFilters')
                : t('noPaymentsMessage')
            }
          />
        }
      />

      {/* Payment Detail Modal */}
      <PaymentDetailModal
        payment={selectedPayment}
        isOpen={!!selectedPayment}
        onClose={() => setSelectedPayment(null)}
        onNavigateToInvoice={(invoiceId) => {
          if (onNavigateToInvoice) {
            onNavigateToInvoice(invoiceId);
          } else {
            // Fallback: navigate directly to finances with invoice search
            navigate(`/finances?tab=invoices&search=${selectedPayment?.invoice_number || invoiceId}`);
          }
        }}
      />

      {/* Add Payment Modal */}
      <RecordPaymentModal
        isOpen={isAddPaymentModalOpen}
        onClose={() => setIsAddPaymentModalOpen(false)}
        onPaymentRecorded={() => {
          refetch(); // Refresh payments list
          setIsAddPaymentModalOpen(false);
        }}
      />
    </div>
  );
}
