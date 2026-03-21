/**
 * @fileoverview Invoice form modal component for creating and editing invoices.
 */

import { FC, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Alert } from '../../common/Alert';
import { Button } from '../../common/Button';
import { Input, CustomSelect, Textarea } from '../../forms';
import { Modal } from '../../ui/Modal';
import { Client, Invoice, InvoicePayload, InvoiceStatus, Project, InvoiceLineItemPayload, InvoiceItem } from '../../../api/types';
import { useTaxRates, useDefaultTaxRate } from '../../../hooks/api/useTaxRates';
import { useInvoiceTextTemplates } from '../../../hooks/api/useInvoiceTextTemplates';
import { useInvoice } from '../../../hooks/api/useInvoices';
import { CURRENCIES } from '../../../utils/currency';
import { AVAILABLE_PLACEHOLDERS, getPlaceholderPreview } from '../../../utils/placeholders';
import { InvoiceLineItemEditor, LineItemFormData, createEmptyLineItem, lineItemsToPayload } from './InvoiceLineItemEditor';

interface InvoiceFormModalProps {
  open: boolean;
  mode: 'create' | 'edit' | 'correct';
  clients: Client[];
  projects: Project[];
  initialInvoice?: Invoice | null;
  onSubmit: (payload: InvoicePayload, lineItems?: InvoiceLineItemPayload[]) => Promise<void>;
  onClose: () => void;
  isSubmitting: boolean;
  error?: string | null;
  correctionReason?: string;
  onCorrectionReasonChange?: (reason: string) => void;
}

interface FormValues {
  client_id: string;
  project_id: string;
  invoice_number: string;
  status: InvoiceStatus;
  issue_date: string;
  due_date: string;
  delivery_date: string;
  sub_total: string;
  currency: string;
  notes: string;
  tax_rate_id: string;
  invoice_headline: string;
  header_template_id: string;
  footer_template_id: string;
  terms_template_id: string;
  enable_zugferd: boolean;
  exclude_from_tax: boolean;
}

const DEFAULT_VALUES: FormValues = {
  client_id: '',
  project_id: '',
  invoice_number: '',
  status: 'draft',
  issue_date: '',
  due_date: '',
  delivery_date: '',
  sub_total: '',
  currency: 'EUR',
  notes: '',
  tax_rate_id: '',
  invoice_headline: '',
  header_template_id: '',
  footer_template_id: '',
  terms_template_id: '',
  enable_zugferd: false,
  exclude_from_tax: false,
};

const formId = 'invoice-form-modal';

