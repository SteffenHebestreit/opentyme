/**
 * /workflows — the user's flows and their runs.
 *
 * `?tab=runs` opens the runs; `&definition=<id>` limits them to one flow.
 */
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Archive, CalendarClock, History, Pause, Play, Plus, RotateCcw, Trash2, Workflow } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';
import { PageHeader } from '../../components/common/PageHeader';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { Tabs } from '../../components/common/Tabs';
import { EmptyState } from '../../components/common/EmptyState';
import { Table } from '../../components/common/Table';
import type { Column } from '../../components/common/Table';
import { Select } from '../../components/forms';
import { confirmDialog } from '../../lib/confirm';
import { toast } from '../../lib/toast';
import { workflowApiError } from '../../api/services/workflow.service';
import { useDeleteWorkflow, useSetWorkflowStatus, useWorkflowDefinitions, useWorkflowRuns } from '../../hooks/api/useWorkflows';
import { WORKFLOW_RUN_STATUSES } from '../../api/types/workflow.types';
import type { WorkflowDefinitionStatus, WorkflowDefinitionSummary, WorkflowRunStatus } from '../../api/types/workflow.types';
import { CreateWorkflowDialog } from '../../components/workflows/CreateWorkflowDialog';
import { StartRunDialog } from '../../components/workflows/StartRunDialog';
import { RunsTable } from '../../components/workflows/runs/RunsTable';
import { DefinitionStatusBadge } from '../../components/workflows/WorkflowBadges';
import { formatDate } from '../../utils/date';

type PageTab = 'flows' | 'runs';

