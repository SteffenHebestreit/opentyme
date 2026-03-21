/**
 * @fileoverview Modal component for generating invoices from billable time entries.
 * 
 * Provides a filtering interface to select time entries and automatically generate
 * an invoice with line items based on tracked time. Supports filtering by client,
 * project, and date range to precisely control which time entries to include.
 * 
 * Features:
 * - Filter by client (optional): Include time from specific client or all clients
 * - Filter by project (optional): Include time from specific project or all projects
 * - Dynamic project filtering: Projects filtered by selected client
 * - Date range filtering: Start and end dates to limit time entry selection
 * - Date validation: End date must be after start date
 * - Automatic invoice generation: Creates invoice with line items from matching time entries
 * - All filters optional: Can generate invoice from all billable time if desired
 * 
 * @module components/business/invoices/GenerateInvoiceModal
 */

import { FC, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Alert } from '../../common/Alert';
import { Button } from '../../common/Button';
import { Input } from '../../forms/Input';
import { Modal } from '../../ui/Modal';
import { Client, GenerateInvoiceFromTimeEntriesPayload, Project } from '../../../api/types';
import { useInvoiceTextTemplates } from '../../../hooks/api/useInvoiceTextTemplates';
import { AVAILABLE_PLACEHOLDERS, getPlaceholderPreview } from '../../../utils/placeholders';

/**
 * Props for the GenerateInvoiceModal component.
 * 
 * @interface GenerateInvoiceModalProps
 * @property {boolean} open - Whether the modal is currently visible
 * @property {Client[]} clients - Available clients for the client dropdown
 * @property {Project[]} projects - Available projects for the project dropdown
 * @property {(payload: GenerateInvoiceFromTimeEntriesPayload) => Promise<void>} onSubmit - Async handler for invoice generation
 * @property {() => void} onClose - Handler for modal close (cancel button or backdrop click)
 * @property {boolean} isSubmitting - Loading state during invoice generation
 * @property {string | null} [error] - Error message to display above the form
 */
interface GenerateInvoiceModalProps {
  open: boolean;
  clients: Client[];
  projects: Project[];
  onSubmit: (payload: GenerateInvoiceFromTimeEntriesPayload) => Promise<void>;
  onClose: () => void;
  isSubmitting: boolean;
  error?: string | null;
}

/**
 * Internal form values interface for react-hook-form.
 * All fields are optional to allow flexible filtering.
 * 
 * @interface FormValues
 * @property {string} client_id - ID of the selected client (empty for all clients)
 * @property {string} project_id - ID of the selected project (empty for all projects)
 * @property {string} start_date - Start date in YYYY-MM-DD format (empty for no start limit)
 * @property {string} end_date - End date in YYYY-MM-DD format (empty for no end limit)
 */
interface FormValues {
  client_id: string;
  project_id: string;
  start_date: string;
  end_date: string;
  invoice_headline: string;
  header_template_id: string;
  footer_template_id: string;
  terms_template_id: string;
}

/**
 * Default form values for invoice generation.
 * All filters start empty to include all time entries.
 * 
 * @constant
 * @type {FormValues}
 */
const DEFAULT_VALUES: FormValues = {
  client_id: '',
  project_id: '',
  start_date: '',
  end_date: '',
  invoice_headline: '',
  header_template_id: '',
  footer_template_id: '',
  terms_template_id: '',
};

/**
 * Unique form ID for associating the submit button with the form element.
 * Allows submit button to be placed in modal footer outside the form.
 * 
 * @constant
 */
const formId = 'generate-invoice-modal';

/**
 * Converts a date string to ISO 8601 format.
 * 
 * Converts date input strings (YYYY-MM-DD) to ISO 8601 format for API submission.
 * Returns undefined for empty or invalid dates.
 * 
 * @function
 * @param {string} value - Date string in YYYY-MM-DD format
 * @returns {string | undefined} ISO 8601 date string or undefined if invalid
 * @example
 * toISO('2024-01-15') // Returns: '2024-01-15T00:00:00.000Z'
 * toISO('') // Returns: undefined
 * toISO('invalid') // Returns: undefined
 */
