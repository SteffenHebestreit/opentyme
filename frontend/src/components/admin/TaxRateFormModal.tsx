import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useCreateTaxRate, useUpdateTaxRate } from '../../hooks/api/useTaxRates';
import { Modal } from '../ui/Modal';
import { Button } from '../common/Button';
import { Input, Textarea } from '../forms';
import { TaxRate, TaxRatePayload } from '../../api/types';

interface TaxRateFormModalProps {
  taxRate: TaxRate | null;
  open: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

/**
 * Modal form for creating or editing tax rates.
 */
const TaxRateFormModal: React.FC<TaxRateFormModalProps> = ({ taxRate, open, onClose, onSuccess }) => {
  const { t } = useTranslation('settings');
  const [formData, setFormData] = useState<TaxRatePayload>({
    name: '',
    rate: 0,
    description: '',
    is_default: false,
    is_active: true,
    country_code: '',
    sort_order: 0,
  });

  const createMutation = useCreateTaxRate();
  const updateMutation = useUpdateTaxRate();

  useEffect(() => {
    if (taxRate) {
      setFormData({
        name: taxRate.name,
        rate: taxRate.rate,
        description: taxRate.description || '',
        is_default: taxRate.is_default,
        is_active: taxRate.is_active,
        country_code: taxRate.country_code || '',
        sort_order: taxRate.sort_order,
      });
    }
  }, [taxRate]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;

    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : type === 'number' ? parseFloat(value) || 0 : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (taxRate) {
        await updateMutation.mutateAsync({ id: taxRate.id, data: formData });
        onSuccess(t('admin.taxRates.form.updateSuccess'));
      } else {
        await createMutation.mutateAsync(formData);
        onSuccess(t('admin.taxRates.form.createSuccess'));
      }
    } catch (err: any) {
      alert(err.response?.data?.message || t('admin.taxRates.form.operationError'));
    }
  };

  return (
    <Modal
      open={open}
      title={taxRate ? t('admin.taxRates.form.editTitle') : t('admin.taxRates.form.addTitle')}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button onClick={onClose} variant="secondary" type="button">
            {t('admin.taxRates.form.cancelButton')}
          </Button>
          <Button
            onClick={handleSubmit}
            variant="primary"
            disabled={createMutation.isPending || updateMutation.isPending}
          >
            {createMutation.isPending || updateMutation.isPending ? t('admin.taxRates.form.saving') : t('admin.taxRates.form.saveButton')}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label={t('admin.taxRates.form.nameLabel')}
          name="name"
          value={formData.name}
          onChange={handleChange}
          placeholder={t('admin.taxRates.form.namePlaceholder')}
          required
        />

        <Input
          label={t('admin.taxRates.form.rateLabel')}
          name="rate"
          type="number"
          value={formData.rate}
          onChange={handleChange}
          step="0.01"
          min="0"
          max="100"
          required
        />

        <Textarea
          label={t('admin.taxRates.form.descriptionLabel')}
          id="description"
          name="description"
          value={formData.description || ''}
          onChange={handleChange}
          rows={3}
          placeholder={t('admin.taxRates.form.descriptionPlaceholder')}
        />

        <Input
          label={t('admin.taxRates.form.countryLabel')}
          name="country_code"
          value={formData.country_code || ''}
          onChange={handleChange}
          placeholder={t('admin.taxRates.form.countryPlaceholder')}
          maxLength={2}
        />

        <Input
          label={t('admin.taxRates.form.sortLabel')}
          name="sort_order"
          type="number"
          value={formData.sort_order}
          onChange={handleChange}
          min="0"
        />

        <div className="flex items-center space-x-6">
          <label className="flex items-center">
            <input
              type="checkbox"
              name="is_default"
              checked={formData.is_default}
              onChange={handleChange}
              className="mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">{t('admin.taxRates.form.setDefaultLabel')}</span>
          </label>

          <label className="flex items-center">
            <input
              type="checkbox"
              name="is_active"
              checked={formData.is_active}
              onChange={handleChange}
              className="mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">{t('admin.taxRates.form.activeLabel')}</span>
          </label>
        </div>
      </form>
    </Modal>
  );
};

export default TaxRateFormModal;
