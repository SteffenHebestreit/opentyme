import { useEffect, useMemo, useState } from 'react';
import { getAppLocale } from '../../../utils/locale';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Users } from 'lucide-react';
import { useApp } from '../../../store/AppContext';
import { useClients, useCreateClient, useDeleteClient, useUpdateClient } from '../../../hooks/api/useClients';
import { Client } from '../../../api/types';
import { Button } from '../../common/Button';
import { Alert } from '../../common/Alert';
import { PageHeader } from '../../common/PageHeader';
import { EmptyState } from '../../common/EmptyState';
import { toast } from '../../../lib/toast';
import { confirmDialog } from '../../../lib/confirm';
import { TableSkeleton } from '../projects/uiParts';
import { ClientFilters, ClientStatusFilter } from './ClientFilters';
import { ClientTable } from './ClientTable';
import { ClientFormModal } from './ClientFormModal';
import { ClientDocumentsModal, ContractRateChange } from './ClientDocumentsModal';
import { useAddProjectRate, useUpdateProjectRate } from '../../../hooks/api/useProjectRates';
import type { SavedProjectRate } from '../../../api/services/project-rate.service';
import { formatYmd } from '../../../utils/date';
import { ClientEmptyState } from './ClientEmptyState';
import { extractErrorMessage } from '../../../utils/error';
import {
  ClientDocument,
  ClientDocumentUpdatePayload,
  ClientDocumentUploadPayload,
} from '../../../api/services/client-document.service';
import {
  useDeleteClientDocument,
  useUpdateClientDocument,
  useUploadClientDocument,
} from '../../../hooks/api/useClientDocuments';

