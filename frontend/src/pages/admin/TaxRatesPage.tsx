import React, { useState, useMemo } from 'react';
import { Plus, Edit2, Trash2, Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTaxRates, useDeleteTaxRate, useSetDefaultTaxRate } from '../../hooks/api/useTaxRates';
import { Button } from '../../components/common/Button';
import { Alert } from '../../components/common/Alert';
import { Table, Column } from '../../components/common/Table';
import TaxRateFormModal from '../../components/admin/TaxRateFormModal';
import { TaxRate } from '../../api/types';

/**
 * Admin page for managing tax rates.
 * Allows creating, editing, deleting, and setting default tax rates.
 */
const TaxRatesPage: React.FC = () => {
  const { t } = useTranslation('settings');
  const [showModal, setShowModal] = useState(false);
  const [editingRate, setEditingRate] = useState<TaxRate | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const { data: taxRates, isLoading, error } = useTaxRates(false);
  const deleteMutation = useDeleteTaxRate();
  const setDefaultMutation = useSetDefaultTaxRate();

  const handleAdd = () => {
    setEditingRate(null);
    setShowModal(true);
  };

  const handleEdit = (rate: TaxRate) => {
    setEditingRate(rate);
    setShowModal(true);
  };

  const handleDelete = async (rate: TaxRate) => {
    if (!window.confirm(t('admin.taxRates.deleteConfirm', { name: rate.name }))) {
      return;
    }

    try {
      await deleteMutation.mutateAsync(rate.id);
      setMessage({ type: 'success', text: t('admin.taxRates.deleteSuccess') });
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.message || t('admin.taxRates.deleteError') });
      setTimeout(() => setMessage(null), 5000);
    }
  };

  const handleSetDefault = async (rate: TaxRate) => {
    try {
      await setDefaultMutation.mutateAsync(rate.id);
      setMessage({ type: 'success', text: t('admin.taxRates.setDefaultSuccess', { name: rate.name }) });
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.message || t('admin.taxRates.setDefaultError') });
      setTimeout(() => setMessage(null), 5000);
    }
  };

  const handleModalSuccess = (successMessage: string) => {
    setShowModal(false);
    setEditingRate(null);
    setMessage({ type: 'success', text: successMessage });
    setTimeout(() => setMessage(null), 3000);
  };

  const columns: Column<TaxRate>[] = useMemo(() => [
    {
      key: 'name',
      accessorKey: 'name',
      header: t('admin.taxRates.name'),
      render: (rate) => (
        <div>
          <div className="text-sm font-medium text-gray-900 dark:text-white">
            {rate.name}
          </div>
          {rate.description && (
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {rate.description}
            </div>
          )}
        </div>
      ),
      sortable: true,
    },
    {
      key: 'rate',
      accessorKey: 'rate',
      header: t('admin.taxRates.rate'),
      render: (rate) => (
        <span className="text-sm text-gray-900 dark:text-white">
          {parseFloat(rate.rate as any).toFixed(2)}%
        </span>
      ),
      sortable: true,
    },
    {
      key: 'country',
      accessorKey: 'country_code',
      header: t('admin.taxRates.country'),
      render: (rate) => (
        <span className="text-sm text-gray-900 dark:text-white">
          {rate.country_code || '-'}
        </span>
      ),
      sortable: true,
    },
    {
      key: 'status',
      accessorKey: 'is_active',
      header: t('admin.taxRates.status'),
      render: (rate) => (
        <span
          className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
            rate.is_active
              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
              : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
          }`}
        >
          {rate.is_active ? t('admin.taxRates.active') : t('admin.taxRates.inactive')}
        </span>
      ),
      sortable: true,
    },
    {
      key: 'default',
      accessorKey: 'is_default',
      header: t('admin.taxRates.default'),
      render: (rate) => (
        rate.is_default ? (
          <Star className="w-5 h-5 text-yellow-500 fill-current" />
        ) : (
          <button
            onClick={() => handleSetDefault(rate)}
            className="text-gray-400 hover:text-yellow-500 transition-colors"
            title={t('admin.taxRates.setDefault')}
          >
            <Star className="w-5 h-5" />
          </button>
        )
      ),
      sortable: true,
    },
    {
      key: 'actions',
      header: t('admin.taxRates.actions'),
      align: 'right',
      render: (rate) => (
        <div className="flex justify-end space-x-4">
          <button
            onClick={() => handleEdit(rate)}
            className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleDelete(rate)}
            className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ], [t]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert type="error" message={t('admin.taxRates.loadError')} />
      </div>
    );
  }

  return (
    <>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{t('admin.taxRates.title')}</h2>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            {t('admin.taxRates.subtitle')}
          </p>
        </div>
        <Button onClick={handleAdd} variant="primary">
          <Plus className="w-4 h-4 mr-2" />
          {t('admin.taxRates.addButton')}
        </Button>
      </div>

      {message && (
        <div className="mb-4">
          <Alert type={message.type} message={message.text} />
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <Table
          data={taxRates || []}
          columns={columns}
          emptyMessage={t('admin.taxRates.noRatesMessage')}
          pageSize={10}
        />
      </div>

      {showModal && (
        <TaxRateFormModal
          taxRate={editingRate}
          open={showModal}
          onClose={() => {
            setShowModal(false);
            setEditingRate(null);
          }}
          onSuccess={handleModalSuccess}
        />
      )}
    </>
  );
};

export default TaxRatesPage;
