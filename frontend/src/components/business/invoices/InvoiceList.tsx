import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../../store/AppContext';
import { useClients } from '../../../hooks/api/useClients';
import { useProjects } from '../../../hooks/api/useProjects';
import {
  useAddInvoiceLineItems,
  useCreateInvoice,
  useCreateInvoiceCorrection,
  useDeleteInvoice,
  useGenerateInvoiceFromTimeEntries,
  useInvoices,
  useReplaceInvoiceLineItems,
  useUpdateInvoice,
} from '../../../hooks/api/useInvoices';
import { Invoice, InvoiceLineItemPayload } from '../../../api/types';
import { Button } from '../../common/Button';
import { Alert } from '../../common/Alert';
import { SkeletonCardList } from '../../common/Skeleton';
import { extractErrorMessage } from '../../../utils/error';
import { formatCurrency } from '../../../utils/currency';
import { InvoiceFilters, InvoiceStatusFilter } from './InvoiceFilters';
import { InvoiceTable } from './InvoiceTable';
import { InvoiceFormModal } from './InvoiceFormModal';
import { InvoiceEmptyState } from './InvoiceEmptyState';
import { InvoiceDetailModal } from './InvoiceDetailModal';
import { GenerateInvoiceModal } from './GenerateInvoiceModal';

function normalizeDate(value: string, endOfDay = false): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  if (endOfDay) {
    date.setHours(23, 59, 59, 999);
  }
  return date;
}

interface InvoiceListProps {
  startDate?: string;
  endDate?: string;
  initialSearchTerm?: string;
}

