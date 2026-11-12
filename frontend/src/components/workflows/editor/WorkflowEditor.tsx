/**
 * The canvas editor of one flow: palette, canvas, properties — and the
 * draft's life cycle (save, validate, publish, start a run).
 *
 * The editor owns the draft while it is open. It is initialised once from the
 * server's copy and afterwards only sends changes; refetches of the definition
 * update the status line but never the canvas.
 */
import { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useBlocker } from 'react-router-dom';
import { useEdgesState, useNodesState } from '@xyflow/react';
import type { Connection } from '@xyflow/react';
import { AlertTriangle, ArrowLeft, CheckCircle2, Play, Rocket, Save } from 'lucide-react';
import { Button } from '../../common/Button';
import { Alert } from '../../common/Alert';
import { Modal } from '../../ui/Modal';
import { confirmDialog } from '../../../lib/confirm';
import { toast } from '../../../lib/toast';
import { workflowApiError } from '../../../api/services/workflow.service';
import { usePublishWorkflow, useUpdateWorkflow, useValidateWorkflow, useWorkflowCatalog } from '../../../hooks/api/useWorkflows';
import type { StartNodeData, WorkflowDefinition, WorkflowIssue, WorkflowValidation } from '../../../api/types/workflow.types';
import {
  connectNodes,
  createFlowNode,
  graphFingerprint,
  moveGatewayEdge,
  pruneEdges,
  toFlowEdges,
  toFlowNodes,
  toWorkflowGraph,
} from '../graph/flowGraph';
import type { AnyNodeData, FlowEdge, FlowNode, PaletteItem } from '../graph/flowGraph';
import { FlowCanvas } from '../canvas/FlowCanvas';
import type { FlowInstance } from '../canvas/FlowCanvas';
import { DefinitionStatusBadge, PermissionSummary } from '../WorkflowBadges';
import { StartRunDialog } from '../StartRunDialog';
import { useWorkflowLabels } from '../useWorkflowLabels';
import { Palette } from './Palette';
import { PropertiesPanel } from './PropertiesPanel';

interface WorkflowEditorProps {
  definition: WorkflowDefinition;
}

