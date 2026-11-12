/**
 * /workflows/runs/:id — where one run stands: the flow's canvas with each
 * node's state, the open tasks, and the history of steps. An incident (a
 * failed step) is resolved here: retry, skip or cancel.
 */
import { useEffect, useMemo, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useNodesState } from '@xyflow/react';
import { AlertTriangle, ArrowLeft, Ban, PencilRuler, RotateCw, SkipForward, Workflow } from 'lucide-react';
import { Button } from '../../components/common/Button';
import { EmptyState } from '../../components/common/EmptyState';
import { SkeletonItem } from '../../components/common/Skeleton';
import { buttonClasses } from '../../components/common/buttonStyles';
import { confirmDialog } from '../../lib/confirm';
import { toast } from '../../lib/toast';
import { workflowApiError } from '../../api/services/workflow.service';
import {
  useCancelWorkflowRun,
  useRetryWorkflowStep,
  useSkipWorkflowStep,
  useWorkflowCatalog,
  useWorkflowRun,
} from '../../hooks/api/useWorkflows';
import type { WorkflowRun } from '../../api/types/workflow.types';
import { FlowCanvas } from '../../components/workflows/canvas/FlowCanvas';
import { toFlowEdges, toFlowNodes } from '../../components/workflows/graph/flowGraph';
import type { AnyNodeData, FlowNode } from '../../components/workflows/graph/flowGraph';
import { failedStep, nodeRunStates, traversedEdgeIds } from '../../components/workflows/graph/runStatus';
import { StepTimeline } from '../../components/workflows/runs/StepTimeline';
import { TaskCard } from '../../components/workflows/tasks/TaskCard';
import { byUrgency } from '../../components/workflows/tasks/taskOrder';
import { RunStatusBadge, TestRunBadge } from '../../components/workflows/WorkflowBadges';
import { useWorkflowLabels } from '../../components/workflows/useWorkflowLabels';
import { formatDate, formatYmd } from '../../utils/date';

const ACTIVE: Array<WorkflowRun['status']> = ['running', 'waiting', 'incident'];

