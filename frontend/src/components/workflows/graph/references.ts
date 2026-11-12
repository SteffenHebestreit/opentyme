/**
 * @fileoverview What a node may refer to.
 *
 * A configured value is a literal or a reference into the run's data: the
 * subject's variables, or the output of a step that ran before. "Before"
 * means upstream in the graph — a node can only use what is certain to exist
 * when the run reaches it. These helpers compute those options and keep them
 * to the types a field accepts.
 */
import type {
  ActionNodeData,
  TaskNodeData,
  WorkflowCatalog,
  WorkflowFieldType,
  WorkflowFormField,
  WorkflowNodeType,
  WorkflowOutputSpec,
  WorkflowSubjectType,
  WorkflowValue,
} from '../../../api/types/workflow.types';

export type ValueType = WorkflowOutputSpec['type'];

interface GraphNode {
  id: string;
  type?: WorkflowNodeType;
  data: { config: unknown };
}
interface GraphEdge {
  source: string;
  target: string;
}

export interface ReferenceOption {
  /** What goes into `{ $ref }` or `{{…}}`. */
  path: string;
  type: ValueType;
  /** The catalog's English label — the UI translates by `key`. */
  label: string;
  key: string;
  /** Where the value comes from: the run's subject data, or an earlier step. */
  source: { kind: 'variable' } | { kind: 'step'; nodeId: string; nodeType: WorkflowNodeType; action?: string; taskKind?: string };
}

export const isRef = (value: unknown): value is { $ref: string } =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && typeof (value as { $ref?: unknown }).$ref === 'string';

export const refOf = (path: string): { $ref: string } => ({ $ref: path });

/** Ids of every node from which `nodeId` can be reached (never `nodeId` itself). */
export function upstreamNodeIds(nodeId: string, edges: GraphEdge[]): string[] {
  const incoming = new Map<string, string[]>();
  for (const edge of edges) {
    const list = incoming.get(edge.target);
    if (list) list.push(edge.source);
    else incoming.set(edge.target, [edge.source]);
  }
  const seen = new Set<string>();
  const queue = [...(incoming.get(nodeId) ?? [])];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    if (current === nodeId || seen.has(current)) continue;
    seen.add(current);
    queue.push(...(incoming.get(current) ?? []));
  }
  return [...seen];
}

const FORM_FIELD_TYPES: Record<WorkflowFormField['type'], ValueType> = {
  text: 'string',
  number: 'number',
  date: 'date',
  boolean: 'boolean',
};

/** What a node leaves in the run's data under `steps.<id>.…`. */
export function nodeOutputs(node: GraphNode, catalog: WorkflowCatalog | undefined): WorkflowOutputSpec[] {
  if (node.type === 'action') {
    const action = (node.data.config as ActionNodeData).action;
    return catalog?.actions.find((spec) => spec.key === action)?.output ?? [];
  }
  if (node.type === 'task') {
    const task = node.data.config as TaskNodeData;
    const outputs = [...(catalog?.taskOutputs?.[task.kind] ?? [])];
    for (const field of task.kind === 'form' ? task.fields ?? [] : []) {
      if (field.key && !outputs.some((output) => output.key === field.key)) {
        outputs.push({ key: field.key, type: FORM_FIELD_TYPES[field.type] ?? 'string', label: field.label || field.key });
      }
    }
    // The exit a task was left through — what a gateway after it usually asks for
    if (!outputs.some((output) => output.key === 'outcome')) outputs.push({ key: 'outcome', type: 'string', label: 'Outcome' });
    return outputs;
  }
  return [];
}

/** Everything `nodeId` may refer to: the subject's variables, then upstream steps' outputs in graph order. */
export function referenceOptions(args: {
  nodeId: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  catalog: WorkflowCatalog | undefined;
  subjectType: WorkflowSubjectType;
}): ReferenceOption[] {
  const { nodeId, nodes, edges, catalog, subjectType } = args;
  const options: ReferenceOption[] = (catalog?.variables?.[subjectType] ?? []).map((variable) => ({
    path: variable.path,
    type: variable.type,
    label: variable.label,
    key: variable.path,
    source: { kind: 'variable' },
  }));
  const upstream = new Set(upstreamNodeIds(nodeId, edges));
  for (const node of nodes) {
    if (!upstream.has(node.id) || !node.type) continue;
    for (const output of nodeOutputs(node, catalog)) {
      options.push({
        path: `steps.${node.id}.${output.key}`,
        type: output.type,
        label: output.label,
        key: output.key,
        source: {
          kind: 'step',
          nodeId: node.id,
          nodeType: node.type,
          action: node.type === 'action' ? (node.data.config as ActionNodeData).action : undefined,
          taskKind: node.type === 'task' ? (node.data.config as TaskNodeData).kind : undefined,
        },
      });
    }
  }
  return options;
}

const TEXTUAL: ValueType[] = ['string', 'number', 'date', 'email', 'boolean'];

/** Which kinds of run data fit a field. Ids only go where that kind of id is expected. */
const ACCEPTS: Record<WorkflowFieldType, ValueType[]> = {
  string: TEXTUAL,
  text: TEXTUAL,
  number: ['number'],
  boolean: ['boolean'],
  date: ['date'],
  email: ['email', 'string'],
  select: ['string'],
  client: ['client'],
  project: ['project'],
  invoice: ['invoice'],
  document: ['document'],
  documents: ['document'],
  emailTemplate: ['string'],
  documentType: ['string'],
};

export const acceptsType = (fieldType: WorkflowFieldType, valueType: ValueType): boolean =>
  (ACCEPTS[fieldType] ?? TEXTUAL).includes(valueType);

export const referencesFor = (fieldType: WorkflowFieldType, options: ReferenceOption[]): ReferenceOption[] =>
  options.filter((option) => acceptsType(fieldType, option.type));

/** Fields that only make sense as a reference — nobody types a document id. */
export const isReferenceOnly = (fieldType: WorkflowFieldType): boolean => fieldType === 'document' || fieldType === 'documents';

/** Fields whose text may embed `{{path}}` placeholders. */
export const allowsPlaceholders = (fieldType: WorkflowFieldType): boolean =>
  fieldType === 'string' || fieldType === 'text' || fieldType === 'email';

/** The paths a value refers to, whether as `{ $ref }` or as `{{…}}` inside text. */
export function referencedPaths(value: WorkflowValue | undefined): string[] {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value.flatMap(referencedPaths);
  if (isRef(value)) return [value.$ref];
  if (typeof value === 'string') return [...value.matchAll(/\{\{\s*([^{}\s]+)\s*\}\}/g)].map((match) => match[1]);
  return [];
}
