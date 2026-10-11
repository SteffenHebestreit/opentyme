import React, { useState, useMemo } from 'react';
import { Plus, Pencil, Trash2, Star, Filter, FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  useInvoiceTextTemplates,
  useDeleteInvoiceTextTemplate,
} from '../../hooks/api/useInvoiceTextTemplates';
import { Button } from '../../components/common/Button';
import { Alert } from '../../components/common/Alert';
import { Badge } from '../../components/common/Badge';
import { EmptyState } from '../../components/common/EmptyState';
import { SkeletonItem } from '../../components/common/Skeleton';
import { Table, Column } from '../../components/common/Table';
import { CustomSelect } from '../../components/forms';
import { SettingsHeader } from '../../components/admin/SettingsSection';
import InvoiceTextTemplateFormModal from '../../components/admin/InvoiceTextTemplateFormModal';
import { InvoiceTextTemplate, TemplateCategory } from '../../api/types';
import { toast } from '../../lib/toast';
import { confirmDialog } from '../../lib/confirm';

const iconButton =
  'inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500';

/**
 * Admin page for managing invoice text templates.
 * Allows creating, editing, deleting, and filtering templates by category.
 */
const InvoiceTemplatesPage: React.FC = () => {
  const { t } = useTranslation('settings');
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<InvoiceTextTemplate | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<TemplateCategory | ''>('');

  const TEMPLATE_CATEGORIES: { value: TemplateCategory | ''; label: string }[] = [
    { value: '', label: t('admin.templates.allCategories') },
    { value: 'tax_exemption', label: t('admin.templates.categories.taxExemption') },
    { value: 'payment_terms', label: t('admin.templates.categories.paymentTerms') },
    { value: 'legal_notice', label: t('admin.templates.categories.legalNotice') },
    { value: 'footer', label: t('admin.templates.categories.footer') },
    { value: 'header', label: t('admin.templates.categories.header') },
    { value: 'custom', label: t('admin.templates.categories.custom') },
  ];

  const { data: templates, isLoading, error } = useInvoiceTextTemplates(
    selectedCategory || undefined,
    false
  );
  const deleteMutation = useDeleteInvoiceTextTemplate();

  const handleAdd = () => {
    setEditingTemplate(null);
    setShowModal(true);
  };

  const handleEdit = (template: InvoiceTextTemplate) => {
    setEditingTemplate(template);
    setShowModal(true);
  };

  const handleDelete = async (template: InvoiceTextTemplate) => {
    const confirmed = await confirmDialog({
      title: t('admin.templates.deleteTitle'),
      message: t('admin.templates.deleteConfirm', { name: template.name }),
      tone: 'danger',
      confirmLabel: t('common:buttons.delete'),
    });
    if (!confirmed) {
      return;
    }

    try {
      await deleteMutation.mutateAsync(template.id);
      toast.success(t('admin.templates.deleteSuccess'));
    } catch (err: any) {
      toast.error(t('admin.templates.deleteError'), { description: err.response?.data?.message });
    }
  };

  const handleModalSuccess = (successMessage: string) => {
    setShowModal(false);
    setEditingTemplate(null);
    toast.success(successMessage);
  };

  const getCategoryLabel = (category: TemplateCategory): string => {
    const found = TEMPLATE_CATEGORIES.find((c) => c.value === category);
    return found ? found.label : category;
  };

  const columns: Column<InvoiceTextTemplate>[] = useMemo(() => [
    {
      key: 'name',
      accessorKey: 'name',
      header: t('admin.templates.name'),
      render: (template) => (
        <div className="min-w-0">
          <div className="font-medium text-gray-900 dark:text-white">
            {template.name}
          </div>
          <div className="mt-0.5 max-w-md truncate text-xs text-gray-500 dark:text-gray-400">
            {template.content.substring(0, 100)}
            {template.content.length > 100 && '...'}
          </div>
        </div>
      ),
      sortable: true,
    },
    {
      key: 'category',
      accessorKey: 'category',
      header: t('admin.templates.category'),
      render: (template) => (
        <Badge variant="brand">{getCategoryLabel(template.category)}</Badge>
      ),
      sortable: true,
    },
    {
      key: 'language',
      accessorKey: 'language',
      header: t('admin.templates.language'),
      render: (template) => (
        <span className="font-mono text-xs text-gray-700 dark:text-gray-300">
          {template.language.toUpperCase()}
        </span>
      ),
      sortable: true,
    },
    {
      key: 'status',
      accessorKey: 'is_active',
      header: t('admin.templates.status'),
      render: (template) => (
        <Badge variant={template.is_active ? 'green' : 'gray'} dot>
          {template.is_active ? t('admin.templates.active') : t('admin.templates.inactive')}
        </Badge>
      ),
      sortable: true,
    },
    {
      key: 'default',
      accessorKey: 'is_default',
      header: t('admin.templates.default'),
      align: 'center',
      render: (template) => (
        template.is_default ? (
          <Star
            className="mx-auto h-4 w-4 fill-amber-400 text-amber-500"
            aria-label={t('admin.templates.default')}
          />
        ) : null
      ),
      sortable: true,
    },
    {
      key: 'actions',
      header: <span className="sr-only">{t('admin.templates.actions')}</span>,
      align: 'right',
      render: (template) => (
        <div className="flex justify-end gap-1">
          <button
            type="button"
            onClick={() => handleEdit(template)}
            className={`${iconButton} hover:bg-gray-100 hover:text-gray-700 dark:text-gray-500 dark:hover:bg-white/5 dark:hover:text-gray-200`}
            title={t('common:buttons.edit')}
            aria-label={t('common:buttons.edit')}
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => handleDelete(template)}
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
      title={t('admin.templates.title')}
      description={t('admin.templates.subtitle')}
      actions={
        <Button type="button" onClick={handleAdd} leftIcon={<Plus className="h-4 w-4" />}>
          {t('admin.templates.addButton')}
        </Button>
      }
    />
  );

  const filter = (
    <div className="flex items-center gap-2">
      <Filter className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500" aria-hidden="true" />
      <div className="w-full sm:w-64">
        <CustomSelect
          value={selectedCategory}
          onChange={(value) => setSelectedCategory(value as TemplateCategory | '')}
          options={TEMPLATE_CATEGORIES}
          size="md"
        />
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="space-y-6" aria-busy="true">
        {header}
        <div className="surface divide-y divide-gray-100 overflow-hidden dark:divide-gray-800">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2 px-5 py-4">
              <SkeletonItem className="h-4 w-48" />
              <SkeletonItem className="h-3 w-80 max-w-full" />
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
        <Alert type="error" message={t('admin.templates.loadError')} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}

      <div className="space-y-4">
        {filter}

        <Table
          data={templates || []}
          columns={columns}
          emptyMessage={<EmptyState compact icon={FileText} title={t('admin.templates.noTemplatesMessage')} />}
          pageSize={10}
        />
      </div>

      {showModal && (
        <InvoiceTextTemplateFormModal
          template={editingTemplate}
          open={showModal}
          onClose={() => {
            setShowModal(false);
            setEditingTemplate(null);
          }}
          onSuccess={handleModalSuccess}
        />
      )}
    </div>
  );
};

export default InvoiceTemplatesPage;
