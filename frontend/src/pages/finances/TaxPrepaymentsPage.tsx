import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useTaxPrepayments, useTaxPrepaymentSummary, useDeleteTaxPrepayment } from '@/hooks/api/useTaxPrepayments';
import { TaxType, TaxPrepaymentStatus, TaxPrepaymentFilters, TaxPrepayment } from '@/api/types/tax-prepayment.types';
import { AddEditTaxPrepaymentModal } from '@/components/business/tax-prepayments/AddEditTaxPrepaymentModal';
import { TaxPrepaymentDetailModal } from '@/components/business/tax-prepayments/TaxPrepaymentDetailModal';
import { CustomSelect } from '@/components/forms';
import { fieldClasses } from '@/components/forms/fieldStyles';
import { formatCurrency } from '@/utils/currency';
import { Table, Column, StatCard, EmptyState, Badge, Button, SkeletonItem } from '@/components/common';
import { Alert } from '@/components/common/Alert';
import { BadgeVariant } from '@/components/common/Badge';
import { toast } from '@/lib/toast';
import { confirmDialog } from '@/lib/confirm';
import { cn } from '@/lib/cn';
import { CalendarDays, FileText, Landmark, Paperclip, Pencil, Plus, Receipt, Search, Trash2, Wallet } from 'lucide-react';

/**
 * Tax Prepayments page component for tracking VAT and income tax prepayments.
 *
 * Rendered as a tab inside the Finances page, so it has a section header
 * rather than a page title and adds no outer padding.
 *
 * Features:
 * - Display tax prepayments with full details (type, amount, dates, receipts)
 * - Filter by tax type, year, quarter, status
 * - Search by description
 * - Show summary statistics by tax type and year
 * - Add/edit/delete tax prepayments
 * - Upload and manage receipts
 * - Responsive design with dark mode support
 *
 * @component
 * @returns {JSX.Element} Tax prepayments section with table, filters, and summary
 */

interface TaxPrepaymentsPageProps {
  taxYear?: number;
}

const iconButtonClass =
  'rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-gray-400 dark:hover:bg-white/5';

