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

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FileText,
  Clock,
  Users,
  Calendar,
  Download,
  FolderArchive,
} from 'lucide-react';
import ExportModal, { ExportFormat } from '../components/reports/ExportModal';
import TaxPackageDownload from '../components/reports/TaxPackageDownload';
import { exportAsJSON, exportAsCSV, exportAsExcel } from '../utils/reportExport';
import apiClient from '../api/services/client';
import { useClients } from '../hooks/api/useClients';
import { useProjects } from '../hooks/api/useProjects';

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
      color: 'bg-green-500',
    },
    {
      key: 'timeTracking' as ReportType,
      icon: Clock,
      color: 'bg-indigo-500',
    },
    {
      key: 'taxPackage' as ReportType,
      icon: FolderArchive,
      color: 'bg-blue-500',
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
      
      // Map report type and format to endpoint
      const endpointMap: Record<ReportType, Record<ExportFormat, string>> = {
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

      const endpoint = endpointMap[selectedReport][format];
      
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
      };
      
      // Add filters for time tracking report
      if (selectedReport === 'timeTracking') {
        if (selectedProjectId) params.project_id = selectedProjectId;
        if (selectedClientId) params.client_id = selectedClientId;
      }

      // For PDF and Excel/CSV formats with backend support, download from backend
      if (format === 'pdf' || (selectedReport === 'timeTracking' && (format === 'excel' || format === 'csv'))) {
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

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('title')}</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">{t('subtitle')}</p>
      </div>

      {/* Report Type Selection */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('selectReport')}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {reportTypes.map((type) => {
            const Icon = type.icon;
            const isSelected = selectedReport === type.key;
            return (
              <button
                key={type.key}
                onClick={() => {
                  if (type.key === 'taxPackage') {
                    setShowTaxPackage(true);
                  } else {
                    setSelectedReport(type.key);
                    setShowTaxPackage(false);
                  }
                }}
                className={`
                  p-6 rounded-lg border-2 text-left transition-all
                  ${isSelected
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600'
                  }
                `}
              >
                <div className="flex items-start space-x-4">
                  <div className={`${type.color} p-3 rounded-lg`}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 dark:text-white">
                      {t(`reportTypes.${type.key}.title`)}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {t(`reportTypes.${type.key}.subtitle`)}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                      {t(`reportTypes.${type.key}.description`)}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Date Range Selection */}
      {selectedReport && (
        <div className="space-y-4 bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('selectPeriod')}</h2>
          
          {/* Quick Periods */}
          <div className="flex flex-wrap gap-2">
            {getQuickPeriods().map((period) => (
              <button
                key={period.key}
                onClick={() => handleQuickPeriod(period)}
                className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 
                         bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300
                         hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
              >
                {period.label}
              </button>
            ))}
          </div>

          {/* Custom Date Range */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <Calendar className="w-4 h-4 inline mr-2" />
                {t('startDate')}
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                         bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                         focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <Calendar className="w-4 h-4 inline mr-2" />
                {t('endDate')}
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                         bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                         focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Tax Exclusion Option - Only for Income/Expense Report */}
          {selectedReport === 'incomeExpense' && (
            <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeTaxExcluded}
                  onChange={(e) => setIncludeTaxExcluded(e.target.checked)}
                  className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded
                           focus:ring-blue-500 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                />
                <div className="flex-1">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('includeTaxExcluded')}
                  </span>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {t('includeTaxExcludedHelp')}
                  </p>
                </div>
              </label>
            </div>
          )}

          {/* Client and Project Filters - Only for Time Tracking Report */}
          {selectedReport === 'timeTracking' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <Users className="w-4 h-4 inline mr-2" />
                  Kunde filtern (optional)
                </label>
                <select
                  value={selectedClientId}
                  onChange={(e) => {
                    setSelectedClientId(e.target.value);
                    setSelectedProjectId(''); // Reset project when client changes
                  }}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                           bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                           focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Alle Kunden</option>
                  {clients.map((client: any) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <FileText className="w-4 h-4 inline mr-2" />
                  Projekt filtern (optional)
                </label>
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                           bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                           focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Alle Projekte</option>
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

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={isGenerating || !startDate || !endDate}
            className="w-full sm:w-auto px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400
                     text-white font-medium rounded-lg transition-colors
                     disabled:cursor-not-allowed"
          >
            {isGenerating ? t('generating') : t('generate')}
          </button>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      {/* Report Display Area */}
      {reportData && (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
          {/* Report Header with Actions */}
          <div className="flex justify-between items-center mb-6 pb-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              {t(`reportTypes.${selectedReport}.title`)}
            </h2>
            <div className="flex space-x-2">
              <button
                onClick={() => setShowExportModal(true)}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center space-x-2"
              >
                <Download className="w-4 h-4" />
                <span>{t('exportButton')}</span>
              </button>
            </div>
          </div>

          {/* Report Content - This is where individual report components would go */}
          <div className="prose dark:prose-invert max-w-none">
            <pre className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg overflow-auto text-sm">
              {JSON.stringify(reportData, null, 2)}
            </pre>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-4">
              💡 <strong>Next Step:</strong> Create dedicated display components in{' '}
              <code>frontend/src/components/reports/</code> to format each report type properly.
            </p>
          </div>
        </div>
      )}

      {/* Tax Package Section */}
      {showTaxPackage && (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
          <TaxPackageDownload onClose={() => setShowTaxPackage(false)} />
        </div>
      )}

      {/* Export Modal */}
      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        onExport={handleExport}
        reportType={selectedReport || ''}
      />
    </div>
  );
}