export default function InvoiceList({ startDate: propStartDate, endDate: propEndDate, initialSearchTerm = '' }: InvoiceListProps = {}) {
  const { t } = useTranslation('invoices');
  const { state } = useApp();
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm);
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearchTerm);
  const [statusFilter, setStatusFilter] = useState<InvoiceStatusFilter>('all');
  const [clientFilter, setClientFilter] = useState('');
  const [modalMode, setModalMode] = useState<'create' | 'edit' | 'correct'>('create');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [correctionReason, setCorrectionReason] = useState('');
  const [detailInvoiceId, setDetailInvoiceId] = useState<string | null>(null);
  const [isGenerateOpen, setIsGenerateOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const {
    data: invoices = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useInvoices();
  const {
    data: clients = [],
    isLoading: isLoadingClients,
    isError: isClientError,
    error: clientError,
    refetch: refetchClients,
  } = useClients();
  const {
    data: projects = [],
    isLoading: isLoadingProjects,
    isError: isProjectError,
    error: projectError,
    refetch: refetchProjects,
  } = useProjects();

  const createInvoice = useCreateInvoice();
  const updateInvoice = useUpdateInvoice();
  const deleteInvoice = useDeleteInvoice();
  const correctInvoice = useCreateInvoiceCorrection();
  const generateInvoice = useGenerateInvoiceFromTimeEntries();
  const addLineItems = useAddInvoiceLineItems();
  const replaceLineItems = useReplaceInvoiceLineItems();

  // Update search term when initialSearchTerm prop changes
  useEffect(() => {
    if (initialSearchTerm) {
      setSearchTerm(initialSearchTerm);
      setDebouncedSearch(initialSearchTerm);
    }
  }, [initialSearchTerm]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
    }, 300);
    return () => window.clearTimeout(handle);
  }, [searchTerm]);

  const startDateObj = useMemo(() => normalizeDate(propStartDate || ''), [propStartDate]);
  const endDateObj = useMemo(() => normalizeDate(propEndDate || '', true), [propEndDate]);

  const filteredInvoices = useMemo(() => {
    return invoices.filter((invoice) => {
      if (statusFilter !== 'all' && invoice.status !== statusFilter) {
        return false;
      }
      if (clientFilter && invoice.client_id !== clientFilter) {
        return false;
      }
      if (startDateObj) {
        const issue = new Date(invoice.issue_date ?? '');
        if (!Number.isNaN(issue.getTime()) && issue < startDateObj) {
          return false;
        }
      }
      if (endDateObj) {
        const issue = new Date(invoice.issue_date ?? '');
        if (!Number.isNaN(issue.getTime()) && issue > endDateObj) {
          return false;
        }
      }
      if (debouncedSearch) {
        const query = debouncedSearch.toLowerCase();
        const haystack = [
          invoice.invoice_number,
          invoice.client_name,
          invoice.notes,
        ];
        const matches = haystack
          .filter(Boolean)
          .some((value) => value?.toLowerCase().includes(query));
        if (!matches) {
          return false;
        }
      }
      return true;
    });
  }, [clientFilter, debouncedSearch, endDateObj, invoices, startDateObj, statusFilter]);

  const invoicesWithProjectNames = useMemo(() => {
    if (!projects.length) {
      return filteredInvoices;
    }
    const projectMap = new Map(projects.map((project) => [project.id, project.name]));
    return filteredInvoices.map((invoice) => ({
      ...invoice,
      project_name: invoice.project_id ? projectMap.get(invoice.project_id) ?? null : null,
    }));
  }, [filteredInvoices, projects]);

  const sortedInvoices = useMemo(() => {
    return [...invoicesWithProjectNames].sort((a, b) => {
      const aTime = a.issue_date ? new Date(a.issue_date).getTime() : 0;
      const bTime = b.issue_date ? new Date(b.issue_date).getTime() : 0;
      return bTime - aTime;
    });
  }, [invoicesWithProjectNames]);

  const openCreateModal = () => {
    setModalMode('create');
    setEditingInvoice(null);
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (invoice: Invoice) => {
    setModalMode('edit');
    setEditingInvoice(invoice);
    setFormError(null);
    setIsModalOpen(true);
  };

  const openCorrectionModal = (invoice: Invoice) => {
    setModalMode('correct');
    setEditingInvoice(invoice);
    setCorrectionReason('');
    setFormError(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingInvoice(null);
    setFormError(null);
    setCorrectionReason('');
  };

  const handleSubmit = async (
    payload: Parameters<typeof createInvoice.mutateAsync>[0],
    lineItems?: InvoiceLineItemPayload[],
  ) => {
    setFormError(null);
    setActionError(null);
    setSuccessMessage(null);
    try {
      if (modalMode === 'create') {
        const newInvoice = await createInvoice.mutateAsync(payload);
        // Add line items if provided
        if (lineItems && lineItems.length > 0 && newInvoice?.id) {
          await addLineItems.mutateAsync({ id: newInvoice.id, items: lineItems });
        }
        setSuccessMessage(t('messages.createSuccess'));
      } else if (modalMode === 'correct' && editingInvoice) {
        // Handle correction mode - include all invoice fields that may have changed
        await correctInvoice.mutateAsync({
          id: editingInvoice.id,
          correction_reason: correctionReason || 'Correction',
          // Include invoice fields that may have been updated
          due_date: payload.due_date,
          issue_date: payload.issue_date,
          delivery_date: payload.delivery_date,
          notes: payload.notes,
          invoice_headline: payload.invoice_headline,
          items: lineItems?.map(item => ({
            description: item.description,
            quantity: item.quantity,
            unit_price: item.unit_price,
          })),
        });
        setSuccessMessage(t('messages.correctionSuccess'));
        // Clear filters to ensure updated invoice is visible
        setStatusFilter('all');
        setClientFilter('');
        setSearchTerm('');
      } else if (editingInvoice) {
        await updateInvoice.mutateAsync({ id: editingInvoice.id, payload });
        // Replace line items in edit mode (deletes old items, adds new ones)
        if (lineItems) {
          await replaceLineItems.mutateAsync({ id: editingInvoice.id, items: lineItems });
        }
        setSuccessMessage(t('messages.updateSuccess'));
        // Clear filters to ensure updated invoice is visible
        setStatusFilter('all');
        setClientFilter('');
        setSearchTerm('');
      }
      closeModal();
    } catch (submitError) {
      setFormError(extractErrorMessage(submitError));
    }
  };

  const handleDelete = async (invoice: Invoice) => {
    const confirmed = window.confirm(
      t('messages.deleteConfirm', { number: invoice.invoice_number }),
    );
    if (!confirmed) {
      return;
    }
    setActionError(null);
    setSuccessMessage(null);
    setDeletingId(invoice.id);
    try {
      await deleteInvoice.mutateAsync(invoice.id);
      setSuccessMessage(t('messages.deleteSuccess'));
    } catch (deleteErr) {
      setActionError(extractErrorMessage(deleteErr));
    } finally {
      setDeletingId(null);
    }
  };

  const handleGenerate = async (
    payload: Parameters<typeof generateInvoice.mutateAsync>[0],
  ) => {
    setGenerateError(null);
    setSuccessMessage(null);
    try {
      await generateInvoice.mutateAsync(payload);
      setSuccessMessage(t('messages.generateSuccess'));
      setIsGenerateOpen(false);
    } catch (generateErr) {
      setGenerateError(extractErrorMessage(generateErr));
    }
  };

  if (!state.isAuthenticated) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">{t('title')}</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{t('noAuth')}</p>
        </div>
      </div>
    );
  }

  // Calculate summary statistics
  const totalInvoiced = useMemo(() => {
    return filteredInvoices.reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0);
  }, [filteredInvoices]);

  const paidInvoices = useMemo(() => {
    return filteredInvoices.filter(inv => inv.status === 'paid').reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0);
  }, [filteredInvoices]);

  const unpaidInvoices = useMemo(() => {
    return filteredInvoices.filter(inv => inv.status !== 'paid' && inv.status !== 'draft').reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0);
  }, [filteredInvoices]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900 dark:text-white">{t('title')}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('subtitle')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            onClick={() => {
              setGenerateError(null);
              setIsGenerateOpen(true);
            }}
          >
            {t('generateButton')}
          </Button>
          <Button type="button" onClick={openCreateModal}>
            {t('create')}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <InvoiceFilters
        search={searchTerm}
        status={statusFilter}
        clientId={clientFilter}
        onSearchChange={setSearchTerm}
        onStatusChange={setStatusFilter}
        onClientChange={setClientFilter}
        clients={clients}
      />

      {/* Summary Cards */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-lg border border-blue-200 dark:border-blue-900/30 bg-blue-50 dark:bg-blue-900/20 p-4">
            <div className="text-sm font-medium text-blue-600 dark:text-blue-400 mb-1">
              {t('summary.total')}
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {filteredInvoices.length}
            </div>
          </div>

          <div className="rounded-lg border border-indigo-200 dark:border-indigo-900/30 bg-indigo-50 dark:bg-indigo-900/20 p-4">
            <div className="text-sm font-medium text-indigo-600 dark:text-indigo-400 mb-1">
              {t('summary.invoiced')}
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {formatCurrency(totalInvoiced)}
            </div>
          </div>

          <div className="rounded-lg border border-green-200 dark:border-green-900/30 bg-green-50 dark:bg-green-900/20 p-4">
            <div className="text-sm font-medium text-green-600 dark:text-green-400 mb-1">
              {t('summary.paid')}
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {formatCurrency(paidInvoices)}
            </div>
          </div>

          <div className="rounded-lg border border-orange-200 dark:border-orange-900/30 bg-orange-50 dark:bg-orange-900/20 p-4">
            <div className="text-sm font-medium text-orange-600 dark:text-orange-400 mb-1">
              {t('summary.unpaid')}
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {formatCurrency(unpaidInvoices)}
            </div>
          </div>
        </div>
      </div>

      {successMessage ? (
        <Alert type="success" message={successMessage} onClose={() => setSuccessMessage(null)} />
      ) : null}

      {actionError ? (
        <Alert type="error" message={actionError} onClose={() => setActionError(null)} />
      ) : null}

      {isError ? (
        <Alert
          type="error"
          message={extractErrorMessage(error)}
          onClose={() => void refetch()}
        />
      ) : null}

      {isClientError ? (
        <Alert
          type="error"
          message={extractErrorMessage(clientError)}
          onClose={() => void refetchClients()}
        />
      ) : null}

      {isProjectError ? (
        <Alert
          type="error"
          message={extractErrorMessage(projectError)}
          onClose={() => void refetchProjects()}
        />
      ) : null}

      {isLoading || isLoadingClients || isLoadingProjects ? (
        <SkeletonCardList count={3} />
      ) : sortedInvoices.length === 0 ? (
        <InvoiceEmptyState onCreate={openCreateModal} />
      ) : (
        <InvoiceTable
          invoices={sortedInvoices}
          onView={(invoice) => setDetailInvoiceId(invoice.id)}
          onEdit={openEditModal}
          onCorrect={openCorrectionModal}
          onDelete={handleDelete}
          isDeletingId={deletingId}
        />
      )}

      <InvoiceFormModal
        open={isModalOpen}
        mode={modalMode}
        clients={clients}
        projects={projects}
        initialInvoice={editingInvoice ?? undefined}
        onSubmit={handleSubmit}
        onClose={closeModal}
        isSubmitting={createInvoice.isPending || updateInvoice.isPending || correctInvoice.isPending}
        error={formError}
        correctionReason={correctionReason}
        onCorrectionReasonChange={setCorrectionReason}
      />

      <InvoiceDetailModal
        open={Boolean(detailInvoiceId)}
        invoiceId={detailInvoiceId}
        onClose={() => setDetailInvoiceId(null)}
      />

      <GenerateInvoiceModal
        open={isGenerateOpen}
        clients={clients}
        projects={projects}
        onSubmit={handleGenerate}
        onClose={() => {
          setGenerateError(null);
          setIsGenerateOpen(false);
        }}
        isSubmitting={generateInvoice.isPending}
        error={generateError}
      />
    </div>
  );
}