function RunView({ run }: { run: WorkflowRun }) {
  const { data: catalog } = useWorkflowCatalog();
  const labels = useWorkflowLabels(catalog);
  const { t } = labels;
  const locale = useTranslation().i18n.language;
  const cancelRun = useCancelWorkflowRun();
  const retryStep = useRetryWorkflowStep();
  const skipStep = useSkipWorkflowStep();
  // The canvas owns the nodes (it measures them and tracks the selection); a run's graph itself never changes
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(toFlowNodes(run.graph));
  const shownGraph = useRef(run.graph);
  useEffect(() => {
    if (shownGraph.current === run.graph) return;
    shownGraph.current = run.graph;
    setNodes(toFlowNodes(run.graph));
  }, [run.graph, setNodes]);
  const edges = useMemo(() => toFlowEdges(run.graph), [run.graph]);
  // Clicking a node on the canvas points out its steps in the history
  const selectedNodeId = nodes.find((node) => node.selected)?.id ?? null;
  const runStates = useMemo(() => nodeRunStates(run.steps), [run.steps]);
  const traversed = useMemo(() => traversedEdgeIds(run.graph, run.steps), [run.graph, run.steps]);
  const openTasks = byUrgency(run.tasks.filter((task) => task.status === 'open'));
  const failed = run.status === 'incident' ? failedStep(run.steps) : undefined;
  const failedNode = failed ? run.graph.nodes.find((node) => node.id === failed.node_id) : undefined;
  const failedTitle = failedNode ? labels.nodeTitle(failedNode.type, failedNode.data as AnyNodeData) : failed?.node_id ?? '';

  const act = async (action: () => Promise<unknown>, done: string) => {
    try {
      await action();
      toast.success(done);
    } catch (err: unknown) {
      toast.error(t('run.actionError'), { description: workflowApiError(err).message });
    }
  };

  const handleCancel = async () => {
    const confirmed = await confirmDialog({
      title: t('run.cancelTitle'),
      message: t('run.cancelMessage'),
      confirmLabel: t('run.cancel'),
      tone: 'danger',
    });
    if (confirmed) await act(() => cancelRun.mutateAsync(run.id), t('run.cancelled'));
  };

  const handleRetry = async () => {
    if (!failed) return;
    const confirmed = await confirmDialog({
      title: t('run.retryTitle', { step: failedTitle }),
      message: t('run.retryMessage'),
      confirmLabel: t('run.retry'),
    });
    if (confirmed) await act(() => retryStep.mutateAsync({ runId: run.id, stepId: failed.id }), t('run.retried'));
  };

  const handleSkip = async () => {
    if (!failed) return;
    const confirmed = await confirmDialog({
      title: t('run.skipTitle', { step: failedTitle }),
      message: t('run.skipMessage'),
      confirmLabel: t('run.skip'),
    });
    if (confirmed) await act(() => skipStep.mutateAsync({ runId: run.id, stepId: failed.id }), t('run.skippedDone'));
  };

  const busy = cancelRun.isPending || retryStep.isPending || skipStep.isPending;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start gap-3">
        <Link
          to="/workflows?tab=runs"
          aria-label={t('run.back')}
          title={t('run.back')}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="page-title break-words">{run.definition_name}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500 dark:text-gray-400">
            <RunStatusBadge status={run.status} />
            {run.test_mode && <TestRunBadge />}
            {run.subject_label && <span className="font-medium text-gray-700 dark:text-gray-300">{run.subject_label}</span>}
            {run.period_start && run.period_end && (
              <span className="tabular-nums">
                {formatYmd(run.period_start, locale)} – {formatYmd(run.period_end, locale)}
              </span>
            )}
            <span>{t('editor.version', { version: run.version })}</span>
            <span>
              {t(run.started_by === 'schedule' ? 'run.startedBySchedule' : run.started_by === 'event' ? 'run.startedByEvent' : 'run.startedManually', {
                date: formatDate(run.started_at),
              })}
            </span>
          </div>
          {run.result && <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">{run.result}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to={`/workflows/${run.definition_id}`} className={buttonClasses('secondary')}>
            <PencilRuler className="h-4 w-4" aria-hidden="true" />
            {t('run.openFlow')}
          </Link>
          {ACTIVE.includes(run.status) && (
            <Button type="button" variant="outline" onClick={() => void handleCancel()} isLoading={cancelRun.isPending} disabled={busy} leftIcon={<Ban className="h-4 w-4" aria-hidden="true" />}>
              {t('run.cancel')}
            </Button>
          )}
        </div>
      </header>

      {failed && (
        <section role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-500/20 dark:bg-red-500/10">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-red-900 dark:text-red-100">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            {t('run.incidentTitle', { step: failedTitle })}
          </h2>
          {failed.error && (
            <p className="mt-1.5 whitespace-pre-line break-words text-sm text-red-800 dark:text-red-200">{labels.stepErrorText(failed)}</p>
          )}
          <p className="mt-1.5 text-xs text-red-800/80 dark:text-red-200/80">{t('run.incidentHint')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => void handleRetry()} isLoading={retryStep.isPending} disabled={busy} leftIcon={<RotateCw className="h-4 w-4" aria-hidden="true" />}>
              {t('run.retry')}
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => void handleSkip()} isLoading={skipStep.isPending} disabled={busy} leftIcon={<SkipForward className="h-4 w-4" aria-hidden="true" />}>
              {t('run.skip')}
            </Button>
          </div>
        </section>
      )}

      {openTasks.length > 0 && (
        <section aria-labelledby="run-tasks">
          <h2 id="run-tasks" className="section-title mb-3">
            {t('run.openTasks', { count: openTasks.length })}
          </h2>
          <ul className="max-w-3xl space-y-3">
            {openTasks.map((task) => (
              <li key={task.id}>
                <TaskCard task={task} hideRunLink />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="run-canvas">
        <h2 id="run-canvas" className="section-title mb-3">
          {t('run.progress')}
        </h2>
        <div className="surface h-[420px] overflow-hidden">
          <FlowCanvas
            nodes={nodes}
            edges={edges}
            catalog={catalog}
            readOnly
            onNodesChange={onNodesChange}
            runStates={runStates}
            traversedEdgeIds={traversed}
            ariaLabel={t('run.canvasLabel', { name: run.definition_name })}
          />
        </div>
      </section>

      <section aria-labelledby="run-history">
        <h2 id="run-history" className="section-title mb-3">
          {t('run.history')}
        </h2>
        <div className="max-w-3xl">
          <StepTimeline steps={run.steps} graph={run.graph} catalog={catalog} highlightNodeId={selectedNodeId} />
        </div>
      </section>
    </div>
  );
}

export default function WorkflowRunPage() {
  const { t } = useTranslation('workflows');
  const { id } = useParams<{ id: string }>();
  const { data: run, isLoading, isError } = useWorkflowRun(id);

  if (isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <SkeletonItem className="h-9 w-72" />
        <SkeletonItem className="h-[420px] w-full" />
      </div>
    );
  }
  if (isError || !run) {
    return (
      <EmptyState
        icon={Workflow}
        title={t('run.notFound')}
        action={
          <Link to="/workflows?tab=runs" className={buttonClasses('secondary')}>
            {t('run.back')}
          </Link>
        }
      />
    );
  }
  return <RunView run={run} />;
}