export default function ClientList() {
  const { t, i18n } = useTranslation('clients');
  const { state } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ClientStatusFilter>('all');
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [documentsClient, setDocumentsClient] = useState<Client | null>(null);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [documentSuccess, setDocumentSuccess] = useState<string | null>(null);
  const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(null);

  const listParams = useMemo(() => {
    return {
      search: debouncedSearch || undefined,
      status: statusFilter === 'all' ? undefined : statusFilter,
    };
  }, [debouncedSearch, statusFilter]);

  const { data, isLoading, isError, error, refetch } = useClients(listParams);
  const createClient = useCreateClient();
  const updateClient = useUpdateClient();
  const deleteClient = useDeleteClient();
  const uploadDocument = useUploadClientDocument();
  const addProjectRate = useAddProjectRate();
  const updateProjectRate = useUpdateProjectRate();
  const updateDocument = useUpdateClientDocument();
  const deleteDocument = useDeleteClientDocument();

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
    }, 300);
    return () => window.clearTimeout(handle);
  }, [searchTerm]);

  useEffect(() => {
    if (searchParams.get('modal') === 'new' && !isModalOpen) {
      setModalMode('create');
      setEditingClient(null);
      setFormError(null);
      setIsModalOpen(true);
    }
  }, [isModalOpen, searchParams]);

  // Use data directly, ensuring it updates when the query result changes
  const clients = useMemo(() => data ?? [], [data]);

  const openCreateModal = () => {
    setModalMode('create');
    setEditingClient(null);
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (client: Client) => {
    setModalMode('edit');
    setEditingClient(client);
    setFormError(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingClient(null);
    setFormError(null);
    if (searchParams.get('modal')) {
      const next = new URLSearchParams(searchParams);
      next.delete('modal');
      setSearchParams(next, { replace: true });
    }
  };

  const handleSubmit = async (payload: Parameters<typeof createClient.mutateAsync>[0]) => {
    setFormError(null);
    try {
      if (modalMode === 'create') {
        await createClient.mutateAsync(payload);
        toast.success(t('messages.created'));
      } else if (editingClient) {
        await updateClient.mutateAsync({ id: editingClient.id, payload });
        toast.success(t('messages.updated'));
      }
      closeModal();
    } catch (submitError) {
      setFormError(extractErrorMessage(submitError));
    }
  };

  const handleDelete = async (client: Client) => {
    const confirmed = await confirmDialog({
      title: t('messages.deleteTitle'),
      message: t('messages.deleteConfirm', { name: client.name }),
      tone: 'danger',
      confirmLabel: t('delete'),
      cancelLabel: t('cancel'),
    });
    if (!confirmed) {
      return;
    }
    setDeleteError(null);
    setDeletingId(client.id);
    try {
      await deleteClient.mutateAsync(client.id);
      toast.success(t('messages.deleted'));
    } catch (deleteErr) {
      setDeleteError(extractErrorMessage(deleteErr));
    } finally {
      setDeletingId(null);
    }
  };

  const openDocumentsModal = (client: Client) => {
    setDocumentError(null);
    setDocumentSuccess(null);
    setDocumentsClient(client);
  };

  const closeDocumentsModal = () => {
    setDocumentsClient(null);
    setDocumentError(null);
    setDocumentSuccess(null);
  };

  const handleDocumentUpload = async (payload: ClientDocumentUploadPayload) => {
    if (!documentsClient) {
      return false;
    }
    setDocumentError(null);
    setDocumentSuccess(null);
    try {
      await uploadDocument.mutateAsync({ clientId: documentsClient.id, payload });
      setDocumentSuccess(
        payload.supersedes_document_id
          ? t('documents.messages.versionUploaded')
          : t('documents.messages.uploaded')
      );
      return true;
    } catch (uploadError) {
      setDocumentError(extractErrorMessage(uploadError));
      return false;
    }
  };

  const handleDocumentUpdate = async (
    documentId: string,
    payload: ClientDocumentUpdatePayload
  ) => {
    setDocumentError(null);
    setDocumentSuccess(null);
    try {
      await updateDocument.mutateAsync({ documentId, payload });
      setDocumentSuccess(t('documents.messages.updated'));
      return true;
    } catch (updateError) {
      setDocumentError(extractErrorMessage(updateError));
      return false;
    }
  };

  /** The modal has already asked for confirmation inline. */
  const handleDocumentDelete = async (document: ClientDocument) => {
    setDocumentError(null);
    setDocumentSuccess(null);
    setDeletingDocumentId(document.id);
    try {
      await deleteDocument.mutateAsync(document.id);
      setDocumentSuccess(t('documents.messages.deleted'));
      return true;
    } catch (documentDeleteError) {
      setDocumentError(extractErrorMessage(documentDeleteError));
      return false;
    } finally {
      setDeletingDocumentId(null);
    }
  };

  /**
   * Stores the new hourly rate set while uploading/extending a contract. Goes
   * through the same rate timeline as the project's rate dialog, so a contract
   * extension and a manual rate change can never disagree.
   */
  const handleContractRateChange = async (change: ContractRateChange): Promise<SavedProjectRate | null> => {
    const payload = {
      hourly_rate: change.hourly_rate,
      valid_from: change.valid_from,
      note: change.note,
      apply_to_existing: change.apply_to_existing,
    };
    try {
      const saved = change.replaceRateId
        ? await updateProjectRate.mutateAsync({ projectId: change.projectId, rateId: change.replaceRateId, payload })
        : await addProjectRate.mutateAsync({ projectId: change.projectId, payload });
      const rate = new Intl.NumberFormat(getAppLocale(), {
        style: 'currency',
        currency: change.currency || 'EUR',
      }).format(saved.hourly_rate);
      const parts = [
        t('documents.rate.saved', { rate, date: formatYmd(saved.valid_from, i18n.language) }),
      ];
      if (saved.repriced_entries) {
        parts.push(t('documents.rate.repriced', { count: saved.repriced_entries, rate }));
      }
      setDocumentSuccess((previous) => [previous, ...parts].filter(Boolean).join(' '));
      return saved;
    } catch (rateError) {
      // The document itself is already stored — say exactly what did not happen.
      setDocumentError(t('documents.rate.failed', { reason: extractErrorMessage(rateError) }));
      return null;
    }
  };

  const isFiltered = searchTerm.trim() !== '' || statusFilter !== 'all';
  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
  };

  if (!state.isAuthenticated) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('title')} />
        <EmptyState icon={Users} title={t('noAuth')} bordered />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        icon={Users}
        actions={
          <Button type="button" onClick={openCreateModal} leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}>
            {t('addClient')}
          </Button>
        }
      />

      <ClientFilters
        search={searchTerm}
        status={statusFilter}
        onSearchChange={setSearchTerm}
        onStatusChange={setStatusFilter}
      />

      {deleteError ? (
        <Alert type="error" message={deleteError} onClose={() => setDeleteError(null)} />
      ) : null}

      {isError ? (
        <Alert
          type="error"
          message={extractErrorMessage(error)}
          onClose={() => {
            setDeleteError(null);
            void refetch();
          }}
        />
      ) : null}

      {isLoading ? (
        <TableSkeleton columns={5} label={t('loading')} />
      ) : clients.length === 0 ? (
        <ClientEmptyState onCreate={openCreateModal} onClearFilters={isFiltered ? clearFilters : undefined} />
      ) : (
        <ClientTable 
          key={`${statusFilter}-${debouncedSearch}`}
          clients={clients} 
          onEdit={openEditModal}
          onDelete={handleDelete}
          onOpenDocuments={openDocumentsModal}
          isDeletingId={deletingId}
        />
      )}

      <ClientFormModal
        open={isModalOpen}
        mode={modalMode}
        initialClient={editingClient}
        onSubmit={handleSubmit}
        onClose={closeModal}
        isSubmitting={createClient.isPending || updateClient.isPending}
        error={formError}
      />

      {documentsClient ? (
        <ClientDocumentsModal
          open={Boolean(documentsClient)}
          client={documentsClient}
          onClose={closeDocumentsModal}
          onUpload={handleDocumentUpload}
          onUpdate={handleDocumentUpdate}
          onDelete={handleDocumentDelete}
          onRateChange={handleContractRateChange}
          isUploading={uploadDocument.isPending}
          isSaving={updateDocument.isPending}
          deletingId={deletingDocumentId}
          error={documentError}
          successMessage={documentSuccess}
          onDismissError={() => setDocumentError(null)}
          onDismissSuccess={() => setDocumentSuccess(null)}
        />
      ) : null}
    </div>
  );
}
