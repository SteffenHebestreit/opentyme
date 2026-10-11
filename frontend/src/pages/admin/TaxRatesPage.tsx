import React, { useState, useMemo } from 'react';
import { Plus, Pencil, Percent, Trash2, Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTaxRates, useDeleteTaxRate, useSetDefaultTaxRate } from '../../hooks/api/useTaxRates';
import { Button } from '../../components/common/Button';
import { Alert } from '../../components/common/Alert';
import { Badge } from '../../components/common/Badge';
import { EmptyState } from '../../components/common/EmptyState';
import { SkeletonItem } from '../../components/common/Skeleton';
import { Table, Column } from '../../components/common/Table';
import { SettingsHeader } from '../../components/admin/SettingsSection';
import TaxRateFormModal from '../../components/admin/TaxRateFormModal';
import { TaxRate } from '../../api/types';
import { toast } from '../../lib/toast';
import { confirmDialog } from '../../lib/confirm';

const iconButton =
  'inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500';

/**
 * Admin page for managing tax rates.
 * Allows creating, editing, deleting, and setting default tax rates.
 */
const TaxRatesPage: React.FC = () => {
  const { t } = useTranslation('settings');
  const [showModal, setShowModal] = useState(false);
  const [editingRate, setEditingRate] = useState<TaxRate | null>(null);

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
    const confirmed = await confirmDialog({
      title: t('admin.taxRates.deleteTitle'),
      message: t('admin.taxRates.deleteConfirm', { name: rate.name }),
      tone: 'danger',
      confirmLabel: t('common:buttons.delete'),
    });
    if (!confirmed) {
      return;
    }

    try {
      await deleteMutation.mutateAsync(rate.id);
      toast.success(t('admin.taxRates.deleteSuccess'));
    } catch (err: any) {
      toast.error(t('admin.taxRates.deleteError'), { description: err.response?.data?.message });
    }
  };

  const handleSetDefault = async (rate: TaxRate) => {
    try {
      await setDefaultMutation.mutateAsync(rate.id);
      toast.success(t('admin.taxRates.setDefaultSuccess', { name: rate.name }));
    } catch (err: any) {
      toast.error(t('admin.taxRates.setDefaultError'), { description: err.response?.data?.message });
    }
  };

  const handleModalSuccess = (successMessage: string) => {
    setShowModal(false);
    setEditingRate(null);
    toast.success(successMessage);
  };

  const columns: Column<TaxRate>[] = useMemo(() => [
    {
      key: 'name',
      accessorKey: 'name',
      header: t('admin.taxRates.name'),
      render: (rate) => (
        <div className="min-w-0">
          <div className="font-medium text-gray-900 dark:text-white">
            {rate.name}
          </div>
          {rate.description && (
            <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
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
      align: 'right',
      render: (rate) => (
        <span className="font-medium tabular-nums text-gray-900 dark:text-white">
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
        rate.country_code ? (
          <span className="font-mono text-xs text-gray-700 dark:text-gray-300">{rate.country_code}</span>
        ) : (
          <span className="text-gray-400 dark:text-gray-500">—</span>
        )
      ),
      sortable: true,
    },
    {
      key: 'status',
      accessorKey: 'is_active',
      header: t('admin.taxRates.status'),
      render: (rate) => (
        <Badge variant={rate.is_active ? 'green' : 'gray'} dot>
          {rate.is_active ? t('admin.taxRates.active') : t('admin.taxRates.inactive')}
        </Badge>
      ),
      sortable: true,
    },
    {
      key: 'default',
      accessorKey: 'is_default',
      header: t('admin.taxRates.default'),
      align: 'center',
      render: (rate) => (
        rate.is_default ? (
          <span className="inline-flex h-8 w-8 items-center justify-center" title={t('admin.taxRates.default')}>
            <Star className="h-4 w-4 fill-amber-400 text-amber-500" aria-label={t('admin.taxRates.default')} />
          </span>
        ) : (
          <button
            type="button"
            onClick={() => handleSetDefault(rate)}
            className={`${iconButton} hover:bg-amber-50 hover:text-amber-500 dark:text-gray-500 dark:hover:bg-amber-500/10 dark:hover:text-amber-400`}
            title={t('admin.taxRates.setDefault')}
            aria-label={t('admin.taxRates.setDefault')}
          >
            <Star className="h-4 w-4" />
          </button>
        )
      ),
      sortable: true,
    },
    {
      key: 'actions',
      header: <span className="sr-only">{t('admin.taxRates.actions')}</span>,
      align: 'right',
      render: (rate) => (
        <div className="flex justify-end gap-1">
          <button
            type="button"
            onClick={() => handleEdit(rate)}
            className={`${iconButton} hover:bg-gray-100 hover:text-gray-700 dark:text-gray-500 dark:hover:bg-white/5 dark:hover:text-gray-200`}
            title={t('common:buttons.edit')}
            aria-label={t('common:buttons.edit')}
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => handleDelete(rate)}
            className={`${iconButton} hover:bg-red-50 hover:text-red-600 dark:text-gray-500 dark:hover:bg-red-500/10 dark:hover:text-red-400`}
            title={t('common:buttons.delete')}
            aria-label={t('common:buttons.delete')}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ], [t]);

  const header = (
    <SettingsHeader
      title={t('admin.taxRates.title')}
      description={t('admin.taxRates.subtitle')}
      actions={
        <Button type="button" onClick={handleAdd} leftIcon={<Plus className="h-4 w-4" />}>
          {t('admin.taxRates.addButton')}
        </Button>
      }
    />
  );

  if (isLoading) {
    return (
      <div className="space-y-6" aria-busy="true">
        {header}
        <div className="surface divide-y divide-gray-100 overflow-hidden dark:divide-gray-800">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-6 px-5 py-4">
              <SkeletonItem className="h-4 w-48" />
              <SkeletonItem className="ml-auto h-4 w-16" />
              <SkeletonItem className="h-5 w-16 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        {header}
        <Alert type="error" message={t('admin.taxRates.loadError')} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}

      <Table
        data={taxRates || []}
        columns={columns}
        emptyMessage={<EmptyState compact icon={Percent} title={t('admin.taxRates.noRatesMessage')} />}
        pageSize={10}
      />

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
    </div>
  );
};

export default TaxRatesPage;
