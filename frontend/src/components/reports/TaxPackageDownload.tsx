/**
 * @fileoverview Tax Package Download Component
 *
 * Provides UI for generating and downloading complete tax packages:
 * - Year selection from available data
 * - Content options (invoices, expenses, receipts, reports)
 * - Package size estimate preview
 * - Download as ZIP
 *
 * @module components/reports/TaxPackageDownload
 */

import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Download,
  FileText,
  Receipt,
  Calculator,
  FileSpreadsheet,
  FolderArchive,
  Landmark,
  Package,
  type LucideIcon,
} from 'lucide-react';
import {
  getAvailableYears,
  getPackageEstimate,
  downloadTaxPackage,
  PackageEstimate,
  TaxPackageOptions,
} from '../../api/services/tax-package.service';
import { Button } from '../common/Button';
import { Alert } from '../common/Alert';
import { AnimatedNumber } from '../common/AnimatedNumber';
import { EmptyState } from '../common/EmptyState';
import { SkeletonItem } from '../common/Skeleton';
import { fieldClasses, fieldLabelClass } from '../forms/fieldStyles';
import { cn } from '../../lib/cn';

interface TaxPackageDownloadProps {
  onClose?: () => void;
}

const checkboxClass =
  'h-4 w-4 shrink-0 rounded border-gray-300 text-brand-600 accent-brand-600 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-900';

/** One selectable part of the package. */
function ContentOption({
  icon: Icon,
  tone,
  checked,
  onChange,
  title,
  detail,
}: {
  icon: LucideIcon;
  tone: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  detail?: ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.02]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className={checkboxClass}
      />
      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset', tone)}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">{title}</span>
        {detail && <span className="block text-xs tabular-nums text-gray-500 dark:text-gray-400">{detail}</span>}
      </span>
    </label>
  );
}