export default function WorkflowsPage() {
  const { t } = useTranslation('workflows');
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: PageTab = searchParams.get('tab') === 'runs' ? 'runs' : 'flows';
  const definitionFilter = searchParams.get('definition') ?? '';
  const [statusFilter, setStatusFilter] = useState<WorkflowRunStatus | ''>('');
  const [createOpen, setCreateOpen] = useState(false);
  const [starting, setStarting] = useState<WorkflowDefinitionSummary | null>(null);

  const definitions = useWorkflowDefinitions();
  const runFilters = useMemo(
    () => ({ definition_id: definitionFilter || undefined, status: statusFilter || undefined, limit: 100 }),
    [definitionFilter, statusFilter]
  );
  const runs = useWorkflowRuns(runFilters, tab === 'runs');
  const setStatus = useSetWorkflowStatus();
  const deleteWorkflow = useDeleteWorkflow();

  const showRuns = (definitionId?: string) => setSearchParams(definitionId ? { tab: 'runs', definition: definitionId } : { tab: 'runs' });

  const changeStatus = async (definition: WorkflowDefinitionSummary, status: Exclude<WorkflowDefinitionStatus, 'draft'>) => {
    try {
      await setStatus.mutateAsync({ id: definition.id, status });
      toast.success(t(`list.statusChanged.${status}`, { name: definition.name }));
    } catch (err: unknown) {
      toast.error(t('list.statusError'), { description: workflowApiError(err).message });
    }
  };

  const remove = async (definition: WorkflowDefinitionSummary) => {
    const confirmed = await confirmDialog({
      title: t('list.deleteTitle'),
      message: t('list.deleteMessage', { name: definition.name }),
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      await deleteWorkflow.mutateAsync(definition.id);
      toast.success(t('list.deleted', { name: definition.name }));
    } catch (err: unknown) {
      const body = workflowApiError(err);
      toast.error(body.status === 409 ? t('list.deleteHasRuns') : t('list.deleteError'), { description: body.status === 409 ? undefined : body.message });
    }
  };

  const iconAction = (key: string, label: string, Icon: LucideIcon, onClick: () => void, danger = false): ReactNode => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-gray-500',
        danger
          ? 'hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400'
          : 'hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/5 dark:hover:text-gray-200'
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );

  /** What can be done with a flow from the list; editing is the name's own link. */
  const actionsFor = (definition: WorkflowDefinitionSummary): ReactNode[] => {
    const name = definition.name;
    const actions: ReactNode[] = [];
    if (definition.published_version !== null && definition.status === 'active') {
      actions.push(iconAction('start', t('list.actions.start', { name }), Play, () => setStarting(definition)));
    }
    actions.push(iconAction('runs', t('list.actions.runs', { name }), History, () => showRuns(definition.id)));
    if (definition.status === 'active') actions.push(iconAction('pause', t('list.actions.pause', { name }), Pause, () => void changeStatus(definition, 'paused')));
    if (definition.status === 'paused' || definition.status === 'archived') {
      actions.push(iconAction('activate', t('list.actions.activate', { name }), RotateCcw, () => void changeStatus(definition, 'active')));
    }
    if (definition.status === 'active' || definition.status === 'paused') {
      actions.push(iconAction('archive', t('list.actions.archive', { name }), Archive, () => void changeStatus(definition, 'archived')));
    }
    actions.push(iconAction('delete', t('list.actions.delete', { name }), Trash2, () => void remove(definition), true));
    return actions;
  };

  const columns: Column<WorkflowDefinitionSummary>[] = [
      {
        key: 'name',
        header: t('list.columns.name'),
        sortable: true,
        sortValue: (definition) => definition.name.toLowerCase(),
        render: (definition) => (
          <div className="min-w-0 max-w-md whitespace-normal">
            <Link
              to={`/workflows/${definition.id}`}
              className="rounded font-medium text-gray-900 hover:text-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-white dark:hover:text-brand-300"
            >
              {definition.name}
            </Link>
            {definition.description && <p className="mt-0.5 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">{definition.description}</p>}
          </div>
        ),
      },
      {
        key: 'subject_type',
        header: t('list.columns.subject'),
        sortable: true,
        sortValue: (definition) => definition.subject_type,
        render: (definition) => <span className="text-gray-700 dark:text-gray-300">{t(`subjectTypes.${definition.subject_type}`)}</span>,
      },
      {
        key: 'status',
        header: t('list.columns.status'),
        sortable: true,
        sortValue: (definition) => definition.status,
        render: (definition) => (
          <div className="flex flex-wrap items-center gap-1.5">
            <DefinitionStatusBadge status={definition.status} />
            {definition.published_version !== null && (
              <span className="text-xs text-gray-500 dark:text-gray-400">{t('editor.version', { version: definition.published_version })}</span>
            )}
            {definition.published_version !== null && definition.has_unpublished_changes && (
              <Badge variant="amber" size="sm">
                {t('list.unpublished')}
              </Badge>
            )}
          </div>
        ),
      },
      {
        key: 'active_runs',
        header: t('list.columns.activeRuns'),
        align: 'right',
        sortable: true,
        sortValue: (definition) => definition.active_runs,
        render: (definition) =>
          definition.active_runs > 0 ? (
            <button
              type="button"
              onClick={() => showRuns(definition.id)}
              aria-label={t('list.showRuns', { count: definition.active_runs, name: definition.name })}
              className="rounded font-medium tabular-nums text-brand-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-brand-400"
            >
              {definition.active_runs}
            </button>
          ) : (
            <span className="tabular-nums text-gray-400 dark:text-gray-500">0</span>
          ),
      },
      {
        key: 'next_run_at',
        header: t('list.columns.nextRun'),
        sortable: true,
        sortValue: (definition) => definition.next_run_at ?? '',
        render: (definition) =>
          definition.next_run_at ? (
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-gray-700 dark:text-gray-300">
              <CalendarClock className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
              {formatDate(definition.next_run_at)}
            </span>
          ) : (
            <span className="text-gray-400 dark:text-gray-500">—</span>
          ),
      },
      {
        key: 'actions',
        header: <span className="sr-only">{t('list.columns.actions')}</span>,
        align: 'right',
        render: (definition) => <div className="flex items-center justify-end gap-0.5">{actionsFor(definition)}</div>,
      },
  ];

  const newButton = (
    <Button type="button" onClick={() => setCreateOpen(true)} leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}>
      {t('list.new')}
    </Button>
  );

  return (
    <div>
      <PageHeader title={t('list.title')} subtitle={t('list.subtitle')} icon={Workflow} actions={newButton} />
      <Tabs
        tabs={[
          { id: 'flows', label: t('list.tabs.flows'), icon: Workflow },
          { id: 'runs', label: t('list.tabs.runs'), icon: History },
        ]}
        activeTab={tab}
        onChange={(id) => (id === 'runs' ? showRuns() : setSearchParams({}))}
        className="mb-5"
      />

      {tab === 'flows' ? (
        definitions.isError ? (
          <EmptyState icon={Workflow} title={t('list.loadError')} bordered />
        ) : !definitions.isLoading && (definitions.data ?? []).length === 0 ? (
          <EmptyState icon={Workflow} title={t('list.empty')} description={t('list.emptyHint')} action={newButton} bordered />
        ) : (
          <Table data={definitions.data ?? []} columns={columns} isLoading={definitions.isLoading} defaultSort={{ key: 'name', direction: 'asc' }} />
        )
      ) : (
        <div>
          <div className="mb-4 grid max-w-2xl grid-cols-1 gap-x-4 sm:grid-cols-2">
            <Select
              label={t('runs.filters.flow')}
              value={definitionFilter}
              onChange={(event) => showRuns(event.target.value || undefined)}
              wrapperClassName="mb-2"
            >
              <option value="">{t('runs.filters.allFlows')}</option>
              {(definitions.data ?? []).map((definition) => (
                <option key={definition.id} value={definition.id}>
                  {definition.name}
                </option>
              ))}
            </Select>
            <Select
              label={t('runs.filters.status')}
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as WorkflowRunStatus | '')}
              wrapperClassName="mb-2"
            >
              <option value="">{t('runs.filters.allStatuses')}</option>
              {WORKFLOW_RUN_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {t(`runStatus.${status}`)}
                </option>
              ))}
            </Select>
          </div>
          {runs.isError ? (
            <EmptyState icon={History} title={t('runs.loadError')} bordered />
          ) : (
            <RunsTable runs={runs.data ?? []} isLoading={runs.isLoading} hideFlow={!!definitionFilter} emptyMessage={t('runs.empty')} />
          )}
        </div>
      )}

      {createOpen && (
        <CreateWorkflowDialog
          open
          onClose={() => setCreateOpen(false)}
          onCreated={(definition) => {
            setCreateOpen(false);
            navigate(`/workflows/${definition.id}`);
          }}
        />
      )}
      {starting && <StartRunDialog definition={starting} open onClose={() => setStarting(null)} />}
    </div>
  );
}
