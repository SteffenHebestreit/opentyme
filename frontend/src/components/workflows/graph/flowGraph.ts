/**
 * @fileoverview Between the contract's graph and the canvas.
 *
 * The API stores a flow as `WorkflowGraph` (docs/WORKFLOW_ENGINE.md); the
 * canvas (React Flow) wants its own node and edge objects. These pure helpers
 * convert both ways and create new nodes and edges, so nothing canvas-specific
 * ever reaches the API.
 */
import type { Edge, Node } from '@xyflow/react';
import type {
  ActionNodeData,
  EndNodeData,
  GatewayNodeData,
  StartNodeData,
  TaskNodeData,
  WaitNodeData,
  WorkflowActionSpec,
  WorkflowCatalog,
  WorkflowCondition,
  WorkflowEdge,
  WorkflowGraph,
  WorkflowHandle,
  WorkflowNode,
  WorkflowNodeType,
  WorkflowTaskKind,
} from '../../../api/types/workflow.types';

export type AnyNodeData = StartNodeData | ActionNodeData | TaskNodeData | WaitNodeData | GatewayNodeData | EndNodeData;

/** A canvas node: the contract's node data sits untouched under `config`. */
export type FlowNode = Node<{ config: AnyNodeData }, WorkflowNodeType>;
/** A canvas edge: label and gateway condition travel in `data`. */
export type FlowEdge = Edge<{ label?: string; condition?: WorkflowCondition | null }>;

/** The single entry point of every node that can be entered. */
export const TARGET_HANDLE = 'in';

const handleOf = (edge: { sourceHandle?: string | null }): WorkflowHandle => (edge.sourceHandle as WorkflowHandle | null | undefined) ?? 'out';

export function toFlowNodes(graph: WorkflowGraph): FlowNode[] {
  return graph.nodes.map((node) => ({
    id: node.id,
    type: node.type,
    position: { x: node.position?.x ?? 0, y: node.position?.y ?? 0 },
    data: { config: (node.data ?? {}) as AnyNodeData },
  }));
}

export function toFlowEdges(graph: WorkflowGraph): FlowEdge[] {
  return graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: handleOf(edge),
    targetHandle: TARGET_HANDLE,
    data: { label: edge.label, condition: edge.condition ?? null },
  }));
}

/**
 * The graph to save. Edge order is kept (it is a gateway's evaluation
 * order), positions are rounded, and only gateway exits carry a condition.
 */
export function toWorkflowGraph(nodes: FlowNode[], edges: FlowEdge[]): WorkflowGraph {
  const typeOf = new Map(nodes.map((node) => [node.id, node.type]));
  return {
    nodes: nodes.map(
      (node) =>
        ({
          id: node.id,
          type: node.type,
          position: { x: Math.round(node.position.x), y: Math.round(node.position.y) },
          data: node.data.config,
        }) as WorkflowNode
    ),
    edges: edges.map((edge) => {
      const out: WorkflowEdge = { id: edge.id, source: edge.source, target: edge.target, sourceHandle: handleOf(edge) };
      const label = edge.data?.label?.trim();
      if (label) out.label = label;
      if (typeOf.get(edge.source) === 'gateway') out.condition = edge.data?.condition ?? null;
      return out;
    }),
  };
}

/** Compact, stable text of a graph — for "has it changed since the last save?". */
export function graphFingerprint(nodes: FlowNode[], edges: FlowEdge[]): string {
  return JSON.stringify(toWorkflowGraph(nodes, edges));
}

