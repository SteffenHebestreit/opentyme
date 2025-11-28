/**
 * @fileoverview Export configuration modal for reports.
 * 
 * Allows users to:
 * - Select export format (JSON, CSV, PDF)
 * - Configure report metadata (headline, description, footer)
 * - Trigger export with custom settings
 * 
 * @module components/reports/ExportModal
 */

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, FileJson, FileSpreadsheet, FileText, Table } from 'lucide-react';
import Modal from '../ui/Modal';

export type ExportFormat = 'json' | 'csv' | 'pdf' | 'excel';

interface ExportMetadata {
  headline: string;
  description: string;
  footer: string;
}

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (format: ExportFormat, metadata: ExportMetadata) => void;
  reportType: string;
}

export default function ExportModal({ isOpen, onClose, onExport, reportType }: ExportModalProps) {
  const { t } = useTranslation('reports');
  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [metadata, setMetadata] = useState<ExportMetadata>({
    headline: '',
    description: '',
    footer: '',
  });

  // Update headline when reportType changes
  useEffect(() => {
    if (reportType) {
      setMetadata(prev => ({
        ...prev,
        headline: t(`reportTypes.${reportType}.title`),
      }));
    }
  }, [reportType, t]);

  const handleExport = () => {
    onExport(format, metadata);
    onClose();
  };

  const formats: { value: ExportFormat; icon: typeof FileJson; label: string; description: string }[] = [
    {
      value: 'json',
      icon: FileJson,
      label: 'JSON',
      description: t('export.formats.jsonDescription'),
    },
    {
      value: 'csv',
      icon: FileSpreadsheet,
      label: 'CSV',
      description: t('export.formats.csvDescription'),
    },
    {
      value: 'excel',
      icon: Table,
      label: 'Excel',
      description: t('export.formats.excelDescription'),
    },
    {
      value: 'pdf',
      icon: FileText,
      label: 'PDF',
      description: t('export.formats.pdfDescription'),
    },
  ];

  const footer = (
    <>
      <button
        onClick={onClose}
        className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
      >
        {t('common:buttons.cancel')}
      </button>
      <button
        onClick={handleExport}
        className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center space-x-2"
      >
        <Download className="w-4 h-4" />
        <span>{t('export.exportButton')}</span>
      </button>
    </>
  );

  return (
    <Modal
      open={isOpen}
      title={t('export.title')}
      onClose={onClose}
      footer={footer}
      size="lg"
    >
      <div className="space-y-6">
        {/* Format Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            {t('export.selectFormat')}
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {formats.map((fmt) => {
              const Icon = fmt.icon;
              const isSelected = format === fmt.value;
              return (
                <button
                  key={fmt.value}
                  onClick={() => setFormat(fmt.value)}
                  className={`
                    p-4 rounded-lg border-2 text-left transition-all
                    ${isSelected
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }
                  `}
                >
                  <div className="flex items-center space-x-3 mb-2">
                    <Icon className={`w-5 h-5 ${isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400'}`} />
                    <span className={`font-semibold ${isSelected ? 'text-blue-900 dark:text-blue-100' : 'text-gray-900 dark:text-white'}`}>
                      {fmt.label}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    {fmt.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Metadata Fields */}
        <div className="space-y-4">
          {/* Headline */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('export.headline')}
            </label>
            <input
              type="text"
              value={metadata.headline}
              onChange={(e) => setMetadata({ ...metadata, headline: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder={t('export.headlinePlaceholder')}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('export.description')} <span className="text-gray-500 text-xs">({t('common:common.optional')})</span>
            </label>
            <textarea
              value={metadata.description}
              onChange={(e) => setMetadata({ ...metadata, description: e.target.value })}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder={t('export.descriptionPlaceholder')}
            />
          </div>

          {/* Footer (only for PDF) */}
          {format === 'pdf' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('export.footer')} <span className="text-gray-500 text-xs">({t('common:common.optional')})</span>
              </label>
              <textarea
                value={metadata.footer}
                onChange={(e) => setMetadata({ ...metadata, footer: e.target.value })}
                rows={2}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder={t('export.footerPlaceholder')}
              />
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
