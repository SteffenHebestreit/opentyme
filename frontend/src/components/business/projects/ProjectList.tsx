import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../../store/AppContext';
import { useClients } from '../../../hooks/api/useClients';
import {
  useCreateProject,
  useDeleteProject,
  useProjects,
  useUpdateProject,
} from '../../../hooks/api/useProjects';
import { Project } from '../../../api/types';
import { Button } from '../../common/Button';
import { Alert } from '../../common/Alert';
import { SkeletonCardList } from '../../common/Skeleton';
import { extractErrorMessage } from '../../../utils/error';
import { ProjectFilters, ProjectStatusFilter } from './ProjectFilters';
import { ProjectTable } from './ProjectTable';
import { ProjectFormModal } from './ProjectFormModal';
import { ProjectEmptyState } from './ProjectEmptyState';

export default function ProjectList() {
  const { t } = useTranslation('projects');
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
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
    setSuccessMessage(null);
    setActionError(null);
    try {
      if (modalMode === 'create') {
        await createProject.mutateAsync(payload);
        setSuccessMessage(t('messages.created'));
      } else if (editingProject) {
        await updateProject.mutateAsync({ id: editingProject.id, payload });
        setSuccessMessage(t('messages.updated'));
      }
      closeModal();
    } catch (submitError) {
      setFormError(extractErrorMessage(submitError));
    }
  };

  const handleDelete = async (project: Project) => {
    const confirmed = window.confirm(
      t('messages.deleteConfirm', { name: project.name })
    );
    if (!confirmed) {
      return;
    }
    setSuccessMessage(null);
    setActionError(null);
    setDeletingId(project.id);
    try {
      await deleteProject.mutateAsync(project.id);
      setSuccessMessage(t('messages.deleted'));
    } catch (deleteErr) {
      setActionError(extractErrorMessage(deleteErr));
    } finally {
      setDeletingId(null);
    }
  };

  if (!state.isAuthenticated) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">{t('title')}</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            {t('noAuth')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900 dark:text-white">{t('title')}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button type="button" onClick={openCreateModal}>
            {t('addProject')}
          </Button>
        </div>
      </div>

      <ProjectFilters
        search={searchTerm}
        status={statusFilter}
        clientId={clientFilter}
        clients={clients}
        onSearchChange={setSearchTerm}
        onStatusChange={setStatusFilter}
        onClientChange={setClientFilter}
      />

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
        <SkeletonCardList count={3} />
      ) : projects.length === 0 ? (
        <ProjectEmptyState onCreate={openCreateModal} />
      ) : (
        <ProjectTable
          projects={projectsWithClientNames}
          onEdit={openEditModal}
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
      />
    </div>
  );
}
