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
import { Download, FileJson, FileSpreadsheet, FileText, Table, Mail } from 'lucide-react';
import Modal from '../ui/Modal';
import { Button } from '../common/Button';
import { fieldClasses, fieldHelperClass, fieldLabelClass } from '../forms/fieldStyles';
import { cn } from '../../lib/cn';

export type ExportFormat = 'json' | 'csv' | 'pdf' | 'excel' | 'email';

interface ExportMetadata {
  headline: string;
  description: string;
  footer: string;
  hidePrices: boolean;
  emailTo: string;
}

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (format: ExportFormat, metadata: ExportMetadata) => void;
  reportType: string;
  /** Format to preselect when the dialog opens (e.g. 'email' from a "Send by email" button) */
  initialFormat?: ExportFormat;
}

export default function ExportModal({ isOpen, onClose, onExport, reportType, initialFormat }: ExportModalProps) {
  const { t } = useTranslation('reports');
  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [metadata, setMetadata] = useState<ExportMetadata>({
    headline: '',
    description: '',
    footer: '',
    hidePrices: false,
    emailTo: '',
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

  // Preselect the requested format each time the dialog opens; a plain
  // "Export" never opens on the email option
  useEffect(() => {
    if (!isOpen) return;
    if (initialFormat) setFormat(initialFormat);
    else setFormat((current) => (current === 'email' ? 'pdf' : current));
  }, [isOpen, initialFormat]);

  const handleExport = () => {
    onExport(format, metadata);
    onClose();
  };

  const formats: { value: ExportFormat; icon: typeof FileJson; label: string; description: string }[] = [
    {
      value: 'pdf',
      icon: FileText,
      label: 'PDF',
      description: t('export.formats.pdfDescription'),
    },
    {
      value: 'excel',
      icon: Table,
      label: 'Excel',
      description: t('export.formats.excelDescription'),
    },
    {
      value: 'csv',
      icon: FileSpreadsheet,
      label: 'CSV',
      description: t('export.formats.csvDescription'),
    },
    {
      value: 'json',
      icon: FileJson,
      label: 'JSON',
      description: t('export.formats.jsonDescription'),
    },
    {
      value: 'email',
      icon: Mail,
      label: t('export.formats.email'),
      description: t('export.formats.emailDescription'),
    },
  ];

  const footer = (
    <>
      <Button type="button" variant="secondary" onClick={onClose}>
        {t('common:buttons.cancel')}
      </Button>
      <Button
        type="button"
        onClick={handleExport}
        leftIcon={format === 'email' ? <Mail className="h-4 w-4" /> : <Download className="h-4 w-4" />}
      >
        {format === 'email' ? t('export.emailButton') : t('export.exportButton')}
      </Button>
    </>
  );

  const field = fieldClasses();

  return (
    <Modal
      open={isOpen}
      title={t('export.title')}
      icon={<Download className="h-4 w-4" />}
      onClose={onClose}
      footer={footer}
      size="lg"
    >
      <div className="space-y-6">
        {/* Format Selection */}
        <fieldset>
          <legend className={fieldLabelClass()}>{t('export.selectFormat')}</legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {formats.map((fmt) => {
              const Icon = fmt.icon;
              const isSelected = format === fmt.value;
              return (
                <button
                  key={fmt.value}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => setFormat(fmt.value)}
                  className={cn(
                    'flex flex-col rounded-lg border p-3.5 text-left transition-[border-color,background-color,box-shadow] duration-150',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500',
                    isSelected
                      ? 'border-purple-400 bg-purple-50/60 ring-1 ring-purple-500/60 dark:border-purple-500/50 dark:bg-purple-500/[0.08] dark:ring-purple-400/40'
                      : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700 dark:hover:bg-white/[0.02]'
                  )}
                >
                  <span className="mb-1.5 flex items-center gap-2">
                    <Icon
                      className={cn(
                        'h-4 w-4',
                        isSelected ? 'text-purple-600 dark:text-purple-400' : 'text-gray-400 dark:text-gray-500'
                      )}
                      aria-hidden="true"
                    />
                    <span className={cn('text-sm font-semibold', isSelected ? 'text-purple-900 dark:text-purple-100' : 'text-gray-900 dark:text-white')}>
                      {fmt.label}
                    </span>
                  </span>
                  <span className="text-xs leading-snug text-gray-500 dark:text-gray-400">
                    {fmt.description}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>

        {/* Email recipient (only for email format) */}
        {format === 'email' && (
          <div className="animate-fade-in">
            <label htmlFor="export-email-to" className={fieldLabelClass()}>
              {t('export.emailTo')}
            </label>
            <input
              id="export-email-to"
              type="email"
              value={metadata.emailTo}
              onChange={(e) => setMetadata({ ...metadata, emailTo: e.target.value })}
              className={field}
              placeholder="recipient@example.com"
            />
            <p className={fieldHelperClass}>
              {t('export.emailToHelp')}
            </p>
          </div>
        )}

        {/* Metadata Fields (not shown for email) */}
        {format !== 'email' && (
        <div className="animate-fade-in space-y-4">
          {/* Headline */}
          <div>
            <label htmlFor="export-headline" className={fieldLabelClass()}>
              {t('export.headline')}
            </label>
            <input
              id="export-headline"
              type="text"
              value={metadata.headline}
              onChange={(e) => setMetadata({ ...metadata, headline: e.target.value })}
              className={field}
              placeholder={t('export.headlinePlaceholder')}
            />
          </div>

          {/* Description */}
          <div>
            <label htmlFor="export-description" className={fieldLabelClass()}>
              {t('export.description')}{' '}
              <span className="text-xs font-normal text-gray-500 dark:text-gray-400">({t('common:common.optional')})</span>
            </label>
            <textarea
              id="export-description"
              value={metadata.description}
              onChange={(e) => setMetadata({ ...metadata, description: e.target.value })}
              rows={3}
              className={fieldClasses({ multiline: true })}
              placeholder={t('export.descriptionPlaceholder')}
            />
          </div>

          {/* Footer (only for PDF) */}
          {format === 'pdf' && (
            <div>
              <label htmlFor="export-footer" className={fieldLabelClass()}>
                {t('export.footer')}{' '}
                <span className="text-xs font-normal text-gray-500 dark:text-gray-400">({t('common:common.optional')})</span>
              </label>
              <textarea
                id="export-footer"
                value={metadata.footer}
                onChange={(e) => setMetadata({ ...metadata, footer: e.target.value })}
                rows={2}
                className={fieldClasses({ multiline: true })}
                placeholder={t('export.footerPlaceholder')}
              />
            </div>
          )}

          {/* Hide Prices Toggle (only for Time Tracking + PDF) */}
          {reportType === 'timeTracking' && format === 'pdf' && (
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 bg-gray-50/60 p-4 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:bg-white/[0.02] dark:hover:bg-white/[0.04]">
              <input
                type="checkbox"
                checked={metadata.hidePrices}
                onChange={(e) => setMetadata({ ...metadata, hidePrices: e.target.checked })}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-purple-600 accent-purple-600 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-900"
              />
              <span className="flex-1">
                <span className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('export.hidePrices')}
                </span>
                <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                  {t('export.hidePricesHelp')}
                </span>
              </span>
            </label>
          )}
        </div>
        )}
      </div>
    </Modal>
  );
}
