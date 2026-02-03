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
import { useTranslation } from 'react-i18next';
import {
  Package,
  Download,
  FileText,
  Receipt,
  Calculator,
  FileSpreadsheet,
  Calendar,
  Check,
  Loader2,
  Info,
  FolderArchive,
} from 'lucide-react';
import {
  getAvailableYears,
  getPackageEstimate,
  downloadTaxPackage,
  PackageEstimate,
  TaxPackageOptions,
} from '../../api/services/tax-package.service';

interface TaxPackageDownloadProps {
  onClose?: () => void;
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
        setError(err.message || 'Failed to load available years');
      } finally {
        setIsLoading(false);
      }
    }
    loadYears();
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
      setError(err.message || 'Failed to download tax package');
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center space-x-3">
        <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
          <FolderArchive className="w-6 h-6 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            {t('taxPackage.title', 'Tax Package')}
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {t('taxPackage.description', 'Download all tax-related documents as a ZIP file')}
          </p>
        </div>
      </div>

      {/* Year Selection */}
      <div className="space-y-3">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          <Calendar className="w-4 h-4 inline mr-2" />
          {t('taxPackage.selectYear', 'Select Year')}
        </label>
        <div className="flex flex-wrap gap-2">
          {availableYears.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('taxPackage.noDataAvailable', 'No tax data available')}
            </p>
          ) : (
            availableYears.map((year) => (
              <button
                key={year}
                onClick={() => setSelectedYear(year)}
                className={`px-4 py-2 rounded-lg border transition-colors ${
                  selectedYear === year
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-400'
                }`}
              >
                {year}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Custom Date Range Toggle */}
      {selectedYear && (
        <div className="space-y-3">
          <label className="flex items-center space-x-3 cursor-pointer">
            <input
              type="checkbox"
              checked={useCustomDateRange}
              onChange={(e) => setUseCustomDateRange(e.target.checked)}
              className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded
                       focus:ring-blue-500 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
            />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('taxPackage.customDateRange', 'Custom Date Range')}
            </span>
          </label>

          {useCustomDateRange && (
            <div className="grid grid-cols-2 gap-4 pl-7">
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                  {t('startDate', 'Start Date')}
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                           bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                  {t('endDate', 'End Date')}
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                           bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Package Contents */}
      {selectedYear && (
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            <Package className="w-4 h-4 inline mr-2" />
            {t('taxPackage.contents', 'Package Contents')}
          </label>

          <div className="space-y-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
            {/* Reports */}
            <label className="flex items-center space-x-3 cursor-pointer p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700/50">
              <input
                type="checkbox"
                checked={includeReports}
                onChange={(e) => setIncludeReports(e.target.checked)}
                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded
                         focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
              />
              <Calculator className="w-5 h-5 text-green-600" />
              <div className="flex-1">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('taxPackage.reports', 'Financial Reports (PDF)')}
                </span>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t('taxPackage.reportsDesc', 'Income/Expense Report, VAT Report')}
                </p>
              </div>
            </label>

            {/* Invoice PDFs */}
            <label className="flex items-center space-x-3 cursor-pointer p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700/50">
              <input
                type="checkbox"
                checked={includeInvoicePDFs}
                onChange={(e) => setIncludeInvoicePDFs(e.target.checked)}
                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded
                         focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
              />
              <FileText className="w-5 h-5 text-blue-600" />
              <div className="flex-1">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('taxPackage.invoices', 'Invoice PDFs')}
                </span>
                {estimate && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {estimate.invoicesWithPDF} {t('taxPackage.files', 'files')}
                  </p>
                )}
              </div>
            </label>

            {/* Expense Receipts */}
            <label className="flex items-center space-x-3 cursor-pointer p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700/50">
              <input
                type="checkbox"
                checked={includeExpenseReceipts}
                onChange={(e) => setIncludeExpenseReceipts(e.target.checked)}
                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded
                         focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
              />
              <Receipt className="w-5 h-5 text-orange-600" />
              <div className="flex-1">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('taxPackage.expenseReceipts', 'Expense Receipts')}
                </span>
                {estimate && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {estimate.expensesWithReceipts} / {estimate.expenses} {t('taxPackage.withReceipts', 'with receipts')}
                  </p>
                )}
              </div>
            </label>

            {/* Tax Prepayment Receipts */}
            <label className="flex items-center space-x-3 cursor-pointer p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700/50">
              <input
                type="checkbox"
                checked={includePrepaymentReceipts}
                onChange={(e) => setIncludePrepaymentReceipts(e.target.checked)}
                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded
                         focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
              />
              <FileText className="w-5 h-5 text-purple-600" />
              <div className="flex-1">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('taxPackage.prepaymentReceipts', 'Tax Prepayment Receipts')}
                </span>
                {estimate && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {estimate.taxPrepaymentsWithReceipts} / {estimate.taxPrepayments} {t('taxPackage.withReceipts', 'with receipts')}
                  </p>
                )}
              </div>
            </label>

            {/* Excel Export */}
            <label className="flex items-center space-x-3 cursor-pointer p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700/50">
              <input
                type="checkbox"
                checked={includeExcel}
                onChange={(e) => setIncludeExcel(e.target.checked)}
                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded
                         focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
              />
              <FileSpreadsheet className="w-5 h-5 text-green-700" />
              <div className="flex-1">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('taxPackage.excelExport', 'Excel Export')}
                </span>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t('taxPackage.excelDesc', 'All data in spreadsheet format')}
                </p>
              </div>
            </label>
          </div>
        </div>
      )}

      {/* Estimate Summary */}
      {selectedYear && estimate && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-blue-800 dark:text-blue-200">
                {t('taxPackage.estimatedContents', 'Estimated Package Contents')}
              </p>
              <ul className="mt-2 space-y-1 text-blue-700 dark:text-blue-300">
                <li>{estimate.invoices} {t('taxPackage.invoicesTotal', 'invoices')}</li>
                <li>{estimate.expenses} {t('taxPackage.expensesTotal', 'expenses')}</li>
                <li>{estimate.payments} {t('taxPackage.paymentsTotal', 'payments')}</li>
                <li>{estimate.taxPrepayments} {t('taxPackage.prepaymentsTotal', 'tax prepayments')}</li>
              </ul>
              <p className="mt-2 font-medium">
                ~{estimatedFileCount} {t('taxPackage.filesInPackage', 'files in package')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      {/* Download Button */}
      <div className="flex justify-end space-x-3">
        {onClose && (
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700
                     hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
          >
            {t('common.cancel', 'Cancel')}
          </button>
        )}
        <button
          onClick={handleDownload}
          disabled={!selectedYear || isDownloading || isLoadingEstimate}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400
                   text-white font-medium rounded-lg transition-colors
                   disabled:cursor-not-allowed flex items-center space-x-2"
        >
          {isDownloading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{t('taxPackage.generating', 'Generating...')}</span>
            </>
          ) : (
            <>
              <Download className="w-4 h-4" />
              <span>{t('taxPackage.download', 'Download ZIP')}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