function nextId(prefix: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  let n = 1;
  while (used.has(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}

/** Short ids (`n1`, `n2`, …) — they show up in references like `steps.n3.documentId`. */
export const nextNodeId = (nodes: Array<{ id: string }>): string => nextId('n', nodes.map((node) => node.id));
export const nextEdgeId = (edges: Array<{ id: string }>): string => nextId('e', edges.map((edge) => edge.id));

/** What the palette can drop on the canvas. */
export type PaletteItem =
  | { type: 'start' | 'wait' | 'gateway' | 'end' }
  | { type: 'action'; action: string }
  | { type: 'task'; kind: WorkflowTaskKind };

/** Input pre-filled from the catalog's defaults when an action is dropped. */
export function defaultActionInput(spec: WorkflowActionSpec | undefined): ActionNodeData['input'] {
  const input: ActionNodeData['input'] = {};
  for (const field of spec?.input ?? []) {
    if (field.default !== undefined) input[field.key] = field.default;
  }
  return input;
}

export function defaultNodeData(item: PaletteItem, catalog: WorkflowCatalog | undefined): AnyNodeData {
  switch (item.type) {
    case 'start':
      return { trigger: 'manual' };
    case 'action': {
      const spec = catalog?.actions.find((action) => action.key === item.action);
      return { action: item.action, input: defaultActionInput(spec), mode: spec?.defaultMode ?? 'approval' };
    }
    case 'task':
      if (item.kind === 'upload') {
        const types = catalog?.documentTypes ?? [];
        return { kind: 'upload', title: '', documentType: types.includes('timesheet_signed') ? 'timesheet_signed' : types[0] ?? 'other' };
      }
      return item.kind === 'form' ? { kind: 'form', title: '', fields: [] } : { kind: 'confirm', title: '' };
    case 'wait':
      return { days: 1 };
    default:
      return {};
  }
}

export function createFlowNode(
  item: PaletteItem,
  position: { x: number; y: number },
  nodes: FlowNode[],
  catalog: WorkflowCatalog | undefined
): FlowNode {
  return { id: nextNodeId(nodes), type: item.type, position, data: { config: defaultNodeData(item, catalog) } };
}

/** The exits a node offers, in display order. */
export function sourceHandles(type: WorkflowNodeType | undefined, config: AnyNodeData): WorkflowHandle[] {
  if (type === 'end' || !type) return [];
  if (type === 'wait') {
    // Waiting for an event can be given a time limit, which is an exit of its own
    const wait = config as WaitNodeData;
    return wait.mode === 'event' && !!wait.timeoutDays && wait.timeoutDays > 0 ? ['out', 'timeout'] : ['out'];
  }
  if (type !== 'task') return ['out'];
  const task = config as TaskNodeData;
  const handles: WorkflowHandle[] = ['out'];
  if (task.kind === 'confirm') handles.push('rejected');
  if (task.dueInDays && task.dueInDays > 0) handles.push('timeout');
  return handles;
}

/**
 * Adds a connection drawn on the canvas. Only gateways branch: a second edge
 * from another node's exit replaces the first. Self-connections are ignored.
 */
export function connectNodes(
  connection: { source: string | null; target: string | null; sourceHandle?: string | null },
  nodes: FlowNode[],
  edges: FlowEdge[]
): FlowEdge[] {
  const { source, target } = connection;
  if (!source || !target || source === target) return edges;
  const sourceNode = nodes.find((node) => node.id === source);
  if (!sourceNode || sourceNode.type === 'end') return edges;
  const handle = handleOf(connection);
  const isGateway = sourceNode.type === 'gateway';
  if (edges.some((edge) => edge.source === source && edge.target === target && handleOf(edge) === handle)) return edges;
  const kept = isGateway ? edges : edges.filter((edge) => !(edge.source === source && handleOf(edge) === handle));
  return [
    ...kept,
    {
      id: nextEdgeId(edges),
      source,
      target,
      sourceHandle: handle,
      targetHandle: TARGET_HANDLE,
      data: { condition: null },
    },
  ];
}

/** Drops edges whose exit no longer exists (e.g. a task lost its due date, so `timeout` is gone). */
export function pruneEdges(nodes: FlowNode[], edges: FlowEdge[]): FlowEdge[] {
  const exits = new Map(nodes.map((node) => [node.id, sourceHandles(node.type, node.data.config)]));
  const kept = edges.filter((edge) => exits.get(edge.source)?.includes(handleOf(edge)) && exits.has(edge.target));
  return kept.length === edges.length ? edges : kept;
}

/** A gateway's exits in evaluation order. */
export const gatewayEdges = (gatewayId: string, edges: FlowEdge[]): FlowEdge[] => edges.filter((edge) => edge.source === gatewayId);

/** Moves one of a gateway's exits up or down in the evaluation order. */
export function moveGatewayEdge(edges: FlowEdge[], edgeId: string, direction: -1 | 1): FlowEdge[] {
  const edge = edges.find((candidate) => candidate.id === edgeId);
  if (!edge) return edges;
  const siblings = gatewayEdges(edge.source, edges);
  const index = siblings.findIndex((candidate) => candidate.id === edgeId);
  const other = siblings[index + direction];
  if (!other) return edges;
  const next = [...edges];
  const a = next.indexOf(edge);
  const b = next.indexOf(other);
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}
