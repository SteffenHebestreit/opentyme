import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FolderKanban, Plus } from 'lucide-react';
import { useApp } from '../../../store/AppContext';
import { useClients } from '../../../hooks/api/useClients';
import {
  useCreateProject,
  useDeleteProject,
  useProjects,
  useUpdateProject,
} from '../../../hooks/api/useProjects';
import {
  useAddProjectRate,
  useAlignProjectRate,
  useDeleteProjectRate,
  useProjectRates,
  useUpdateProjectRate,
} from '@/hooks/api/useProjectRates';
import type {
  ProjectRatePayload,
  ProjectRatePeriod,
  ProjectRateUpdatePayload,
  SavedProjectRate,
} from '@/api/services/project-rate.service';
import { Project } from '../../../api/types';
import { Button } from '../../common/Button';
import { Alert } from '../../common/Alert';
import { PageHeader } from '../../common/PageHeader';
import { EmptyState } from '../../common/EmptyState';
import { toast } from '../../../lib/toast';
import { confirmDialog } from '../../../lib/confirm';
import { extractErrorMessage } from '../../../utils/error';
import { ProjectFilters, ProjectStatusFilter } from './ProjectFilters';
import { ProjectTable } from './ProjectTable';
import { ProjectFormModal } from './ProjectFormModal';
import { ProjectRatesModal } from './ProjectRatesModal';
import { ProjectEmptyState } from './ProjectEmptyState';
import { TableSkeleton } from './uiParts';
import { formatCurrency } from '@/utils/currency';
import { formatYmd } from '@/utils/date';

/**
 * A duplicate rate start date comes back as a 409 rather than a server fault,
 * so it gets a plain, translated explanation instead of a raw error message.
 *
 * @param {unknown} error - The rejection from a rate mutation
 * @returns {boolean} True when the backend reported a conflict
 */
const isConflictError = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  (error as { response?: { status?: number } }).response?.status === 409;