function toISO(value: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date.toISOString();
}

/**
 * Modal component for generating invoices from billable time entries.
 * 
 * Provides a filtering interface to select specific time entries and automatically
 * generate an invoice with line items. All filters are optional, allowing flexible
 * invoice generation scenarios from highly specific to very broad.
 * 
 * Form Fields (All Optional):
 * - **Client**: Filter time entries by specific client or include all clients
 * - **Project**: Filter time entries by specific project or include all projects
 * - **Start date**: Include time entries from this date onwards
 * - **End date**: Include time entries up to this date
 * 
 * Dynamic Project Filtering:
 * - When client is selected, project dropdown shows only that client's projects
 * - When no client is selected, all projects are shown
 * - Automatically updates when client selection changes
 * 
 * Validation Rules:
 * - End date must be after start date if both are provided
 * - All fields are optional - empty filters include all matching data
 * 
 * Generation Logic:
 * - Backend queries billable time entries matching the filter criteria
 * - Creates invoice with client from most common client in results
 * - Generates line items from each time entry (description, hours, rate, total)
 * - Calculates subtotal, tax, and total automatically
 * 
 * Modal Behavior:
 * - Resets form when modal closes
 * - Displays error messages from submission
 * - Disables submit button during generation
 * - Two-button footer: Cancel and Generate invoice
 * 
 * @component
 * @example
 * // Generate invoice for specific client and date range
 * <GenerateInvoiceModal
 *   open={isGenerateModalOpen}
 *   clients={clients}
 *   projects={projects}
 *   onSubmit={async (payload) => {
 *     const invoice = await generateInvoiceMutation.mutateAsync(payload);
 *     navigate(`/invoices/${invoice.id}`);
 *     setIsGenerateModalOpen(false);
 *   }}
 *   onClose={() => setIsGenerateModalOpen(false)}
 *   isSubmitting={generateInvoiceMutation.isPending}
 *   error={generateInvoiceMutation.error?.message}
 * />
 * 
 * @example
 * // Generate invoice for all unbilled time (no filters)
 * <GenerateInvoiceModal
 *   open={isGenerateModalOpen}
 *   clients={clients}
 *   projects={projects}
 *   onSubmit={async (payload) => {
 *     // payload will have all fields undefined, selecting all billable time
 *     const invoice = await generateInvoiceMutation.mutateAsync(payload);
 *     toast.success('Invoice generated successfully');
 *     setIsGenerateModalOpen(false);
 *   }}
 *   onClose={() => setIsGenerateModalOpen(false)}
 *   isSubmitting={generateInvoiceMutation.isPending}
 * />
 * 
 * @param {GenerateInvoiceModalProps} props - Component props
 * @returns {JSX.Element} Generate invoice modal component
 */