export const WorkflowEditor: FC<WorkflowEditorProps> = ({ definition }) => {
  const { data: catalog } = useWorkflowCatalog();
  const labels = useWorkflowLabels(catalog);
  const { t } = labels;
  const updateMutation = useUpdateWorkflow();
  const validateMutation = useValidateWorkflow();
  const publishMutation = usePublishWorkflow();

  const [name, setName] = useState(definition.name);
  const [description, setDescription] = useState(definition.description ?? '');
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(toFlowNodes(definition.graph));
  const [edges, setEdges, onEdgesChange] = useEdgesState<FlowEdge>(toFlowEdges(definition.graph));
  const [issues, setIssues] = useState<WorkflowIssue[]>([]);
  const [validation, setValidation] = useState<WorkflowValidation | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const instanceRef = useRef<FlowInstance | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // ── Draft state ──
  const fingerprint = useMemo(
    () => JSON.stringify([name.trim(), description.trim(), graphFingerprint(nodes, edges)]),
    [name, description, nodes, edges]
  );
  const [savedFingerprint, setSavedFingerprint] = useState(fingerprint);
  const dirty = fingerprint !== savedFingerprint;

  // An exit that no longer exists (a task lost its due date) takes its edges with it
  useEffect(() => {
    setEdges((current) => pruneEdges(nodes, current));
  }, [nodes, setEdges]);

  const selectedNodes = nodes.filter((node) => node.selected);
  const selectedNode = selectedNodes.length === 1 ? selectedNodes[0] : undefined;
  const selectedEdge = selectedNodes.length === 0 ? edges.find((edge) => edge.selected) : undefined;
  const hasStart = nodes.some((node) => node.type === 'start');

  // ── Canvas edits ──
  const handleInit = useCallback((instance: FlowInstance) => {
    instanceRef.current = instance;
  }, []);

  const handleConnect = useCallback(
    (connection: Connection) => setEdges((current) => connectNodes(connection, nodes, current)),
    [nodes, setEdges]
  );

  const addItem = useCallback(
    (item: PaletteItem, position?: { x: number; y: number }) => {
      if (item.type === 'start' && hasStart) return;
      let at = position;
      if (!at) {
        // Click-to-add: the middle of what is visible, nudged so several adds don't stack exactly
        const rect = canvasRef.current?.getBoundingClientRect();
        const flow = instanceRef.current;
        const nudge = (nodes.length % 6) * 18;
        const middle = rect && flow ? flow.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }) : { x: 160, y: 120 };
        at = { x: middle.x - 100 + nudge, y: middle.y - 30 + nudge };
      }
      setNodes((current) => [
        ...current.map((node) => (node.selected ? { ...node, selected: false } : node)),
        { ...createFlowNode(item, at as { x: number; y: number }, current, catalog), selected: true },
      ]);
      setEdges((current) => current.map((edge) => (edge.selected ? { ...edge, selected: false } : edge)));
    },
    [catalog, hasStart, nodes.length, setEdges, setNodes]
  );

  const setNodeConfig = useCallback(
    (nodeId: string, config: AnyNodeData) => setNodes((current) => current.map((node) => (node.id === nodeId ? { ...node, data: { config } } : node))),
    [setNodes]
  );
  const setEdgeData = useCallback(
    (edgeId: string, data: NonNullable<FlowEdge['data']>) => setEdges((current) => current.map((edge) => (edge.id === edgeId ? { ...edge, data } : edge))),
    [setEdges]
  );
  const moveEdge = useCallback((edgeId: string, direction: -1 | 1) => setEdges((current) => moveGatewayEdge(current, edgeId, direction)), [setEdges]);

  const select = useCallback(
    (target: { nodeId?: string; edgeId?: string }) => {
      setNodes((current) => current.map((node) => (node.selected !== (node.id === target.nodeId) ? { ...node, selected: node.id === target.nodeId } : node)));
      setEdges((current) => current.map((edge) => (edge.selected !== (edge.id === target.edgeId) ? { ...edge, selected: edge.id === target.edgeId } : edge)));
      if (target.nodeId) void instanceRef.current?.fitView({ nodes: [{ id: target.nodeId }], duration: 250, maxZoom: 1, padding: 0.3 });
    },
    [setEdges, setNodes]
  );

  const deleteSelected = useCallback(() => {
    const removed = new Set(nodes.filter((node) => node.selected).map((node) => node.id));
    if (removed.size > 0) {
      setNodes((current) => current.filter((node) => !removed.has(node.id)));
      setEdges((current) => current.filter((edge) => !removed.has(edge.source) && !removed.has(edge.target)));
    } else {
      setEdges((current) => current.filter((edge) => !edge.selected));
    }
  }, [nodes, setEdges, setNodes]);

  // ── Save, validate, publish ──
  const save = useCallback(async (): Promise<boolean> => {
    if (!name.trim()) {
      toast.error(t('editor.nameRequired'));
      return false;
    }
    try {
      await updateMutation.mutateAsync({
        id: definition.id,
        data: { name: name.trim(), description: description.trim() || null, graph: toWorkflowGraph(nodes, edges) },
      });
      setSavedFingerprint(fingerprint);
      return true;
    } catch (err: unknown) {
      toast.error(t('editor.saveError'), { description: workflowApiError(err).message });
      return false;
    }
  }, [definition.id, description, edges, fingerprint, name, nodes, t, updateMutation]);

  const validate = useCallback(
    async (announce: boolean): Promise<WorkflowValidation | null> => {
      try {
        const result = await validateMutation.mutateAsync({ id: definition.id, graph: toWorkflowGraph(nodes, edges) });
        setIssues(result.issues);
        setValidation(result);
        if (announce) {
          if (result.valid) toast.success(t('editor.valid'));
          else toast.error(t('editor.invalid', { count: result.issues.length }));
        }
        return result;
      } catch (err: unknown) {
        toast.error(t('editor.validateError'), { description: workflowApiError(err).message });
        return null;
      }
    },
    [definition.id, edges, nodes, t, validateMutation]
  );

  const nextVersion = (definition.published_version ?? 0) + 1;

  const openPublish = async () => {
    if (dirty && !(await save())) return;
    const result = await validate(false);
    if (!result) return;
    if (!result.valid) {
      toast.error(t('editor.invalid', { count: result.issues.length }));
      return;
    }
    setPublishOpen(true);
  };

  const confirmPublish = async () => {
    try {
      await publishMutation.mutateAsync(definition.id);
      setPublishOpen(false);
      toast.success(t('editor.published', { version: nextVersion }));
    } catch (err: unknown) {
      const body = workflowApiError(err);
      if (body.issues) {
        setIssues(body.issues);
        setPublishOpen(false);
      }
      toast.error(t('editor.publishError'), { description: body.message });
    }
  };

  // ── Guards against losing the draft ──
  const blocker = useBlocker(dirty);
  const blockerRef = useRef(blocker);
  blockerRef.current = blocker;
  const blocked = blocker.state === 'blocked';
  useEffect(() => {
    if (!blocked) return;
    let stale = false;
    void confirmDialog({
      title: t('editor.leaveTitle'),
      message: t('editor.leaveMessage'),
      confirmLabel: t('editor.leaveConfirm'),
      tone: 'danger',
    }).then((leave) => {
      if (stale) return;
      if (leave) blockerRef.current.proceed?.();
      else blockerRef.current.reset?.();
    });
    return () => {
      stale = true;
    };
  }, [blocked, t]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // Ctrl/Cmd+S saves the draft
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void saveRef.current();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // ── Validation issues on the canvas ──
  const issueCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const issue of issues) if (issue.nodeId) counts[issue.nodeId] = (counts[issue.nodeId] ?? 0) + 1;
    return counts;
  }, [issues]);
  const issueEdgeIds = useMemo(() => new Set(issues.map((issue) => issue.edgeId).filter((id): id is string => !!id)), [issues]);

  const startNode = nodes.find((node) => node.type === 'start');
  const schedule = startNode && (startNode.data.config as StartNodeData).trigger === 'schedule' ? (startNode.data.config as StartNodeData).schedule : undefined;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center gap-3">
        <Link
          to="/workflows"
          aria-label={t('editor.back')}
          title={t('editor.back')}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="page-title truncate">{name.trim() || t('panel.unnamed')}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500 dark:text-gray-400">
            <DefinitionStatusBadge status={definition.status} />
            <span>{definition.published_version ? t('editor.version', { version: definition.published_version }) : t('editor.neverPublished')}</span>
            {dirty ? (
              <span className="font-medium text-amber-700 dark:text-amber-300" role="status">
                {t('editor.unsaved')}
              </span>
            ) : (
              definition.has_unpublished_changes && <span>{t('editor.unpublished')}</span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" onClick={() => void validate(true)} isLoading={validateMutation.isPending} leftIcon={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />}>
            {t('editor.validate')}
          </Button>
          <Button type="button" variant="secondary" onClick={() => void save()} disabled={!dirty} isLoading={updateMutation.isPending} leftIcon={<Save className="h-4 w-4" aria-hidden="true" />}>
            {t('editor.save')}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setStartOpen(true)}
            disabled={definition.published_version === null}
            title={definition.published_version === null ? t('start.dialog.notPublished') : undefined}
            leftIcon={<Play className="h-4 w-4" aria-hidden="true" />}
          >
            {t('start.button')}
          </Button>
          <Button type="button" onClick={() => void openPublish()} isLoading={publishMutation.isPending} leftIcon={<Rocket className="h-4 w-4" aria-hidden="true" />}>
            {t('editor.publish')}
          </Button>
        </div>
      </header>

      {issues.length > 0 && (
        <section
          aria-label={t('editor.issuesTitle', { count: issues.length })}
          className="rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-500/20 dark:bg-red-500/10"
        >
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-red-900 dark:text-red-100">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              {t('editor.issuesTitle', { count: issues.length })}
            </h2>
            <button
              type="button"
              onClick={() => setIssues([])}
              className="rounded text-xs font-medium text-red-800 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:text-red-200"
            >
              {t('editor.hideIssues')}
            </button>
          </div>
          <ul className="space-y-0.5">
            {issues.map((issue, index) => {
              const node = issue.nodeId ? nodes.find((candidate) => candidate.id === issue.nodeId) : undefined;
              const text = labels.issueText(issue, node ? { type: node.type, config: node.data.config } : undefined);
              const where = node ? labels.nodeTitle(node.type, node.data.config) : null;
              return (
                <li key={index} className="text-sm text-red-800 dark:text-red-200">
                  {issue.nodeId || issue.edgeId ? (
                    <button
                      type="button"
                      onClick={() => select({ nodeId: issue.nodeId, edgeId: issue.nodeId ? undefined : issue.edgeId })}
                      className="rounded text-left underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                    >
                      {where ? `${where}: ${text}` : text}
                    </button>
                  ) : (
                    text
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <Alert type="info" message={t('editor.smallScreen')} className="lg:hidden" />

      <div className="surface hidden h-[calc(100dvh-13.5rem)] min-h-[560px] overflow-hidden lg:grid lg:grid-cols-[13.5rem_minmax(0,1fr)_20rem]">
        <aside className="overflow-y-auto border-r border-gray-200 p-3 dark:border-gray-800">
          <Palette catalog={catalog} hasStart={hasStart} onAdd={addItem} />
        </aside>
        <div ref={canvasRef} className="relative min-w-0">
          <FlowCanvas
            nodes={nodes}
            edges={edges}
            catalog={catalog}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={handleConnect}
            onDropItem={addItem}
            onInit={handleInit}
            issueCounts={issueCounts}
            issueEdgeIds={issueEdgeIds}
            ariaLabel={t('editor.canvasLabel', { name: name.trim() || t('panel.unnamed') })}
          />
          {nodes.length === 0 && (
            <p className="pointer-events-none absolute inset-0 flex items-center justify-center px-8 text-center text-sm text-gray-500 dark:text-gray-400">
              {t('editor.emptyCanvas')}
            </p>
          )}
        </div>
        <aside className="overflow-y-auto border-l border-gray-200 p-4 dark:border-gray-800" aria-label={t('panel.title')}>
          <PropertiesPanel
            subjectType={definition.subject_type}
            name={name}
            description={description}
            onMetaChange={(patch) => {
              if (patch.name !== undefined) setName(patch.name);
              if (patch.description !== undefined) setDescription(patch.description);
            }}
            nodes={nodes}
            edges={edges}
            selectedNode={selectedNode}
            selectedEdge={selectedEdge}
            catalog={catalog}
            issues={issues}
            onNodeConfig={setNodeConfig}
            onEdgeData={setEdgeData}
            onMoveEdge={moveEdge}
            onSelectEdge={(edgeId) => select({ edgeId })}
            onDeleteSelected={deleteSelected}
          />
        </aside>
      </div>

      <Modal
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        size="sm"
        title={t('publish.title', { version: nextVersion })}
        icon={<Rocket className="h-4 w-4" aria-hidden="true" />}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setPublishOpen(false)}>
              {t('common:buttons.cancel')}
            </Button>
            <Button type="button" onClick={() => void confirmPublish()} isLoading={publishMutation.isPending}>
              {t('publish.confirm')}
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-sm text-gray-700 dark:text-gray-300">
          <p>{t(definition.published_version ? 'publish.introUpdate' : 'publish.introFirst')}</p>
          <div>
            <h3 className="mb-1.5 text-sm font-semibold text-gray-900 dark:text-white">{t('publish.permissions')}</h3>
            {validation?.permissions && <PermissionSummary permissions={validation.permissions} />}
            <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">{t('publish.permissionsHint')}</p>
          </div>
          {schedule && (
            <p>
              {t(definition.subject_type === 'none' ? 'publish.scheduleNoSubject' : 'publish.schedule', {
                day: schedule.dayOfMonth === 'last' ? t('start.lastDay') : t('start.dayN', { day: schedule.dayOfMonth }),
                count: schedule.subjectIds.length,
              })}
            </p>
          )}
        </div>
      </Modal>

      {startOpen && <StartRunDialog definition={definition} open onClose={() => setStartOpen(false)} />}
    </div>
  );
};