export default function TaxPrepaymentsPage({ taxYear: propTaxYear }: TaxPrepaymentsPageProps = {}) {
  const { t, i18n } = useTranslation('tax-prepayments');
  const locale = i18n.language;
  const [searchTerm, setSearchTerm] = useState('');
  const [taxTypeFilter, setTaxTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [yearFilter, setYearFilter] = useState<string>(propTaxYear?.toString() || 'all');
  const [quarterFilter, setQuarterFilter] = useState<string>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedPrepaymentId, setSelectedPrepaymentId] = useState<string | null>(null);

  const { mutateAsync: deletePrepayment } = useDeleteTaxPrepayment();

  // Build filters for API
  const filters: TaxPrepaymentFilters = {
    tax_type: taxTypeFilter !== 'all' ? (taxTypeFilter as TaxType) : undefined,
    tax_year: yearFilter !== 'all' ? parseInt(yearFilter) : undefined,
    quarter: quarterFilter !== 'all' && quarterFilter !== 'annual' ? parseInt(quarterFilter.substring(1)) : undefined,
    status: statusFilter !== 'all' ? (statusFilter as TaxPrepaymentStatus) : undefined,
    search: searchTerm || undefined,
  };

  const { data: result, isLoading, error } = useTaxPrepayments(filters);
  const prepayments = result?.prepayments || [];
  const { data: summary } = useTaxPrepaymentSummary(yearFilter !== 'all' ? parseInt(yearFilter) : undefined);

  // Format date
  const formatDate = useCallback(
    (dateString: string) =>
      new Date(dateString).toLocaleDateString(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
    [locale]
  );

  // Get current year and generate year options
  const currentYear = new Date().getFullYear();
  const yearOptions = [
    { value: 'all', label: t('filters.allYears') },
    ...Array.from({ length: 5 }, (_, i) => {
      const year = currentYear - i;
      return { value: year.toString(), label: year.toString() };
    }),
  ];

  // Tax type options
  const taxTypeOptions = [
    { value: 'all', label: t('filters.allTypes') },
    { value: 'vat', label: t('taxTypes.vat') },
    { value: 'income_tax', label: t('taxTypes.incomeTax') },
  ];

  // Quarter options
  const quarterOptions = [
    { value: 'all', label: t('filters.allQuarters') },
    { value: 'Q1', label: t('quarters.q1') },
    { value: 'Q2', label: t('quarters.q2') },
    { value: 'Q3', label: t('quarters.q3') },
    { value: 'Q4', label: t('quarters.q4') },
    { value: 'annual', label: t('quarters.annual') },
  ];

  // Status options
  const statusOptions = [
    { value: 'all', label: t('filters.allStatuses') },
    { value: 'paid', label: t('status.paid') },
    { value: 'planned', label: t('status.planned') },
    { value: 'cancelled', label: t('status.cancelled') },
  ];

  // Get status badge variant
  const getStatusBadgeVariant = (status: TaxPrepaymentStatus): BadgeVariant => {
    const variants: Record<TaxPrepaymentStatus, BadgeVariant> = {
      paid: 'green',
      planned: 'yellow',
      cancelled: 'red',
      refund: 'blue',
    };
    return variants[status] || 'gray';
  };

  // Handle delete
  const handleDelete = useCallback(async (id: string) => {
    const confirmed = await confirmDialog({
      title: t('messages.confirmDelete'),
      tone: 'danger',
      confirmLabel: t('actions.delete'),
    });
    if (confirmed) {
      try {
        await deletePrepayment(id);
        toast.success(t('messages.deleteSuccess'));
      } catch (err) {
        console.error('Error deleting tax prepayment:', err);
        toast.error(t('messages.deleteFailed'));
      }
    }
  }, [t, deletePrepayment]);

  // Handle edit
  const handleEdit = (id: string) => {
    setSelectedPrepaymentId(id);
    setShowEditModal(true);
  };

  // Handle view details
  const handleViewDetails = (id: string) => {
    setSelectedPrepaymentId(id);
  };

  const columns: Column<TaxPrepayment>[] = useMemo(() => [
    {
      key: 'taxType',
      accessorKey: 'tax_type',
      header: t('table.taxType'),
      render: (prepayment) => (
        <div className="font-medium text-gray-900 dark:text-white">
          {prepayment.tax_type === 'vat' ? t('taxTypes.vat') : t('taxTypes.incomeTax')}
        </div>
      ),
      sortable: true,
    },
    {
      key: 'amount',
      accessorKey: 'amount',
      header: t('table.amount'),
      align: 'right',
      render: (prepayment) => (
        <span
          className={cn(
            'whitespace-nowrap font-semibold tabular-nums',
            prepayment.status === 'refund'
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-gray-900 dark:text-white'
          )}
        >
          {/* Refunds carry a "+" so they read as money in without relying on the green */}
          {prepayment.status === 'refund' && Number(prepayment.amount) > 0 && '+'}
          {formatCurrency(prepayment.amount)}
        </span>
      ),
      sortable: true,
      sortValue: (prepayment) => {
        const val = Number(prepayment.amount);
        return prepayment.status === 'refund' ? val : -val;
      },
    },
    {
      key: 'paymentDate',
      accessorKey: 'payment_date',
      header: t('table.paymentDate'),
      render: (prepayment) => (
        <span className="whitespace-nowrap tabular-nums text-gray-700 dark:text-gray-300">
          {formatDate(prepayment.payment_date)}
        </span>
      ),
      sortable: true,
    },
    {
      key: 'period',
      accessorKey: 'period_start',
      header: t('table.period'),
      render: (prepayment) => (
        <span className="whitespace-nowrap tabular-nums text-gray-500 dark:text-gray-400">
          {prepayment.period_start && prepayment.period_end
            ? `${formatDate(prepayment.period_start)} – ${formatDate(prepayment.period_end)}`
            : '—'}
        </span>
      ),
      sortable: true,
    },
    {
      key: 'quarter',
      accessorKey: 'quarter',
      header: t('table.quarter'),
      render: (prepayment) => (
        <span className="whitespace-nowrap text-gray-700 dark:text-gray-300">
          {prepayment.quarter ? t(`quarters.q${prepayment.quarter}`) : '—'}
        </span>
      ),
      sortable: true,
    },
    {
      key: 'status',
      accessorKey: 'status',
      header: t('table.status'),
      render: (prepayment) => (
        <Badge variant={getStatusBadgeVariant(prepayment.status)} dot>
          {t(`status.${prepayment.status}`)}
        </Badge>
      ),
      sortable: true,
    },
    {
      key: 'receipt',
      header: t('table.receipt'),
      render: (prepayment) => (
        prepayment.receipt_filename ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
            <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
            {t('table.hasReceipt')}
          </span>
        ) : (
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {t('table.noReceipt')}
          </span>
        )
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">{t('table.actions')}</span>,
      align: 'right',
      render: (prepayment) => (
        <div className="flex justify-end gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleEdit(prepayment.id);
            }}
            className={cn(iconButtonClass, 'hover:text-brand-600 dark:hover:text-brand-300')}
            title={t('actions.edit')}
            aria-label={t('actions.edit')}
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(prepayment.id);
            }}
            className={cn(iconButtonClass, 'hover:text-red-600 dark:hover:text-red-400')}
            title={t('actions.delete')}
            aria-label={t('actions.delete')}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ),
    },
  ], [t, formatDate, handleDelete]);

  const hasFilters =
    Boolean(searchTerm) || taxTypeFilter !== 'all' || yearFilter !== 'all' || quarterFilter !== 'all' || statusFilter !== 'all';
  const byYear = summary ? Object.entries(summary.total_by_year) : [];

  return (
    <div className="space-y-6">
      {/* Section header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="section-title">{t('title')}</h2>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{t('subtitle')}</p>
        </div>
        <Button
          type="button"
          onClick={() => setShowAddModal(true)}
          leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
          className="self-start sm:self-auto"
        >
          {t('actions.add')}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <div className="relative w-full xl:max-w-xs">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500"
            aria-hidden="true"
          />
          <input
            type="search"
            placeholder={t('filters.searchPlaceholder')}
            aria-label={t('filters.searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={cn(fieldClasses(), 'pl-9')}
            autoComplete="off"
          />
        </div>
        <div className="grid w-full grid-cols-2 gap-3 lg:grid-cols-4 xl:flex-1">
          <CustomSelect
            value={taxTypeFilter}
            onChange={setTaxTypeFilter}
            options={taxTypeOptions}
            size="md"
          />
          <CustomSelect
            value={yearFilter}
            onChange={setYearFilter}
            options={yearOptions}
            size="md"
          />
          <CustomSelect
            value={quarterFilter}
            onChange={setQuarterFilter}
            options={quarterOptions}
            size="md"
          />
          <CustomSelect
            value={statusFilter}
            onChange={setStatusFilter}
            options={statusOptions}
            size="md"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-6" aria-busy="true">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="surface p-5">
                <SkeletonItem className="h-4 w-28" />
                <SkeletonItem className="mt-3 h-7 w-32" />
              </div>
            ))}
          </div>
          <div className="surface divide-y divide-gray-100 dark:divide-gray-800">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4">
                <SkeletonItem className="h-4 w-40" />
                <SkeletonItem className="h-4 flex-1" />
                <SkeletonItem className="h-5 w-16 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      ) : error ? (
        <Alert
          type="error"
          title={t('messages.errorLoading')}
          message={error instanceof Error ? error.message : t('messages.unknownError')}
        />
      ) : (
        <>
          {/* Summary */}
          {summary && (
            <div className="stagger grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label={t('summary.totalPrepayments')}
                value={Number(summary.total_vat) + Number(summary.total_income_tax)}
                format={(value) => formatCurrency(value)}
                variant="brand"
                icon={Wallet}
                hint={`${summary.count} ${t('summary.transactions')}`}
              />

              <StatCard
                label={t('summary.vatAmount')}
                value={Number(summary.total_vat) || 0}
                format={(value) => formatCurrency(value)}
                variant="blue"
                icon={Receipt}
              />

              <StatCard
                label={t('summary.incomeTaxAmount')}
                value={Number(summary.total_income_tax) || 0}
                format={(value) => formatCurrency(value)}
                variant="green"
                icon={Landmark}
              />

              <div className="surface p-5">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('summary.byYear')}</p>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600 ring-1 ring-inset ring-orange-600/10 dark:bg-orange-500/10 dark:text-orange-400 dark:ring-orange-400/20">
                    <CalendarDays className="h-4 w-4" aria-hidden="true" />
                  </span>
                </div>
                {byYear.length > 0 ? (
                  <dl className="mt-2 max-h-28 space-y-1.5 overflow-y-auto text-sm">
                    {byYear.map(([year, amounts]) => (
                      <div key={year} className="flex items-baseline justify-between gap-4">
                        <dt className="tabular-nums text-gray-500 dark:text-gray-400">{year}</dt>
                        <dd className="font-semibold tabular-nums text-gray-900 dark:text-white">
                          {formatCurrency(amounts.vat + amounts.income_tax)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="mt-2 text-2xl font-semibold text-gray-300 dark:text-gray-700">—</p>
                )}
              </div>
            </div>
          )}

          {/* Tax Prepayments Table */}
          <Table
            data={prepayments}
            columns={columns}
            pageSize={10}
            onRowClick={(prepayment) => handleViewDetails(prepayment.id)}
            emptyMessage={
              <EmptyState
                icon={FileText}
                title={t('messages.noPrepayments')}
                description={hasFilters ? t('messages.tryAdjustingFilters') : t('messages.noPrepaymentsMessage')}
                action={
                  hasFilters ? undefined : (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => setShowAddModal(true)}
                      leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
                    >
                      {t('actions.add')}
                    </Button>
                  )
                }
              />
            }
          />
        </>
      )}

      {/* Modals */}
      {showAddModal && (
        <AddEditTaxPrepaymentModal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {showEditModal && selectedPrepaymentId && (
        <AddEditTaxPrepaymentModal
          isOpen={showEditModal}
          onClose={() => {
            setShowEditModal(false);
            setSelectedPrepaymentId(null);
          }}
          prepaymentId={selectedPrepaymentId}
        />
      )}

      {selectedPrepaymentId && !showEditModal && (
        <TaxPrepaymentDetailModal
          isOpen={!!selectedPrepaymentId}
          onClose={() => setSelectedPrepaymentId(null)}
          prepaymentId={selectedPrepaymentId}
          onEdit={() => {
            setShowEditModal(true);
          }}
        />
      )}
    </div>
  );
}