export default function TaxPackageDownload({ onClose }: TaxPackageDownloadProps) {
  const { t, i18n } = useTranslation('reports');
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [estimate, setEstimate] = useState<PackageEstimate | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isLoadingEstimate, setIsLoadingEstimate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Options state
  const [includeInvoicePDFs, setIncludeInvoicePDFs] = useState(true);
  const [includeExpenseReceipts, setIncludeExpenseReceipts] = useState(true);
  const [includePrepaymentReceipts, setIncludePrepaymentReceipts] = useState(true);
  const [includeReports, setIncludeReports] = useState(true);
  const [includeExcel, setIncludeExcel] = useState(true);

  // Date range override (optional)
  const [useCustomDateRange, setUseCustomDateRange] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Load available years on mount
  useEffect(() => {
    async function loadYears() {
      try {
        setIsLoading(true);
        const years = await getAvailableYears();
        setAvailableYears(years);

        // Select current year if available, otherwise first available
        const currentYear = new Date().getFullYear();
        const previousYear = currentYear - 1;
        if (years.includes(previousYear)) {
          setSelectedYear(previousYear);
        } else if (years.includes(currentYear)) {
          setSelectedYear(currentYear);
        } else if (years.length > 0) {
          setSelectedYear(years[0]);
        }
      } catch (err: any) {
        setError(err.message || t('taxPackage.loadYearsError'));
      } finally {
        setIsLoading(false);
      }
    }
    loadYears();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load estimate when year changes
  useEffect(() => {
    async function loadEstimate() {
      if (!selectedYear) return;

      try {
        setIsLoadingEstimate(true);
        const est = await getPackageEstimate(
          selectedYear,
          useCustomDateRange ? startDate : undefined,
          useCustomDateRange ? endDate : undefined
        );
        setEstimate(est);

        // Update date range from estimate if not using custom
        if (!useCustomDateRange) {
          setStartDate(est.startDate);
          setEndDate(est.endDate);
        }
      } catch (err: any) {
        console.error('Failed to load estimate:', err);
      } finally {
        setIsLoadingEstimate(false);
      }
    }
    loadEstimate();
  }, [selectedYear, useCustomDateRange, startDate, endDate]);

  const handleDownload = async () => {
    if (!selectedYear) return;

    try {
      setIsDownloading(true);
      setError(null);

      const options: TaxPackageOptions = {
        year: selectedYear,
        startDate: useCustomDateRange ? startDate : undefined,
        endDate: useCustomDateRange ? endDate : undefined,
        lang: i18n.language === 'de' ? 'de' : 'en',
        currency: 'EUR',
        includeInvoicePDFs,
        includeExpenseReceipts,
        includePrepaymentReceipts,
        includeReports,
        includeExcel,
      };

      await downloadTaxPackage(options);
    } catch (err: any) {
      setError(err.message || t('taxPackage.downloadError'));
    } finally {
      setIsDownloading(false);
    }
  };

  // Calculate estimated file count
  const estimatedFileCount = estimate
    ? (includeReports ? 3 : 0) +  // Cover + 2 reports
      (includeInvoicePDFs ? estimate.invoicesWithPDF : 0) +
      (includeExpenseReceipts ? estimate.expensesWithReceipts : 0) +
      (includePrepaymentReceipts ? estimate.taxPrepaymentsWithReceipts : 0) +
      (includeExcel ? 1 : 0)
    : 0;

  const header = (
    <div className="flex items-start gap-3 border-b border-gray-100 px-5 py-4 sm:px-6 dark:border-gray-800">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-600/10 dark:bg-brand-500/10 dark:text-brand-300 dark:ring-brand-400/20">
        <FolderArchive className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <h2 className="section-title">{t('taxPackage.title')}</h2>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{t('taxPackage.description')}</p>
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <section className="surface animate-fade-up overflow-hidden" aria-busy="true">
        {header}
        <div className="space-y-4 px-5 py-5 sm:px-6">
          <SkeletonItem className="h-4 w-24" />
          <div className="flex gap-2">
            <SkeletonItem className="h-9 w-20 rounded-full" />
            <SkeletonItem className="h-9 w-20 rounded-full" />
            <SkeletonItem className="h-9 w-20 rounded-full" />
          </div>
          <SkeletonItem className="h-40 w-full rounded-lg" />
        </div>
      </section>
    );
  }

  const estimateRows: { label: string; value: number }[] = estimate
    ? [
        { label: t('taxPackage.invoicesTotal'), value: estimate.invoices },
        { label: t('taxPackage.expensesTotal'), value: estimate.expenses },
        { label: t('taxPackage.paymentsTotal'), value: estimate.payments },
        { label: t('taxPackage.prepaymentsTotal'), value: estimate.taxPrepayments },
      ]
    : [];

  return (
    <section className="surface animate-fade-up overflow-hidden">
      {header}

      <div className="px-5 py-5 sm:px-6">
        {availableYears.length === 0 ? (
          <EmptyState
            compact
            bordered
            icon={Package}
            title={t('taxPackage.noDataAvailable')}
          />
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              {/* Year Selection */}
              <div>
                <p className={fieldLabelClass()}>{t('taxPackage.selectYear')}</p>
                <div className="flex flex-wrap gap-2">
                  {availableYears.map((year) => {
                    const isActive = selectedYear === year;
                    return (
                      <button
                        key={year}
                        type="button"
                        aria-pressed={isActive}
                        onClick={() => setSelectedYear(year)}
                        className={cn(
                          'rounded-full px-4 py-1.5 text-sm font-medium tabular-nums ring-1 ring-inset transition-colors',
                          'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                          isActive
                            ? 'bg-brand-600 text-white ring-brand-600 dark:bg-brand-400 dark:text-gray-950 dark:ring-brand-400'
                            : 'bg-white text-gray-700 ring-gray-200 hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-900 dark:text-gray-300 dark:ring-gray-700 dark:hover:bg-white/[0.04] dark:hover:text-white'
                        )}
                      >
                        {year}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Date Range Toggle */}
              {selectedYear && (
                <div>
                  <label className="flex cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      checked={useCustomDateRange}
                      onChange={(e) => setUseCustomDateRange(e.target.checked)}
                      className={checkboxClass}
                    />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {t('taxPackage.customDateRange')}
                    </span>
                  </label>

                  <div className="collapsible" data-open={useCustomDateRange}>
                    <div>
                      <div className="grid grid-cols-1 gap-4 pt-3 sm:grid-cols-2 sm:pl-7">
                        <div>
                          <label htmlFor="tax-package-start" className={fieldLabelClass()}>
                            {t('startDate')}
                          </label>
                          <input
                            id="tax-package-start"
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            disabled={!useCustomDateRange}
                            className={fieldClasses()}
                          />
                        </div>
                        <div>
                          <label htmlFor="tax-package-end" className={fieldLabelClass()}>
                            {t('endDate')}
                          </label>
                          <input
                            id="tax-package-end"
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            disabled={!useCustomDateRange}
                            className={fieldClasses()}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Package Contents */}
              {selectedYear && (
                <div>
                  <p className={fieldLabelClass()}>{t('taxPackage.contents')}</p>
                  <div className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
                    <ContentOption
                      icon={Calculator}
                      tone="bg-emerald-50 text-emerald-600 ring-emerald-600/10 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-400/20"
                      checked={includeReports}
                      onChange={setIncludeReports}
                      title={t('taxPackage.reports')}
                      detail={t('taxPackage.reportsDesc')}
                    />
                    <ContentOption
                      icon={FileText}
                      tone="bg-blue-50 text-blue-600 ring-blue-600/10 dark:bg-blue-500/10 dark:text-blue-400 dark:ring-blue-400/20"
                      checked={includeInvoicePDFs}
                      onChange={setIncludeInvoicePDFs}
                      title={t('taxPackage.invoices')}
                      detail={estimate ? `${estimate.invoicesWithPDF} ${t('taxPackage.files')}` : undefined}
                    />
                    <ContentOption
                      icon={Receipt}
                      tone="bg-orange-50 text-orange-600 ring-orange-600/10 dark:bg-orange-500/10 dark:text-orange-400 dark:ring-orange-400/20"
                      checked={includeExpenseReceipts}
                      onChange={setIncludeExpenseReceipts}
                      title={t('taxPackage.expenseReceipts')}
                      detail={estimate ? `${estimate.expensesWithReceipts} / ${estimate.expenses} ${t('taxPackage.withReceipts')}` : undefined}
                    />
                    <ContentOption
                      icon={Landmark}
                      tone="bg-brand-50 text-brand-600 ring-brand-600/10 dark:bg-brand-500/10 dark:text-brand-300 dark:ring-brand-400/20"
                      checked={includePrepaymentReceipts}
                      onChange={setIncludePrepaymentReceipts}
                      title={t('taxPackage.prepaymentReceipts')}
                      detail={estimate ? `${estimate.taxPrepaymentsWithReceipts} / ${estimate.taxPrepayments} ${t('taxPackage.withReceipts')}` : undefined}
                    />
                    <ContentOption
                      icon={FileSpreadsheet}
                      tone="bg-teal-50 text-teal-600 ring-teal-600/10 dark:bg-teal-500/10 dark:text-teal-400 dark:ring-teal-400/20"
                      checked={includeExcel}
                      onChange={setIncludeExcel}
                      title={t('taxPackage.excelExport')}
                      detail={t('taxPackage.excelDesc')}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Estimate Summary */}
            {selectedYear && estimate && (
              <aside
                className={cn(
                  'surface-muted h-fit p-5 transition-opacity duration-200 lg:sticky lg:top-20',
                  isLoadingEstimate && 'opacity-60'
                )}
                aria-busy={isLoadingEstimate || undefined}
              >
                <p className="eyebrow">{t('taxPackage.estimatedContents')}</p>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-3xl font-semibold tracking-tight tabular-nums text-gray-900 dark:text-white">
                    ~<AnimatedNumber value={estimatedFileCount} />
                  </span>
                  <span className="text-sm text-gray-500 dark:text-gray-400">{t('taxPackage.filesInPackage')}</span>
                </div>
                <dl className="mt-4 space-y-2 border-t border-gray-200 pt-4 text-sm dark:border-gray-800">
                  {estimateRows.map((row) => (
                    <div key={row.label} className="flex items-center justify-between gap-3">
                      <dt className="text-gray-500 dark:text-gray-400">{row.label}</dt>
                      <dd className="font-medium tabular-nums text-gray-900 dark:text-gray-100">{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </aside>
            )}
          </div>
        )}

        {/* Error Message */}
        {error && <Alert type="error" message={error} className="mt-5" onClose={() => setError(null)} />}
      </div>

      {/* Download Button */}
      <div className="flex flex-col-reverse gap-2 border-t border-gray-100 bg-gray-50/70 px-5 py-3.5 sm:flex-row sm:justify-end sm:px-6 dark:border-gray-800 dark:bg-white/[0.02]">
        {onClose && (
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common:buttons.cancel')}
          </Button>
        )}
        <Button
          type="button"
          onClick={handleDownload}
          disabled={!selectedYear || isLoadingEstimate}
          isLoading={isDownloading}
          leftIcon={<Download className="h-4 w-4" />}
        >
          {isDownloading ? t('taxPackage.generating') : t('taxPackage.download')}
        </Button>
      </div>
    </section>
  );
}