export const GenerateInvoiceModal: FC<GenerateInvoiceModalProps> = ({
  open,
  clients,
  projects,
  onSubmit,
  onClose,
  isSubmitting,
  error,
}) => {
  const { t } = useTranslation(['invoices', 'common']);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: DEFAULT_VALUES,
  });

  // Fetch invoice text templates
  const { data: templates } = useInvoiceTextTemplates();

  const selectedClientId = watch('client_id');
  const invoiceHeadline = watch('invoice_headline');
  const [showPlaceholderHint, setShowPlaceholderHint] = useState(false);

  useEffect(() => {
    if (!open) {
      reset(DEFAULT_VALUES);
      setShowPlaceholderHint(false);
    }
  }, [open, reset]);

  const filteredProjects = useMemo(() => {
    if (!selectedClientId) {
      return projects;
    }
    return projects.filter((project) => project.client_id === selectedClientId);
  }, [projects, selectedClientId]);

  // Filter templates by category
  const headerTemplates = (templates || []).filter(template => template.category === 'header' && template.is_active);
  const footerTemplates = (templates || []).filter(template => template.category === 'footer' && template.is_active);
  const termsTemplates = (templates || []).filter(template => template.category === 'payment_terms' && template.is_active);

  const handleFormSubmit = async (values: FormValues) => {
    const startIso = toISO(values.start_date);
    const endIso = toISO(values.end_date);

    if (startIso && endIso && new Date(startIso).getTime() > new Date(endIso).getTime()) {
      setError('end_date', { type: 'validate', message: t('generate.errors.endDateAfterStart') });
      return;
    }

    const payload: GenerateInvoiceFromTimeEntriesPayload = {
      client_id: values.client_id || undefined,
      project_id: values.project_id || undefined,
      start_date: startIso,
      end_date: endIso,
      invoice_headline: values.invoice_headline || undefined,
      header_template_id: values.header_template_id || undefined,
      footer_template_id: values.footer_template_id || undefined,
      terms_template_id: values.terms_template_id || undefined,
    };

    await onSubmit(payload);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('generate.title')}
      size="lg"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            {t('common:buttons.cancel')}
          </Button>
          <Button type="submit" form={formId} disabled={isSubmitting}>
            {isSubmitting ? t('generate.generating') : t('generate.submit')}
          </Button>
        </>
      }
    >
      <form id={formId} className="space-y-5" onSubmit={handleSubmit(handleFormSubmit)}>
        {error ? <Alert type="error" message={error} /> : null}

        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          {t('generate.client.label')}
          <select
            className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            {...register('client_id')}
          >
            <option value="">{t('generate.client.all')}</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          {t('generate.project.label')}
          <select
            className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            {...register('project_id')}
          >
            <option value="">{t('generate.project.all')}</option>
            {filteredProjects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            id="generate-start-date"
            label={t('generate.startDate')}
            type="date"
            {...register('start_date')}
            error={errors.start_date?.message}
          />
          <Input
            id="generate-end-date"
            label={t('generate.endDate')}
            type="date"
            {...register('end_date')}
            error={errors.end_date?.message}
          />
        </div>

        {/* Divider */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
            {t('generate.customization.title', 'Invoice Customization')}
          </h3>
        </div>

        {/* Invoice Headline */}
        <div>
          <Input
            id="generate-headline"
            label={t('generate.headline.label', 'Invoice Headline (Optional)')}
            placeholder={t('generate.headline.placeholder', 'e.g., {project_name} - {period}')}
            {...register('invoice_headline')}
            error={errors.invoice_headline?.message}
          />
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setShowPlaceholderHint(!showPlaceholderHint)}
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
            >
              {showPlaceholderHint ? '▼' : '▶'} {t('generate.headline.showPlaceholders', 'Available placeholders')}
            </button>
            {showPlaceholderHint && (
              <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-md text-xs space-y-1">
                {AVAILABLE_PLACEHOLDERS.map(({ key, label }) => (
                  <div key={key} className="flex justify-between">
                    <code className="text-indigo-600 dark:text-indigo-400">{key}</code>
                    <span className="text-gray-600 dark:text-gray-400">{label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          {invoiceHeadline && (
            <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-md">
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                {t('generate.headline.preview', 'Preview')}:
              </p>
              <p className="text-sm text-gray-900 dark:text-gray-100">
                {getPlaceholderPreview(invoiceHeadline)}
              </p>
            </div>
          )}
        </div>

        {/* Template Selections */}
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          {t('generate.headerTemplate.label', 'Header Template (Optional)')}
          <select
            className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            {...register('header_template_id')}
          >
            <option value="">{t('generate.template.none', 'None')}</option>
            {headerTemplates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          {t('generate.footerTemplate.label', 'Footer Template (Optional)')}
          <select
            className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            {...register('footer_template_id')}
          >
            <option value="">{t('generate.template.none', 'None')}</option>
            {footerTemplates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          {t('generate.termsTemplate.label', 'Payment Terms Template (Optional)')}
          <select
            className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            {...register('terms_template_id')}
          >
            <option value="">{t('generate.template.none', 'None')}</option>
            {termsTemplates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </label>
      </form>
    </Modal>
  );
};
