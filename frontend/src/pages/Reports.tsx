/**
 * @fileoverview Reports page for generating financial and tax reports.
 *
 * Provides UI for generating various reports:
 * - VAT Report (Umsatzsteuervoranmeldung)
 * - Income/Expense Report (EÜR)
 * - Invoice Report
 * - Expense Report
 * - Time Tracking Report
 * - Client Revenue Report
 * - Tax Package Download
 *
 * Reports are generated on-the-fly based on selected date range.
 *
 * @module pages/Reports
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BarChart3,
  Braces,
  CheckCircle2,
  ChevronDown,
  Clock,
  Coins,
  Download,
  FileText,
  FolderArchive,
  Hourglass,
  Mail,
  Play,
  Scale,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import ExportModal, { ExportFormat } from '../components/reports/ExportModal';
import TaxPackageDownload from '../components/reports/TaxPackageDownload';
import { exportAsJSON, exportAsCSV, exportAsExcel } from '../utils/reportExport';
import apiClient from '../api/services/client';
import { useClients } from '../hooks/api/useClients';
import { useProjects } from '../hooks/api/useProjects';
import { PageHeader } from '../components/common/PageHeader';
import { Button } from '../components/common/Button';
import { Alert } from '../components/common/Alert';
import { StatCard } from '../components/common/StatCard';
import { fieldClasses, fieldLabelClass } from '../components/forms/fieldStyles';
import { formatCurrency } from '../utils/currency';
import { formatYmd } from '../utils/date';
import { toast } from '../lib/toast';
import { cn } from '../lib/cn';

type ReportType = 'incomeExpense' | 'timeTracking' | 'taxPackage';

interface QuickPeriod {
  key: string;
  label: string;
  startDate: string;
  endDate: string;
}

export default function Reports() {
  const { t, i18n } = useTranslation('reports');
  const [selectedReport, setSelectedReport] = useState<ReportType | null>(null);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [reportData, setReportData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportPreset, setExportPreset] = useState<ExportFormat | undefined>(undefined);
  const [showTaxPackage, setShowTaxPackage] = useState(false);
  const [includeTaxExcluded, setIncludeTaxExcluded] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');

  // Fetch clients and projects for filters
  const { data: clients = [] } = useClients();
  const { data: projects = [] } = useProjects();

  // Calculate quick period dates
  // Helper to format date as YYYY-MM-DD in local timezone
  const formatLocalDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getQuickPeriods = (): QuickPeriod[] => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const quarter = Math.floor(month / 3);

    return [
      {
        key: 'thisMonth',
        label: t('quickPeriods.thisMonth'),
        startDate: formatLocalDate(new Date(year, month, 1)),
        endDate: formatLocalDate(new Date(year, month + 1, 0)),
      },
      {
        key: 'lastMonth',
        label: t('quickPeriods.lastMonth'),
        startDate: formatLocalDate(new Date(year, month - 1, 1)),
        endDate: formatLocalDate(new Date(year, month, 0)),
      },
      {
        key: 'thisQuarter',
        label: t('quickPeriods.thisQuarter'),
        startDate: formatLocalDate(new Date(year, quarter * 3, 1)),
        endDate: formatLocalDate(new Date(year, quarter * 3 + 3, 0)),
      },
      {
        key: 'lastQuarter',
        label: t('quickPeriods.lastQuarter'),
        startDate: formatLocalDate(new Date(year, (quarter - 1) * 3, 1)),
        endDate: formatLocalDate(new Date(year, quarter * 3, 0)),
      },
      {
        key: 'thisYear',
        label: t('quickPeriods.thisYear'),
        startDate: formatLocalDate(new Date(year, 0, 1)),
        endDate: formatLocalDate(new Date(year, 11, 31)),
      },
      {
        key: 'lastYear',
        label: t('quickPeriods.lastYear'),
        startDate: formatLocalDate(new Date(year - 1, 0, 1)),
        endDate: formatLocalDate(new Date(year - 1, 11, 31)),
      },
    ];
  };

  const reportTypes = [
    {
      key: 'incomeExpense' as ReportType,
      icon: FileText,
    },
    {
      key: 'timeTracking' as ReportType,
      icon: Clock,
    },
    {
      key: 'taxPackage' as ReportType,
      icon: FolderArchive,
    },
  ];

  const handleQuickPeriod = (period: QuickPeriod) => {
    setStartDate(period.startDate);
    setEndDate(period.endDate);
  };

  const handleGenerate = async () => {
    if (!selectedReport || !startDate || !endDate) {
      setError(t('errors.invalidDateRange'));
      return;
    }

    if (new Date(endDate) < new Date(startDate)) {
      setError(t('errors.endDateBeforeStart'));
      return;
    }

    setIsGenerating(true);
    setError(null);
    setReportData(null);

    try {
      // Import dynamically to avoid circular dependencies
      const reportService = await import('../api/services/report.service');

      let data;
      switch (selectedReport) {
        case 'incomeExpense':
          data = await reportService.generateIncomeExpenseReport(startDate, endDate);
          break;
        case 'timeTracking':
          data = await reportService.generateTimeTrackingReport(
            startDate,
            endDate,
            selectedProjectId || undefined,
            selectedClientId || undefined
          );
          break;
      }

      setReportData(data);
    } catch (err: any) {
      setError(err.response?.data?.message || t('errors.failedToGenerate'));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExport = async (format: ExportFormat, metadata: any) => {
    if (!reportData || !selectedReport) return;

    const filename = `${selectedReport}-report-${startDate}-to-${endDate}`;

    try {
      const lang = i18n.language === 'de' ? 'de' : 'en';

      // Handle email format: generate + send as PDF via backend
      if (format === 'email') {
        const reportTypeMap: Partial<Record<ReportType, string>> = {
          incomeExpense: 'income-expense',
          timeTracking: 'time-tracking',
        };
        const backendReportType = reportTypeMap[selectedReport];
        if (!backendReportType) return;
        await apiClient.post('/reports/email', {
          reportType: backendReportType,
          dateFrom: startDate,
          dateTo: endDate,
          to: metadata.emailTo,
          lang,
          currency: 'EUR',
        });
        toast.success(t('export.emailSent', { to: metadata.emailTo }));
        return;
      }

      // Map report type and format to endpoint
      const endpointMap: Partial<Record<ReportType, Partial<Record<ExportFormat, string>>>> = {
        incomeExpense: {
          pdf: '/reports/income-expense/pdf',
          excel: '/reports/income-expense', // JSON endpoint - will handle client-side
          csv: '/reports/income-expense',
          json: '/reports/income-expense',
        },
        timeTracking: {
          pdf: '/reports/time-tracking/pdf',
          excel: '/reports/time-tracking/excel',
          csv: '/reports/time-tracking/csv',
          json: '/reports/time-tracking', // JSON endpoint
        },
      };

      const endpoint = endpointMap[selectedReport]?.[format];

      // Build params
      const params: any = {
        start_date: startDate,
        end_date: endDate,
        lang,
        currency: 'EUR',
        exclude_tax_excluded: !includeTaxExcluded,
        headline: metadata.headline,
        description: metadata.description,
        footer: metadata.footer,
        hide_prices: metadata.hidePrices || false,
      };

      // Add filters for time tracking report
      if (selectedReport === 'timeTracking') {
        if (selectedProjectId) params.project_id = selectedProjectId;
        if (selectedClientId) params.client_id = selectedClientId;
      }

      // For PDF and Excel/CSV formats with backend support, download from backend
      if (endpoint && (format === 'pdf' || (selectedReport === 'timeTracking' && (format === 'excel' || format === 'csv')))) {
        const mimeTypes: Record<string, string> = {
          pdf: 'application/pdf',
          excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          csv: 'text/csv',
        };

        const response = await apiClient.get(endpoint, {
          params,
          responseType: 'blob',
        });

        if (format === 'pdf') {
          // Open PDF in new tab
          const blob = new Blob([response.data], { type: mimeTypes[format] });
          const url = window.URL.createObjectURL(blob);
          window.open(url, '_blank');
          setTimeout(() => window.URL.revokeObjectURL(url), 100);
        } else {
          // Download Excel/CSV
          const blob = new Blob([response.data], { type: mimeTypes[format] });
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${filename}.${format === 'excel' ? 'xlsx' : format}`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => window.URL.revokeObjectURL(url), 100);
        }
      } else {
        // For JSON and formats without backend support, use client-side export
        switch (format) {
          case 'json':
            exportAsJSON(reportData, filename, metadata);
            break;
          case 'csv':
            exportAsCSV(reportData, filename, metadata);
            break;
          case 'excel':
            exportAsExcel(reportData, filename, metadata);
            break;
        }
      }
    } catch (err: any) {
      console.error('Export error:', err);
      setError(t('errors.failedToGenerate'));
    }
  };

  const openExport = (preset?: ExportFormat) => {
    setExportPreset(preset);
    setShowExportModal(true);
  };

  const quickPeriods = getQuickPeriods();
  const fieldClass = fieldClasses();

  const formatHours = (value: number) =>
    `${new Intl.NumberFormat(i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 2 }).format(value)} h`;
  const formatMoney = (value: number) => formatCurrency(value);

  // Key figures of the generated report, when its summary has the expected shape
  const summary = reportData?.summary;
  const summaryCards =
    selectedReport === 'incomeExpense' && typeof summary?.total_income === 'number'
      ? (
        <>
          <StatCard label={t('incomeExpense.totalIncome')} value={summary.total_income} format={formatMoney} icon={TrendingUp} variant="green" />
          <StatCard label={t('incomeExpense.totalExpenses')} value={summary.total_expenses} format={formatMoney} icon={TrendingDown} variant="red" />
          <StatCard
            label={t('incomeExpense.profitLoss')}
            value={summary.profit_loss}
            format={formatMoney}
            icon={Scale}
            variant={summary.profit_loss >= 0 ? 'purple' : 'orange'}
            hint={summary.profit_loss >= 0 ? t('incomeExpense.profit') : t('incomeExpense.loss')}
          />
        </>
      )
      : selectedReport === 'timeTracking' && typeof summary?.total_hours === 'number'
        ? (
          <>
            <StatCard label={t('timeTracking.totalHours')} value={summary.total_hours} format={formatHours} icon={Clock} variant="blue" />
            <StatCard label={t('timeTracking.billableHours')} value={summary.billable_hours} format={formatHours} icon={Hourglass} variant="purple" />
            <StatCard label={t('timeTracking.billableValue')} value={summary.billable_value} format={formatMoney} icon={Coins} variant="green" />
          </>
        )
        : null;

  return (
    <div className="space-y-8">
      <PageHeader title={t('title')} subtitle={t('subtitle')} icon={BarChart3} />

      {/* Report Type Selection */}
      <section className="space-y-3" aria-labelledby="report-type-heading">
        <h2 id="report-type-heading" className="section-title">{t('selectReport')}</h2>
        <div className="stagger grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {reportTypes.map((type) => {
            const Icon = type.icon;
            const isSelected = type.key === 'taxPackage' ? showTaxPackage : selectedReport === type.key;
            return (
              <button
                key={type.key}
                type="button"
                aria-pressed={isSelected}
                onClick={() => {
                  if (type.key === 'taxPackage') {
                    setShowTaxPackage(true);
                  } else {
                    setSelectedReport(type.key);
                    setShowTaxPackage(false);
                  }
                }}
                className={cn(
                  'surface surface-interactive relative flex h-full flex-col p-5 text-left',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500',
                  isSelected &&
                    'border-purple-300 bg-purple-50/40 ring-2 ring-purple-500/70 hover:border-purple-300 dark:border-purple-500/40 dark:bg-purple-500/[0.06] dark:ring-purple-400/50 dark:hover:border-purple-500/40'
                )}
              >
                <div className="flex w-full items-start justify-between gap-3">
                  <span
                    className={cn(
                      'flex h-10 w-10 items-center justify-center rounded-lg ring-1 ring-inset transition-colors',
                      isSelected
                        ? 'bg-purple-600 text-white ring-purple-600 dark:bg-purple-500 dark:ring-purple-500'
                        : 'bg-purple-50 text-purple-600 ring-purple-600/10 dark:bg-purple-500/10 dark:text-purple-300 dark:ring-purple-400/20'
                    )}
                  >
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  {isSelected ? (
                    <CheckCircle2 className="h-5 w-5 animate-scale-in text-purple-600 dark:text-purple-400" aria-hidden="true" />
                  ) : (
                    <span className="h-5 w-5 rounded-full border border-gray-300 dark:border-gray-700" aria-hidden="true" />
                  )}
                </div>
                <h3 className="mt-4 font-semibold text-gray-900 dark:text-white">
                  {t(`reportTypes.${type.key}.title`)}
                </h3>
                <p className="mt-0.5 text-sm font-medium text-gray-500 dark:text-gray-400">
                  {t(`reportTypes.${type.key}.subtitle`)}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                  {t(`reportTypes.${type.key}.description`)}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Date Range Selection */}
      {selectedReport && (
        <section key={selectedReport} className="surface animate-fade-up overflow-hidden">
          <div className="border-b border-gray-100 px-5 py-4 sm:px-6 dark:border-gray-800">
            <h2 className="section-title">{t('parameters')}</h2>
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              {t(`reportTypes.${selectedReport}.title`)}
            </p>
          </div>

          <div className="space-y-6 px-5 py-5 sm:px-6">
            {/* Quick Periods */}
            <div>
              <p className={fieldLabelClass()}>{t('selectPeriod')}</p>
              <div className="flex flex-wrap gap-2">
                {quickPeriods.map((period) => {
                  const isActive = period.startDate === startDate && period.endDate === endDate;
                  return (
                    <button
                      key={period.key}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => handleQuickPeriod(period)}
                      className={cn(
                        'rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 ring-inset transition-colors',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500',
                        isActive
                          ? 'bg-purple-600 text-white ring-purple-600 dark:bg-purple-500 dark:ring-purple-500'
                          : 'bg-white text-gray-700 ring-gray-200 hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-900 dark:text-gray-300 dark:ring-gray-700 dark:hover:bg-white/[0.04] dark:hover:text-white'
                      )}
                    >
                      {period.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom Date Range */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:max-w-2xl">
              <div>
                <label htmlFor="report-start" className={fieldLabelClass()}>
                  {t('startDate')}
                </label>
                <input
                  id="report-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className={fieldClass}
                />
              </div>
              <div>
                <label htmlFor="report-end" className={fieldLabelClass()}>
                  {t('endDate')}
                </label>
                <input
                  id="report-end"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className={fieldClass}
                />
              </div>
            </div>

            {/* Tax Exclusion Option - Only for Income/Expense Report */}
            {selectedReport === 'incomeExpense' && (
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 bg-gray-50/60 p-4 transition-colors hover:bg-gray-50 lg:max-w-2xl dark:border-gray-800 dark:bg-white/[0.02] dark:hover:bg-white/[0.04]">
                <input
                  type="checkbox"
                  checked={includeTaxExcluded}
                  onChange={(e) => setIncludeTaxExcluded(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-purple-600 accent-purple-600 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-900"
                />
                <span className="flex-1">
                  <span className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('includeTaxExcluded')}
                  </span>
                  <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                    {t('includeTaxExcludedHelp')}
                  </span>
                </span>
              </label>
            )}

            {/* Client and Project Filters - Only for Time Tracking Report */}
            {selectedReport === 'timeTracking' && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:max-w-2xl">
                <div>
                  <label htmlFor="report-client" className={fieldLabelClass()}>
                    {t('filters.client')}
                  </label>
                  <select
                    id="report-client"
                    value={selectedClientId}
                    onChange={(e) => {
                      setSelectedClientId(e.target.value);
                      setSelectedProjectId(''); // Reset project when client changes
                    }}
                    className={fieldClass}
                  >
                    <option value="">{t('filters.allClients')}</option>
                    {clients.map((client: any) => (
                      <option key={client.id} value={client.id}>
                        {client.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="report-project" className={fieldLabelClass()}>
                    {t('filters.project')}
                  </label>
                  <select
                    id="report-project"
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    className={fieldClass}
                  >
                    <option value="">{t('filters.allProjects')}</option>
                    {projects
                      .filter((project: any) => !selectedClientId || project.client_id === selectedClientId)
                      .map((project: any) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Generate Button */}
          <div className="flex flex-col-reverse gap-3 border-t border-gray-100 bg-gray-50/70 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6 dark:border-gray-800 dark:bg-white/[0.02]">
            <p className="text-sm tabular-nums text-gray-500 dark:text-gray-400">
              {startDate && endDate ? `${formatYmd(startDate, i18n.language)} – ${formatYmd(endDate, i18n.language)}` : t('periodHint')}
            </p>
            <Button
              type="button"
              onClick={handleGenerate}
              disabled={!startDate || !endDate}
              isLoading={isGenerating}
              leftIcon={<Play className="h-4 w-4" />}
            >
              {isGenerating ? t('generating') : t('generate')}
            </Button>
          </div>
        </section>
      )}

      {/* Error Message */}
      {error && <Alert type="error" message={error} onClose={() => setError(null)} />}

      {/* Report Display Area */}
      {reportData && (
        <section className="surface animate-fade-up overflow-hidden">
          {/* Report Header with Actions */}
          <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 dark:border-gray-800">
            <div className="min-w-0">
              <h2 className="section-title">{t(`reportTypes.${selectedReport}.title`)}</h2>
              <p className="mt-0.5 text-sm tabular-nums text-gray-500 dark:text-gray-400">
                {formatYmd(startDate, i18n.language)} – {formatYmd(endDate, i18n.language)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => openExport('email')}
                leftIcon={<Mail className="h-4 w-4" />}
              >
                {t('export.emailButton')}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => openExport()}
                leftIcon={<Download className="h-4 w-4" />}
              >
                {t('exportButton')}
              </Button>
            </div>
          </div>

          <div className="space-y-5 px-5 py-5 sm:px-6">
            {summaryCards && (
              <div className="stagger grid grid-cols-1 gap-4 sm:grid-cols-3">{summaryCards}</div>
            )}

            {/* Full report data */}
            <details className="group rounded-lg border border-gray-200 dark:border-gray-800" open={!summaryCards}>
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.02] [&::-webkit-details-marker]:hidden">
                <Braces className="h-4 w-4 text-gray-400 dark:text-gray-500" aria-hidden="true" />
                {t('rawData')}
                <ChevronDown
                  className="ml-auto h-4 w-4 text-gray-400 transition-transform duration-200 group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              <pre className="max-h-[480px] overflow-auto border-t border-gray-200 bg-gray-50 p-4 font-mono text-xs leading-relaxed text-gray-700 dark:border-gray-800 dark:bg-gray-950/40 dark:text-gray-300">
                {JSON.stringify(reportData, null, 2)}
              </pre>
            </details>
          </div>
        </section>
      )}

      {/* Tax Package Section */}
      {showTaxPackage && <TaxPackageDownload onClose={() => setShowTaxPackage(false)} />}

      {/* Export Modal */}
      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        onExport={handleExport}
        reportType={selectedReport || ''}
        initialFormat={exportPreset}
      />
    </div>
  );
}
