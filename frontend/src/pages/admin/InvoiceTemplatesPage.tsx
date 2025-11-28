import React, { useState, useMemo } from 'react';
import { Plus, Edit2, Trash2, Star, Filter } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  useInvoiceTextTemplates,
  useDeleteInvoiceTextTemplate,
} from '../../hooks/api/useInvoiceTextTemplates';
import { Button } from '../../components/common/Button';
import { Alert } from '../../components/common/Alert';
import { Table, Column } from '../../components/common/Table';
import { CustomSelect } from '../../components/forms';
import InvoiceTextTemplateFormModal from '../../components/admin/InvoiceTextTemplateFormModal';
import { InvoiceTextTemplate, TemplateCategory } from '../../api/types';

/**
 * Admin page for managing invoice text templates.
 * Allows creating, editing, deleting, and filtering templates by category.
 */
const InvoiceTemplatesPage: React.FC = () => {
  const { t } = useTranslation('settings');
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<InvoiceTextTemplate | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<TemplateCategory | ''>('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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
    if (!window.confirm(t('admin.templates.deleteConfirm', { name: template.name }))) {
      return;
    }

    try {
      await deleteMutation.mutateAsync(template.id);
      setMessage({ type: 'success', text: t('admin.templates.deleteSuccess') });
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.message || t('admin.templates.deleteError') });
      setTimeout(() => setMessage(null), 5000);
    }
  };

  const handleModalSuccess = (successMessage: string) => {
    setShowModal(false);
    setEditingTemplate(null);
    setMessage({ type: 'success', text: successMessage });
    setTimeout(() => setMessage(null), 3000);
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
        <div>
          <div className="text-sm font-medium text-gray-900 dark:text-white">
            {template.name}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400 max-w-md truncate">
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
        <span className="text-sm text-gray-900 dark:text-white">
          {getCategoryLabel(template.category)}
        </span>
      ),
      sortable: true,
    },
    {
      key: 'language',
      accessorKey: 'language',
      header: t('admin.templates.language'),
      render: (template) => (
        <span className="text-sm text-gray-900 dark:text-white">
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
        <span
          className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
            template.is_active
              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
              : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
          }`}
        >
          {template.is_active ? t('admin.templates.active') : t('admin.templates.inactive')}
        </span>
      ),
      sortable: true,
    },
    {
      key: 'default',
      accessorKey: 'is_default',
      header: t('admin.templates.default'),
      render: (template) => (
        template.is_default ? (
          <Star className="w-5 h-5 text-yellow-500 fill-current" />
        ) : null
      ),
      sortable: true,
    },
    {
      key: 'actions',
      header: t('admin.templates.actions'),
      align: 'right',
      render: (template) => (
        <div className="flex justify-end space-x-4">
          <button
            onClick={() => handleEdit(template)}
            className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleDelete(template)}
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
      <Alert type="error" message={t('admin.templates.loadError')} />
    );
  }

  return (
    <>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{t('admin.templates.title')}</h2>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            {t('admin.templates.subtitle')}
          </p>
        </div>
        <Button onClick={handleAdd} variant="primary">
          <Plus className="w-4 h-4 mr-2" />
          {t('admin.templates.addButton')}
        </Button>
      </div>

      {message && (
        <div className="mb-4">
          <Alert type={message.type} message={message.text} />
        </div>
      )}

      <div className="mb-4 flex items-center space-x-2">
        <Filter className="w-5 h-5 text-gray-500" />
        <div className="w-64">
          <CustomSelect
            value={selectedCategory}
            onChange={(value) => setSelectedCategory(value as TemplateCategory | '')}
            options={TEMPLATE_CATEGORIES}
            size="md"
          />
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <Table
          data={templates || []}
          columns={columns}
          emptyMessage={t('admin.templates.noTemplatesMessage')}
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
    </>
  );
};

export default InvoiceTemplatesPage;
