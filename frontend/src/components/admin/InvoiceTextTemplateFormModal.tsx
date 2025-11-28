import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useCreateInvoiceTextTemplate,
  useUpdateInvoiceTextTemplate,
} from '../../hooks/api/useInvoiceTextTemplates';
import { Modal } from '../ui/Modal';
import { Button } from '../common/Button';
import { Input, CustomSelect, Textarea } from '../forms';
import { InvoiceTextTemplate, InvoiceTextTemplatePayload, TemplateCategory } from '../../api/types';
import PlaceholderHelper from '../business/invoices/PlaceholderHelper';

interface InvoiceTextTemplateFormModalProps {
  template: InvoiceTextTemplate | null;
  open: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

/**
 * Modal form for creating or editing invoice text templates.
 */
const InvoiceTextTemplateFormModal: React.FC<InvoiceTextTemplateFormModalProps> = ({
  template,
  open,
  onClose,
  onSuccess,
}) => {
  const { t } = useTranslation('settings');

  const TEMPLATE_CATEGORIES: { value: TemplateCategory; label: string }[] = [
    { value: 'tax_exemption', label: t('admin.templates.categories.taxExemption') },
    { value: 'payment_terms', label: t('admin.templates.categories.paymentTerms') },
    { value: 'legal_notice', label: t('admin.templates.categories.legalNotice') },
    { value: 'footer', label: t('admin.templates.categories.footer') },
    { value: 'header', label: t('admin.templates.categories.header') },
    { value: 'custom', label: t('admin.templates.categories.custom') },
  ];
  const [formData, setFormData] = useState<InvoiceTextTemplatePayload>({
    name: '',
    category: 'custom',
    content: '',
    language: 'en',
    is_default: false,
    is_active: true,
    sort_order: 0,
  });

  const createMutation = useCreateInvoiceTextTemplate();
  const updateMutation = useUpdateInvoiceTextTemplate();

  useEffect(() => {
    if (template) {
      setFormData({
        name: template.name,
        category: template.category,
        content: template.content,
        language: template.language,
        is_default: template.is_default,
        is_active: template.is_active,
        sort_order: template.sort_order,
      });
    }
  }, [template]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;

    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : type === 'number' ? parseInt(value) || 0 : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (template) {
        await updateMutation.mutateAsync({ id: template.id, data: formData });
        onSuccess(t('admin.templates.form.updateSuccess'));
      } else {
        await createMutation.mutateAsync(formData);
        onSuccess(t('admin.templates.form.createSuccess'));
      }
    } catch (err: any) {
      alert(err.response?.data?.message || t('admin.templates.form.operationError'));
    }
  };

  return (
    <Modal
      open={open}
      title={template ? t('admin.templates.form.editTitle') : t('admin.templates.form.addTitle')}
      onClose={onClose}
      size="xl"
      footer={
        <>
          <Button onClick={onClose} variant="secondary" type="button">
            {t('admin.templates.form.cancelButton')}
          </Button>
          <Button
            onClick={handleSubmit}
            variant="primary"
            disabled={createMutation.isPending || updateMutation.isPending}
          >
            {createMutation.isPending || updateMutation.isPending ? t('admin.templates.form.saving') : t('admin.templates.form.saveButton')}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label={t('admin.templates.form.nameLabel')}
          name="name"
          value={formData.name}
          onChange={handleChange}
          placeholder={t('admin.templates.form.namePlaceholder')}
          required
        />

        <CustomSelect
          label={t('admin.templates.form.categoryLabel')}
          value={formData.category}
          onChange={(value) => setFormData({ ...formData, category: value as TemplateCategory })}
          options={TEMPLATE_CATEGORIES}
          required
          size="md"
        />

        <div>
          <Textarea
            label={t('admin.templates.form.contentLabel')}
            id="content"
            name="content"
            value={formData.content}
            onChange={handleChange}
            rows={8}
            required
            placeholder={t('admin.templates.form.contentPlaceholder')}
            className="font-mono text-sm"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {t('admin.templates.form.contentDescription')}
          </p>
          
          {/* Placeholder Helper */}
          <div className="mt-3">
            <PlaceholderHelper collapsed={true} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label={t('admin.templates.form.languageLabel')}
            name="language"
            value={formData.language}
            onChange={handleChange}
            placeholder={t('admin.templates.form.languagePlaceholder')}
            maxLength={2}
            required
          />

          <Input
            label={t('admin.templates.form.sortLabel')}
            name="sort_order"
            type="number"
            value={formData.sort_order}
            onChange={handleChange}
            min="0"
          />
        </div>

        <div className="flex items-center space-x-6">
          <label className="flex items-center">
            <input
              type="checkbox"
              name="is_default"
              checked={formData.is_default}
              onChange={handleChange}
              className="mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              {t('admin.templates.form.setDefaultLabel')}
            </span>
          </label>

          <label className="flex items-center">
            <input
              type="checkbox"
              name="is_active"
              checked={formData.is_active}
              onChange={handleChange}
              className="mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">{t('admin.templates.form.activeLabel')}</span>
          </label>
        </div>
      </form>
    </Modal>
  );
};

export default InvoiceTextTemplateFormModal;