export default function ProjectList() {
  const { t, i18n } = useTranslation('projects');
  const { state } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProjectStatusFilter>('all');
  const [clientFilter, setClientFilter] = useState('');
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [ratesProject, setRatesProject] = useState<Project | null>(null);
  const [isRatesModalOpen, setIsRatesModalOpen] = useState(false);
  const [rateFormError, setRateFormError] = useState<string | null>(null);
  const [deletingRateId, setDeletingRateId] = useState<string | null>(null);

  const listParams = useMemo(() => {
    return {
      search: debouncedSearch || undefined,
      status: statusFilter === 'all' ? undefined : statusFilter,
      clientId: clientFilter || undefined,
    };
  }, [clientFilter, debouncedSearch, statusFilter]);

  const {
    data: projects = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useProjects(listParams);
  const {
    data: clients = [],
    isLoading: isLoadingClients,
    isError: isClientError,
    error: clientError,
    refetch: refetchClients,
  } = useClients();
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();

  const {
    data: rates = [],
    isLoading: isLoadingRates,
    isError: isRatesError,
    error: ratesError,
  } = useProjectRates(ratesProject?.id, isRatesModalOpen);
  const addProjectRate = useAddProjectRate();
  const updateProjectRate = useUpdateProjectRate();
  const deleteProjectRate = useDeleteProjectRate();
  const alignProjectRate = useAlignProjectRate();
  const [aligningRateId, setAligningRateId] = useState<string | null>(null);

  const projectsWithClientNames = useMemo(() => {
    if (!clients.length) {
      return projects;
    }
    const clientNameMap = new Map(clients.map((client) => [client.id, client.name]));
    return projects.map((project) => ({
      ...project,
      client_name: project.client_name ?? clientNameMap.get(project.client_id) ?? null,
    }));
  }, [clients, projects]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
    }, 300);
    return () => window.clearTimeout(handle);
  }, [searchTerm]);

  useEffect(() => {
    if (searchParams.get('modal') === 'new' && !isModalOpen) {
      setModalMode('create');
      setEditingProject(null);
      setFormError(null);
      setIsModalOpen(true);
    }
  }, [isModalOpen, searchParams]);

  const openCreateModal = () => {
    setModalMode('create');
    setEditingProject(null);
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (project: Project) => {
    setModalMode('edit');
    setEditingProject(project);
    setFormError(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingProject(null);
    setFormError(null);
    if (searchParams.get('modal')) {
      const next = new URLSearchParams(searchParams);
      next.delete('modal');
      setSearchParams(next, { replace: true });
    }
  };

  const handleSubmit = async (payload: Parameters<typeof createProject.mutateAsync>[0]) => {
    setFormError(null);
    setActionError(null);
    try {
      if (modalMode === 'create') {
        await createProject.mutateAsync(payload);
        toast.success(t('messages.created'));
      } else if (editingProject) {
        const updated = await updateProject.mutateAsync({ id: editingProject.id, payload });
        const messages: string[] = [];
        if (payload.hourly_rate_valid_from && payload.hourly_rate != null) {
          messages.push(
            t('rates.messages.saved', {
              rate: formatCurrency(payload.hourly_rate, editingProject.currency || 'EUR'),
              date: formatYmd(payload.hourly_rate_valid_from, i18n.language),
            })
          );
        }
        if (updated.repriced_entries) {
          messages.push(
            t('rates.messages.repriced', {
              count: updated.repriced_entries,
              rate: formatCurrency(payload.hourly_rate ?? 0, editingProject.currency || 'EUR'),
            })
          );
        }
        // The rate details can be long — keep the title short and put them underneath.
        toast.success(t('messages.updated'), messages.length ? { description: messages.join(' '), duration: 6500 } : undefined);
      }
      closeModal();
    } catch (submitError) {
      setFormError(extractErrorMessage(submitError));
    }
  };

  const openRatesModal = (project: Project) => {
    setRatesProject(project);
    setRateFormError(null);
    setIsRatesModalOpen(true);
  };

  const closeRatesModal = () => {
    setIsRatesModalOpen(false);
    setRatesProject(null);
    setRateFormError(null);
  };

  /**
   * Stores a rate period, either new or corrected.
   *
   * @returns {Promise<boolean>} True when the period was stored, so the modal knows
   * whether it may clear its draft.
   */
  /**
   * Stores a rate period, either new or corrected. Success feedback is shown
   * inside the rates modal, where the user is looking.
   *
   * @returns {Promise<SavedProjectRate | null>} The stored period, or null on failure
   */
  const handleRateSubmit = async (
    payload: ProjectRatePayload | ProjectRateUpdatePayload,
    rateId?: string
  ): Promise<SavedProjectRate | null> => {
    if (!ratesProject) {
      return null;
    }
    setRateFormError(null);
    setActionError(null);
    try {
      if (rateId) {
        return await updateProjectRate.mutateAsync({
          projectId: ratesProject.id,
          rateId,
          payload: payload as ProjectRateUpdatePayload,
        });
      }
      return await addProjectRate.mutateAsync({
        projectId: ratesProject.id,
        payload: payload as ProjectRatePayload,
      });
    } catch (submitError) {
      setRateFormError(
        isConflictError(submitError)
          ? t('rates.messages.conflict')
          : extractErrorMessage(submitError)
      );
      return null;
    }
  };

  /** Removes a period. The modal has already asked for confirmation inline. */
  const handleRateDelete = async (rate: ProjectRatePeriod): Promise<boolean> => {
    if (!ratesProject) {
      return false;
    }
    setRateFormError(null);
    setActionError(null);
    setDeletingRateId(rate.id);
    try {
      await deleteProjectRate.mutateAsync({ projectId: ratesProject.id, rateId: rate.id });
      return true;
    } catch (deleteErr) {
      setRateFormError(extractErrorMessage(deleteErr));
      return false;
    } finally {
      setDeletingRateId(null);
    }
  };

  /** Moves a period's entries onto its rate (those at `fromRate` only). */
  const handleRateAlign = async (rate: ProjectRatePeriod, fromRate: number | null): Promise<number | null> => {
    if (!ratesProject) {
      return null;
    }
    setRateFormError(null);
    setAligningRateId(rate.id);
    try {
      return await alignProjectRate.mutateAsync({ projectId: ratesProject.id, rateId: rate.id, fromRate });
    } catch (alignError) {
      setRateFormError(extractErrorMessage(alignError));
      return null;
    } finally {
      setAligningRateId(null);
    }
  };

  /** From the project form: jump to the rate history of the same project. */
  const showRateHistory = (project: Project) => {
    closeModal();
    openRatesModal(project);
  };

  const handleDelete = async (project: Project) => {
    const confirmed = await confirmDialog({
      title: t('messages.deleteTitle'),
      message: t('messages.deleteConfirm', { name: project.name }),
      tone: 'danger',
      confirmLabel: t('delete'),
      cancelLabel: t('cancel'),
    });
    if (!confirmed) {
      return;
    }
    setActionError(null);
    setDeletingId(project.id);
    try {
      await deleteProject.mutateAsync(project.id);
      toast.success(t('messages.deleted'));
    } catch (deleteErr) {
      setActionError(extractErrorMessage(deleteErr));
    } finally {
      setDeletingId(null);
    }
  };

  const isFiltered = searchTerm.trim() !== '' || statusFilter !== 'all' || clientFilter !== '';
  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setClientFilter('');
  };

  if (!state.isAuthenticated) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('title')} />
        <EmptyState icon={FolderKanban} title={t('noAuth')} bordered />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        icon={FolderKanban}
        actions={
          <Button type="button" onClick={openCreateModal} leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}>
            {t('addProject')}
          </Button>
        }
      />

      <ProjectFilters
        search={searchTerm}
        status={statusFilter}
        clientId={clientFilter}
        clients={clients}
        onSearchChange={setSearchTerm}
        onStatusChange={setStatusFilter}
        onClientChange={setClientFilter}
      />

      {actionError ? (
        <Alert type="error" message={actionError} onClose={() => setActionError(null)} />
      ) : null}

      {isError ? (
        <Alert
          type="error"
          message={extractErrorMessage(error)}
          onClose={() => {
            setActionError(null);
            void refetch();
          }}
        />
      ) : null}

      {isClientError ? (
        <Alert
          type="error"
          message={extractErrorMessage(clientError)}
          onClose={() => void refetchClients()}
        />
      ) : null}

      {isLoading || isLoadingClients ? (
        <TableSkeleton columns={6} label={t('loading')} />
      ) : projects.length === 0 ? (
        <ProjectEmptyState onCreate={openCreateModal} onClearFilters={isFiltered ? clearFilters : undefined} />
      ) : (
        <ProjectTable
          projects={projectsWithClientNames}
          onEdit={openEditModal}
          onManageRates={openRatesModal}
          onDelete={handleDelete}
          isDeletingId={deletingId}
        />
      )}

      <ProjectFormModal
        open={isModalOpen}
        mode={modalMode}
        initialProject={editingProject}
        clients={clients}
        onSubmit={handleSubmit}
        onClose={closeModal}
        isSubmitting={createProject.isPending || updateProject.isPending}
        error={formError}
        onShowRateHistory={showRateHistory}
      />

      <ProjectRatesModal
        open={isRatesModalOpen}
        project={ratesProject}
        rates={rates}
        isLoading={isLoadingRates}
        loadError={isRatesError ? extractErrorMessage(ratesError) : null}
        onSubmit={handleRateSubmit}
        onDelete={handleRateDelete}
        onAlign={handleRateAlign}
        aligningRateId={aligningRateId}
        onClose={closeRatesModal}
        isSubmitting={addProjectRate.isPending || updateProjectRate.isPending}
        deletingRateId={deletingRateId}
        error={rateFormError}
        onDismissError={() => setRateFormError(null)}
      />
    </div>
  );
}
