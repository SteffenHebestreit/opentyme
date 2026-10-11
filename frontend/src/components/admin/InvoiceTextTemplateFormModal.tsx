import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText } from 'lucide-react';
import {
  useCreateInvoiceTextTemplate,
  useUpdateInvoiceTextTemplate,
} from '../../hooks/api/useInvoiceTextTemplates';
import { Modal } from '../ui/Modal';
import { Button } from '../common/Button';
import { Input, CustomSelect, Textarea } from '../forms';
import { InvoiceTextTemplate, InvoiceTextTemplatePayload, TemplateCategory } from '../../api/types';
import PlaceholderHelper from '../business/invoices/PlaceholderHelper';
import { toast } from '../../lib/toast';
import { SettingsCheckbox } from './SettingsSection';

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
  const isSaving = createMutation.isPending || updateMutation.isPending;

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
      toast.error(t('admin.templates.form.operationError'), { description: err.response?.data?.message });
    }
  };

  return (
    <Modal
      open={open}
      title={template ? t('admin.templates.form.editTitle') : t('admin.templates.form.addTitle')}
      icon={<FileText className="h-4 w-4" />}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button onClick={onClose} variant="secondary" type="button">
            {t('admin.templates.form.cancelButton')}
          </Button>
          <Button
            onClick={handleSubmit}
            variant="primary"
            isLoading={isSaving}
          >
            {isSaving ? t('admin.templates.form.saving') : t('admin.templates.form.saveButton')}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
          <Input
            label={t('admin.templates.form.nameLabel')}
            name="name"
            value={formData.name}
            onChange={handleChange}
            placeholder={t('admin.templates.form.namePlaceholder')}
            required
          />

          <div className="mb-4">
            <CustomSelect
              label={t('admin.templates.form.categoryLabel')}
              value={formData.category}
              onChange={(value) => setFormData({ ...formData, category: value as TemplateCategory })}
              options={TEMPLATE_CATEGORIES}
              required
              size="md"
            />
          </div>
        </div>

        <Textarea
          label={t('admin.templates.form.contentLabel')}
          id="content"
          name="content"
          value={formData.content}
          onChange={handleChange}
          rows={8}
          required
          placeholder={t('admin.templates.form.contentPlaceholder')}
          helperText={t('admin.templates.form.contentDescription')}
          className="font-mono text-sm"
        />

        {/* Placeholder Helper */}
        <div className="mb-4">
          <PlaceholderHelper collapsed={true} />
        </div>

        <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
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
            className="tabular-nums"
          />
        </div>

        <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50/60 p-4 sm:flex-row sm:gap-8 dark:border-gray-800 dark:bg-white/[0.02]">
          <SettingsCheckbox
            name="is_default"
            checked={!!formData.is_default}
            onChange={handleChange}
            label={t('admin.templates.form.setDefaultLabel')}
          />
          <SettingsCheckbox
            name="is_active"
            checked={!!formData.is_active}
            onChange={handleChange}
            label={t('admin.templates.form.activeLabel')}
          />
        </div>
      </form>
    </Modal>
  );
};

export default InvoiceTextTemplateFormModal;
