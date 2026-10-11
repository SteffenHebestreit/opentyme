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
import { Clock, Plus } from 'lucide-react';
import { Invoice, InvoiceLineItemPayload } from '../../../api/types';
import { Button } from '../../common/Button';
import { Alert } from '../../common/Alert';
import { SkeletonItem } from '../../common/Skeleton';
import { extractErrorMessage } from '../../../utils/error';
import { formatCurrency } from '../../../utils/currency';
import { toast } from '../../../lib/toast';
import { confirmDialog } from '../../../lib/confirm';
import { InvoiceFilters, InvoiceStatusFilter } from './InvoiceFilters';
import { InvoiceTable } from './InvoiceTable';
import { InvoiceFormModal } from './InvoiceFormModal';
import { InvoiceEmptyState } from './InvoiceEmptyState';
import { InvoiceDetailModal } from './InvoiceDetailModal';
import { GenerateInvoiceModal } from './GenerateInvoiceModal';
import { SummaryStrip, SummaryStripItem } from './SummaryStrip';

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

/** Placeholder shaped like the invoice table while data loads. */
function InvoiceTableSkeleton() {
  return (
    <div className="surface overflow-hidden" aria-busy="true">
      <div className="flex gap-6 border-b border-gray-100 bg-gray-50/80 px-5 py-3 dark:border-gray-800 dark:bg-white/[0.02]">
        <SkeletonItem className="h-3 w-20" />
        <SkeletonItem className="h-3 w-24" />
        <SkeletonItem className="hidden h-3 w-16 sm:block" />
        <SkeletonItem className="ml-auto h-3 w-16" />
      </div>
      <div className="divide-y divide-gray-100 dark:divide-gray-800/70">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="flex items-center gap-6 px-5 py-4">
            <div className="w-32 space-y-1.5">
              <SkeletonItem className="h-4 w-24" />
              <SkeletonItem className="h-3 w-32" />
            </div>
            <SkeletonItem className="h-4 w-28" />
            <SkeletonItem className="hidden h-5 w-16 rounded-full sm:block" />
            <SkeletonItem className="hidden h-4 w-20 md:block" />
            <div className="ml-auto space-y-1.5">
              <SkeletonItem className="ml-auto h-4 w-20" />
              <SkeletonItem className="ml-auto h-3 w-14" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface InvoiceListProps {
  startDate?: string;
  endDate?: string;
  initialSearchTerm?: string;
  /** Open the "create invoice" form (e.g. arriving via `?wizard=start`); confirmed via onCreateFormOpened */
  openCreateForm?: boolean;
  onCreateFormOpened?: () => void;
}

export default function InvoiceList({
  startDate: propStartDate,
  endDate: propEndDate,
  initialSearchTerm = '',
  openCreateForm = false,
  onCreateFormOpened,
}: InvoiceListProps = {}) {
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
  const [generateError, setGenerateError] = useState<string | null>(null);
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

  // Same flow as the "Create invoice" button, requested by the parent page
  useEffect(() => {
    if (!openCreateForm) {
      return;
    }
    setModalMode('create');
    setEditingInvoice(null);
    setFormError(null);
    setIsModalOpen(true);
    onCreateFormOpened?.();
  }, [openCreateForm, onCreateFormOpened]);

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
      project_name: invoice.project_id ? projectMap.get(invoice.project_id) : undefined,
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
    try {
      if (modalMode === 'create') {
        const newInvoice = await createInvoice.mutateAsync(payload);
        // Add line items if provided
        if (lineItems && lineItems.length > 0 && newInvoice?.id) {
          await addLineItems.mutateAsync({ id: newInvoice.id, items: lineItems });
        }
        toast.success(t('messages.createSuccess'));
      } else if (modalMode === 'correct' && editingInvoice) {
        // Handle correction mode - include all invoice fields that may have changed
        await correctInvoice.mutateAsync({
          id: editingInvoice.id,
          correction_reason: correctionReason || 'Correction',
          // Include invoice fields that may have been updated
          due_date: payload.due_date,
          issue_date: payload.issue_date,
          delivery_date: payload.delivery_date ?? undefined,
          notes: payload.notes ?? undefined,
          invoice_headline: payload.invoice_headline ?? undefined,
          items: lineItems?.map(item => ({
            description: item.description,
            quantity: item.quantity,
            unit_price: item.unit_price,
          })),
        });
        toast.success(t('messages.correctionSuccess'));
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
        toast.success(t('messages.updateSuccess'));
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
    const confirmed = await confirmDialog({
      title: t('delete'),
      message: t('messages.deleteConfirm', { number: invoice.invoice_number }),
      tone: 'danger',
      confirmLabel: t('delete'),
    });
    if (!confirmed) {
      return;
    }
    setDeletingId(invoice.id);
    try {
      await deleteInvoice.mutateAsync(invoice.id);
      toast.success(t('messages.deleteSuccess'));
    } catch (deleteErr) {
      toast.error(extractErrorMessage(deleteErr));
    } finally {
      setDeletingId(null);
    }
  };

  const handleGenerate = async (
    payload: Parameters<typeof generateInvoice.mutateAsync>[0],
  ) => {
    setGenerateError(null);
    try {
      await generateInvoice.mutateAsync(payload);
      toast.success(t('messages.generateSuccess'));
      setIsGenerateOpen(false);
    } catch (generateErr) {
      setGenerateError(extractErrorMessage(generateErr));
    }
  };

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


  const hasListFilters = statusFilter !== 'all' || clientFilter !== '' || searchTerm !== '';
  const clearListFilters = () => {
    setStatusFilter('all');
    setClientFilter('');
    setSearchTerm('');
  };

  const summaryItems: SummaryStripItem[] = [
    { key: 'total', label: t('summary.total'), value: filteredInvoices.length },
    { key: 'invoiced', label: t('summary.invoiced'), value: totalInvoiced, format: formatCurrency },
    { key: 'paid', label: t('summary.paid'), value: paidInvoices, format: formatCurrency, tone: 'text-emerald-600 dark:text-emerald-400' },
    { key: 'unpaid', label: t('summary.unpaid'), value: unpaidInvoices, format: formatCurrency, tone: 'text-amber-600 dark:text-amber-400' },
  ];

  if (!state.isAuthenticated) {
    return (
      <div className="surface p-6">
        <h2 className="section-title">{t('title')}</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('noAuth')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="section-title">{t('title')}</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t('subtitle')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            leftIcon={<Clock className="h-4 w-4" />}
            onClick={() => {
              setGenerateError(null);
              setIsGenerateOpen(true);
            }}
          >
            {t('generateButton')}
          </Button>
          <Button type="button" onClick={openCreateModal} leftIcon={<Plus className="h-4 w-4" />}>
            {t('create')}
          </Button>
        </div>
      </div>

      {/* Summary */}
      <SummaryStrip items={summaryItems} />

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
        <InvoiceTableSkeleton />
      ) : sortedInvoices.length === 0 ? (
        <InvoiceEmptyState
          onCreate={openCreateModal}
          filtered={invoices.length > 0}
          onClearFilters={hasListFilters ? clearListFilters : undefined}
        />
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
