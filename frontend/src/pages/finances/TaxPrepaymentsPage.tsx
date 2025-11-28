import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useTaxPrepayments, useTaxPrepaymentSummary, useDeleteTaxPrepayment } from '@/hooks/api/useTaxPrepayments';
import { TaxType, TaxPrepaymentStatus, TaxPrepaymentFilters, TaxPrepayment } from '@/api/types/tax-prepayment.types';
import { AddEditTaxPrepaymentModal } from '@/components/business/tax-prepayments/AddEditTaxPrepaymentModal';
import { TaxPrepaymentDetailModal } from '@/components/business/tax-prepayments/TaxPrepaymentDetailModal';
import { CustomSelect } from '@/components/forms';
import { formatCurrency } from '@/utils/currency';
import { Table, Column } from '@/components/common/Table';

/**
 * Tax Prepayments page component for tracking VAT and income tax prepayments.
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
 * @returns {JSX.Element} Tax prepayments page with table, filters, and summary
 */

interface TaxPrepaymentsPageProps {
  taxYear?: number;
}

export default function TaxPrepaymentsPage({ taxYear: propTaxYear }: TaxPrepaymentsPageProps = {}) {
  const { t } = useTranslation('tax-prepayments');
  const [searchTerm, setSearchTerm] = useState('');
  const [taxTypeFilter, setTaxTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [yearFilter, setYearFilter] = useState<string>(propTaxYear?.toString() || 'all');
  const [quarterFilter, setQuarterFilter] = useState<string>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedPrepaymentId, setSelectedPrepaymentId] = useState<string | null>(null);

  const deleteMutation = useDeleteTaxPrepayment();

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
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

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

  // Get status badge color
  const getStatusBadgeColor = (status: TaxPrepaymentStatus) => {
    const colors = {
      paid: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      planned: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    };
    return colors[status] || 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
  };

  // Handle delete
  const handleDelete = async (id: string) => {
    if (confirm(t('messages.confirmDelete'))) {
      try {
        await deleteMutation.mutateAsync(id);
      } catch (err) {
        console.error('Error deleting tax prepayment:', err);
      }
    }
  };

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
        <div className="text-sm font-medium text-gray-900 dark:text-white">
          {prepayment.tax_type === 'vat' ? t('taxTypes.vat') : t('taxTypes.incomeTax')}
        </div>
      ),
      sortable: true,
    },
    {
      key: 'amount',
      accessorKey: 'amount',
      header: t('table.amount'),
      render: (prepayment) => (
        <div className={`text-sm font-semibold ${
          prepayment.status === 'refund' 
            ? 'text-green-600 dark:text-green-400' 
            : 'text-red-600 dark:text-red-400'
        }`}>
          {formatCurrency(prepayment.amount)}
        </div>
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
        <div className="text-sm text-gray-900 dark:text-white">
          {formatDate(prepayment.payment_date)}
        </div>
      ),
      sortable: true,
    },
    {
      key: 'period',
      accessorKey: 'period_start',
      header: t('table.period'),
      render: (prepayment) => (
        <div className="text-sm text-gray-500 dark:text-gray-400">
          {prepayment.period_start && prepayment.period_end 
            ? `${formatDate(prepayment.period_start)} - ${formatDate(prepayment.period_end)}`
            : '-'}
        </div>
      ),
      sortable: true,
    },
    {
      key: 'quarter',
      accessorKey: 'quarter',
      header: t('table.quarter'),
      render: (prepayment) => (
        <div className="text-sm text-gray-900 dark:text-white">
          {prepayment.quarter ? t(`quarters.q${prepayment.quarter}`) : '-'}
        </div>
      ),
      sortable: true,
    },
    {
      key: 'status',
      accessorKey: 'status',
      header: t('table.status'),
      render: (prepayment) => (
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getStatusBadgeColor(prepayment.status)}`}>
          {t(`status.${prepayment.status}`)}
        </span>
      ),
      sortable: true,
    },
    {
      key: 'receipt',
      header: t('table.receipt'),
      render: (prepayment) => (
        prepayment.receipt_filename ? (
          <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="text-xs">{t('table.hasReceipt')}</span>
          </div>
        ) : (
          <span className="text-xs text-gray-400 dark:text-gray-600">
            {t('table.noReceipt')}
          </span>
        )
      ),
    },
    {
      key: 'actions',
      header: t('table.actions'),
      align: 'right',
      render: (prepayment) => (
        <div className="flex justify-end gap-3">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleEdit(prepayment.id);
            }}
            className="text-purple-600 hover:text-purple-900 dark:text-purple-400 dark:hover:text-purple-300"
          >
            {t('actions.edit')}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(prepayment.id);
            }}
            className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
          >
            {t('actions.delete')}
          </button>
        </div>
      ),
    },
  ], [t]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 p-4 text-red-800 dark:bg-red-900/20 dark:text-red-300">
        <p className="font-semibold">{t('messages.errorLoading')}</p>
        <p className="text-sm mt-1">
          {error instanceof Error ? error.message : 'An unknown error occurred'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900 dark:text-white">
            {t('title')}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('subtitle')}
          </p>
        </div>
        
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 font-medium text-white transition-colors hover:bg-purple-700"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t('actions.add')}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="flex w-full flex-1 items-center gap-3">
          <div className="relative w-full xl:max-w-sm">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <svg className="h-4 w-4 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="search"
              placeholder={t('filters.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full bg-transparent border-0 border-b-2 border-gray-600 dark:border-gray-400 focus:outline-none focus:border-purple-500 dark:focus:border-purple-400 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 transition-all duration-200 ease-in-out accent-purple-500 py-2 pl-10 pr-3 text-sm"
              autoComplete="off"
            />
          </div>
        </div>
        <div className="flex gap-3">
          <CustomSelect
            label={t('fields.taxType')}
            value={taxTypeFilter}
            onChange={setTaxTypeFilter}
            options={taxTypeOptions}
            size="md"
          />
          <CustomSelect
            label={t('fields.taxYear')}
            value={yearFilter}
            onChange={setYearFilter}
            options={yearOptions}
            size="md"
          />
          <CustomSelect
            label={t('fields.quarter')}
            value={quarterFilter}
            onChange={setQuarterFilter}
            options={quarterOptions}
            size="md"
          />
          <CustomSelect
            label={t('fields.status')}
            value={statusFilter}
            onChange={setStatusFilter}
            options={statusOptions}
            size="md"
          />
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="rounded-lg border border-purple-200 bg-purple-50 p-4 dark:border-purple-900/30 dark:bg-purple-900/20">
              <div className="text-sm font-medium text-purple-600 dark:text-purple-400 mb-1">
                {t('summary.totalPrepayments')}
              </div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {formatCurrency(summary.total_vat + summary.total_income_tax)}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {summary.count} {t('summary.transactions')}
              </div>
            </div>

            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900/30 dark:bg-blue-900/20">
              <div className="text-sm font-medium text-blue-600 dark:text-blue-400 mb-1">
                {t('summary.vatAmount')}
              </div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {formatCurrency(summary.total_vat)}
              </div>
            </div>

            <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-900/30 dark:bg-green-900/20">
              <div className="text-sm font-medium text-green-600 dark:text-green-400 mb-1">
                {t('summary.incomeTaxAmount')}
              </div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {formatCurrency(summary.total_income_tax)}
              </div>
            </div>

            <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 dark:border-orange-900/30 dark:bg-orange-900/20">
              <div className="text-sm font-medium text-orange-600 dark:text-orange-400 mb-1">
                {t('summary.byYear')}
              </div>
              <div className="text-sm text-gray-900 dark:text-white space-y-1">
                {Object.entries(summary.total_by_year).map(([year, amounts]) => (
                  <div key={year} className="flex justify-between">
                    <span>{year}:</span>
                    <span className="font-semibold">{formatCurrency(amounts.vat + amounts.income_tax)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tax Prepayments Table */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <Table
          data={prepayments}
          columns={columns}
          pageSize={10}
          onRowClick={(prepayment) => handleViewDetails(prepayment.id)}
          emptyMessage={
            <div className="p-6 text-center">
              <svg
                className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">
                {t('messages.noPrepayments')}
              </h3>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                {searchTerm || taxTypeFilter !== 'all' || yearFilter !== 'all' || quarterFilter !== 'all' || statusFilter !== 'all'
                  ? t('messages.tryAdjustingFilters')
                  : t('messages.noPrepaymentsMessage')}
              </p>
            </div>
          }
          className="border-0 shadow-none"
        />
      </div>

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