function formatDateInput(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

export const InvoiceFormModal: FC<InvoiceFormModalProps> = ({
  open, mode, clients, projects, initialInvoice,
  onSubmit, onClose, isSubmitting, error,
  correctionReason, onCorrectionReasonChange,
}) => {
  const { t } = useTranslation(['invoices', 'common']);
  const hasClients = clients.length > 0;
  const [showPlaceholderHint, setShowPlaceholderHint] = useState(false);
  const [lineItems, setLineItems] = useState<LineItemFormData[]>([]);
  const isCorrection = mode === 'correct';

  const statusOptions: Array<{ label: string; value: InvoiceStatus }> = useMemo(() => [
    { label: t('status.draft'), value: 'draft' },
    { label: t('status.sent'), value: 'sent' },
    { label: t('status.paid'), value: 'paid' },
    { label: t('status.overdue'), value: 'overdue' },
    { label: t('status.cancelled'), value: 'cancelled' },
  ], [t]);

  const { data: taxRates } = useTaxRates(true);
  const { data: defaultTaxRate } = useDefaultTaxRate();
  const { data: templates } = useInvoiceTextTemplates();
  
  // Fetch invoice with items when editing or correcting
  const { data: invoiceWithItems } = useInvoice((mode === 'edit' || mode === 'correct') && open ? initialInvoice?.id : undefined);

  // Helper function to convert InvoiceItem to LineItemFormData
  const convertItemToFormData = (item: InvoiceItem): LineItemFormData => ({
    id: item.id,
    description: item.description || '',
    quantity: item.quantity?.toString() || '',
    rate_type: item.rate_type || 'hourly',
    unit_price: item.unit_price?.toString() || '',
    total_price: item.total_price?.toString() || '',
  });

  const headerTemplates = (templates || []).filter(template => template.category === 'header' && template.is_active);
  const footerTemplates = (templates || []).filter(template => template.category === 'footer' && template.is_active);
  const termsTemplates = (templates || []).filter(template => template.category === 'payment_terms' && template.is_active);

  const initialValues = useMemo<FormValues>(() => {
    if (!initialInvoice) return DEFAULT_VALUES;
    return {
      client_id: initialInvoice.client_id,
      project_id: initialInvoice.project_id ?? '',
      invoice_number: initialInvoice.invoice_number ?? '',
      status: initialInvoice.status,
      issue_date: formatDateInput(initialInvoice.issue_date),
      due_date: formatDateInput(initialInvoice.due_date),
      delivery_date: initialInvoice.delivery_date ?? '',
      sub_total: initialInvoice.sub_total?.toString() ?? '',
      currency: initialInvoice.currency ?? 'EUR',
      notes: initialInvoice.notes ?? '',
      tax_rate_id: initialInvoice.tax_rate_id ?? '',
      invoice_headline: initialInvoice.invoice_headline ?? '',
      header_template_id: initialInvoice.header_template_id ?? '',
      footer_template_id: initialInvoice.footer_template_id ?? '',
      terms_template_id: initialInvoice.terms_template_id ?? '',
      enable_zugferd: initialInvoice.enable_zugferd ?? false,
      exclude_from_tax: initialInvoice.exclude_from_tax ?? false,
    };
  }, [initialInvoice]);

  const { register, handleSubmit, reset, setError, watch, setValue, formState: { errors } } = useForm<FormValues>({
    defaultValues: initialValues,
  });

  const selectedClientId = watch('client_id');
  const invoiceHeadline = watch('invoice_headline');

  useEffect(() => {
    if (open) {
      reset(initialValues);
      setShowPlaceholderHint(false);
      // Reset line items for create mode, they will be loaded separately for edit/correct mode
      if (mode === 'create') {
        setLineItems([]);
      }
    }
  }, [initialValues, open, reset, mode]);

  // Load existing line items when editing or correcting
  useEffect(() => {
    if (open && (mode === 'edit' || mode === 'correct') && invoiceWithItems?.items && invoiceWithItems.items.length > 0) {
      setLineItems(invoiceWithItems.items.map(convertItemToFormData));
    } else if (open && (mode === 'edit' || mode === 'correct') && invoiceWithItems && (!invoiceWithItems.items || invoiceWithItems.items.length === 0)) {
      // Invoice loaded but has no items
      setLineItems([]);
    }
  }, [open, mode, invoiceWithItems]);

  useEffect(() => {
    if (open && mode === 'create' && !initialInvoice && defaultTaxRate && !watch('tax_rate_id')) {
      setValue('tax_rate_id', defaultTaxRate.id);
    }
  }, [open, mode, initialInvoice, defaultTaxRate, watch, setValue]);

  const filteredProjects = useMemo(() => {
    if (!selectedClientId) return projects;
    return projects.filter((project) => project.client_id === selectedClientId);
  }, [projects, selectedClientId]);

  const handleFormSubmit = async (values: FormValues) => {
    if (!values.client_id) {
      setError('client_id', { type: 'required', message: 'Select a client' });
      return;
    }
    if (!values.issue_date) {
      setError('issue_date', { type: 'required', message: 'Issue date is required' });
      return;
    }
    if (!values.due_date) {
      setError('due_date', { type: 'required', message: 'Due date is required' });
      return;
    }

    const issueDate = new Date(values.issue_date);
    const dueDate = new Date(values.due_date);

    if (Number.isNaN(issueDate.getTime())) {
      setError('issue_date', { type: 'validate', message: 'Enter a valid issue date' });
      return;
    }
    if (Number.isNaN(dueDate.getTime())) {
      setError('due_date', { type: 'validate', message: 'Enter a valid due date' });
      return;
    }
    if (dueDate.getTime() < issueDate.getTime()) {
      setError('due_date', { type: 'validate', message: 'Due date must be after the issue date' });
      return;
    }

    const payload: InvoicePayload = {
      client_id: values.client_id,
      project_id: values.project_id || undefined,
      invoice_number: values.invoice_number.trim() || undefined,
      status: values.status,
      issue_date: issueDate.toISOString(),
      due_date: dueDate.toISOString(),
      delivery_date: values.delivery_date.trim() || undefined,
      sub_total: values.sub_total ? Number(values.sub_total) : undefined,
      currency: values.currency.trim() || undefined,
      notes: values.notes.trim() || '',
      tax_rate_id: values.tax_rate_id || undefined,
      invoice_headline: values.invoice_headline.trim() || undefined,
      header_template_id: values.header_template_id || undefined,
      footer_template_id: values.footer_template_id || undefined,
      terms_template_id: values.terms_template_id || undefined,
      enable_zugferd: values.enable_zugferd,
      exclude_from_tax: values.exclude_from_tax,
    };

    // Get selected project name for line item descriptions
    const selectedProject = projects.find(p => p.id === values.project_id);
    const projectName = selectedProject?.name;

    // Convert line items to payload format
    const lineItemPayloads = lineItemsToPayload(lineItems, projectName);
    
    await onSubmit(payload, lineItemPayloads.length > 0 ? lineItemPayloads : undefined);
  };

  // Calculate subtotal from line items
  const lineItemsSubtotal = useMemo(() => {
    return lineItems.reduce((sum, item) => sum + (parseFloat(item.total_price) || 0), 0);
  }, [lineItems]);

  // Update sub_total when line items change
  useEffect(() => {
    if (lineItems.length > 0) {
      setValue('sub_total', lineItemsSubtotal.toFixed(2));
    }
  }, [lineItemsSubtotal, lineItems.length, setValue]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'create' ? t('form.title.create') : mode === 'correct' ? t('correction') : t('form.title.edit')}
      size="xl"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button type="submit" form={formId} disabled={isSubmitting || !hasClients}>
            {isSubmitting ? t('saving') : mode === 'create' ? t('form.submit.create') : mode === 'correct' ? t('form.submit.correct') : t('form.submit.edit')}
          </Button>
        </>
      }
    >
      <form id={formId} className="space-y-5" onSubmit={handleSubmit(handleFormSubmit)}>
        {error ? <Alert type="error" message={error} /> : null}
        {!hasClients ? <Alert type="warning" message={t('form.noClients')} /> : null}
        
        {/* Correction Reason - only show in correction mode */}
        {isCorrection && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
            <label className="block text-sm font-medium text-amber-800 dark:text-amber-200 mb-2">
              {t('correctionReason')}
            </label>
            <textarea
              value={correctionReason || ''}
              onChange={(e) => onCorrectionReasonChange?.(e.target.value)}
              placeholder={t('correctionReasonPlaceholder')}
              className="w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:border-amber-700 dark:bg-gray-800 dark:text-gray-100"
              rows={2}
            />
          </div>
        )}

        <CustomSelect
          label={t('form.client.label')}
          value={watch('client_id')}
          onChange={(value) => setValue('client_id', value)}
          options={[
            { value: '', label: t('form.client.placeholder') },
            ...clients.map((client) => ({ value: client.id, label: client.name }))
          ]}
          disabled={!hasClients}
          required
          error={errors.client_id?.message}
        />

        <CustomSelect
          label={t('form.project.label')}
          value={watch('project_id')}
          onChange={(value) => setValue('project_id', value)}
          options={[
            { value: '', label: t('form.project.placeholder') },
            ...filteredProjects.map((project) => ({ value: project.id, label: project.name }))
          ]}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            id="invoice-number"
            label={t('form.invoiceNumber.label')}
            placeholder={t('form.invoiceNumber.placeholder')}
            {...register('invoice_number')}
            error={errors.invoice_number?.message}
          />
          <CustomSelect
            label={t('form.status.label')}
            value={watch('status')}
            onChange={(value) => setValue('status', value as InvoiceStatus)}
            options={statusOptions}
            required
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            id="invoice-issue-date"
            label={t('form.issueDate.label')}
            type="date"
            {...register('issue_date')}
            error={errors.issue_date?.message}
          />
          <Input
            id="invoice-due-date"
            label={t('form.dueDate.label')}
            type="date"
            {...register('due_date')}
            error={errors.due_date?.message}
          />
        </div>

        <Input
          id="invoice-delivery-date"
          label={t('form.deliveryDate.label')}
          placeholder={t('form.deliveryDate.placeholder')}
          {...register('delivery_date')}
          error={errors.delivery_date?.message}
          helperText={t('form.deliveryDate.helperText')}
        />

        <CustomSelect
          label={t('form.currency.label')}
          value={watch('currency')}
          onChange={(value) => setValue('currency', value)}
          options={CURRENCIES.map((currency) => ({
            value: currency.code,
            label: `${currency.code} (${currency.symbol}) - ${currency.name}`
          }))}
        />

        <CustomSelect
          label={t('form.taxRate.label')}
          value={watch('tax_rate_id')}
          onChange={(value) => setValue('tax_rate_id', value)}
          options={[
            { value: '', label: t('form.taxRate.placeholder') },
            ...(taxRates?.map((rate) => ({
              value: rate.id,
              label: `${rate.name} (${rate.rate}%)`
            })) || [])
          ]}
        />

        {/* Line Items Section */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
          <InvoiceLineItemEditor
            lineItems={lineItems}
            onChange={setLineItems}
            disabled={isSubmitting}
          />
        </div>

        <Input
          id="invoice-sub-total"
          label={t('form.subTotal.label')}
          type="number"
          step="0.01"
          min="0"
          placeholder={t('form.subTotal.placeholder')}
          {...register('sub_total')}
          error={errors.sub_total?.message}
          disabled={lineItems.length > 0}
          className={lineItems.length > 0 ? 'bg-gray-100 dark:bg-gray-700' : ''}
        />

        <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
            {t('form.customization.title')}
          </h3>
        </div>

        <div>
          <Input
            id="invoice-headline"
            label={t('form.headline.label')}
            placeholder={t('form.headline.placeholder')}
            {...register('invoice_headline')}
            error={errors.invoice_headline?.message}
          />
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setShowPlaceholderHint(!showPlaceholderHint)}
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
            >
              {showPlaceholderHint ? '▼' : '▶'} {t('form.headline.showPlaceholders')}
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
                {t('form.headline.preview')}:
              </p>
              <p className="text-sm text-gray-900 dark:text-gray-100">
                {getPlaceholderPreview(invoiceHeadline)}
              </p>
            </div>
          )}
        </div>

        <CustomSelect
          label={t('form.headerTemplate.label')}
          value={watch('header_template_id')}
          onChange={(value) => setValue('header_template_id', value)}
          options={[
            { value: '', label: t('form.template.none') },
            ...headerTemplates.map((template) => ({
              value: template.id,
              label: template.name
            }))
          ]}
        />

        <CustomSelect
          label={t('form.footerTemplate.label')}
          value={watch('footer_template_id')}
          onChange={(value) => setValue('footer_template_id', value)}
          options={[
            { value: '', label: t('form.template.none') },
            ...footerTemplates.map((template) => ({
              value: template.id,
              label: template.name
            }))
          ]}
        />

        <CustomSelect
          label={t('form.termsTemplate.label')}
          value={watch('terms_template_id')}
          onChange={(value) => setValue('terms_template_id', value)}
          options={[
            { value: '', label: t('form.template.none') },
            ...termsTemplates.map((template) => ({
              value: template.id,
              label: template.name
            }))
          ]}
        />

        <Textarea
          label={t('form.notes.label')}
          value={watch('notes')}
          onChange={(e) => setValue('notes', e.target.value)}
          rows={4}
          placeholder={t('form.notes.placeholder')}
        />

        <div className="flex items-start space-x-3 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
          <input
            type="checkbox"
            id="enable_zugferd"
            checked={watch('enable_zugferd')}
            onChange={(e) => setValue('enable_zugferd', e.target.checked)}
            className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
          <div className="flex-1">
            <label htmlFor="enable_zugferd" className="text-sm font-medium text-gray-900 dark:text-white cursor-pointer">
              {t('form.zugferd.label')}
            </label>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              {t('form.zugferd.description')}
            </p>
          </div>
        </div>

        <div className="flex items-start space-x-3 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
          <input
            type="checkbox"
            id="exclude_from_tax"
            checked={watch('exclude_from_tax')}
            onChange={(e) => setValue('exclude_from_tax', e.target.checked)}
            className="mt-1 h-4 w-4 text-amber-600 focus:ring-amber-500 border-gray-300 rounded"
          />
          <div className="flex-1">
            <label htmlFor="exclude_from_tax" className="text-sm font-medium text-gray-900 dark:text-white cursor-pointer">
              {t('form.excludeFromTax.label')}
            </label>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              {t('form.excludeFromTax.description')}
            </p>
          </div>
        </div>
      </form>
    </Modal>
  );
};
