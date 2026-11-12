/**
 * @fileoverview Reading and checking a flow's graph.
 *
 * validateGraph() decides whether a draft may be published: the engine only
 * ever executes graphs that passed it, so everything the engine relies on
 * (one start, every exit wired at most once, references that point at
 * something a run will have) is checked here and not again at run time.
 * It also derives the permissions the flow's runs will act with.
 *
 * @module services/workflow/workflow-graph
 */

import {
  ApiTokenPermissions,
  CapabilityKey,
  PermissionLevel,
  ResourceKey,
  hasLevel,
} from '../auth/api-token-permissions';
import {
  WORKFLOW_CONDITION_OPS,
  WORKFLOW_HANDLES,
  WORKFLOW_NODE_TYPES,
  WORKFLOW_TASK_KINDS,
  WorkflowEdge,
  WorkflowGraph,
  WorkflowHandle,
  WorkflowIssue,
  WorkflowNode,
  WorkflowSubjectType,
  WorkflowValidation,
  WorkflowValue,
} from '../../types/workflow.types';
import { TASK_OUTPUTS, WORKFLOW_DOCUMENT_TYPES, getWorkflowAction } from './workflow-actions';
import { getWorkflowEvent } from './workflow-events';
import { getWorkflowSubject, subjectVariables } from './workflow-subjects';
import { collectPaths, isValidPath } from './workflow-expression';

export const MAX_NODES = 100;
export const MAX_EDGES = 300;
const NODE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const FORM_KEY = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;

export const EMPTY_GRAPH: WorkflowGraph = { nodes: [], edges: [] };

export function handleOf(edge: WorkflowEdge): WorkflowHandle {
  return edge.sourceHandle ?? 'out';
}

export function findNode(graph: WorkflowGraph, nodeId: string): WorkflowNode | undefined {
  return graph.nodes.find((node) => node.id === nodeId);
}

export function startNode(graph: WorkflowGraph): WorkflowNode | undefined {
  return graph.nodes.find((node) => node.type === 'start');
}

/** Edges leaving a node, in drawing order (the order gateways try them in). */
export function outgoing(graph: WorkflowGraph, nodeId: string, handle?: WorkflowHandle): WorkflowEdge[] {
  return graph.edges.filter((edge) => edge.source === nodeId && (handle === undefined || handleOf(edge) === handle));
}

export function nodeLabel(node: WorkflowNode): string {
  const label = node.data?.label?.trim();
  if (label) return label;
  if (node.type === 'action') return getWorkflowAction(node.data.action)?.title ?? node.data.action;
  if (node.type === 'task') return node.data.title || 'Task';
  return node.type.charAt(0).toUpperCase() + node.type.slice(1);
}

/** Exits a node of this configuration has. */
export function handlesOf(node: WorkflowNode): WorkflowHandle[] {
  if (node.type === 'end') return [];
  if (node.type === 'wait') {
    return node.data.mode === 'event' && Number(node.data.timeoutDays) > 0 ? ['out', 'timeout'] : ['out'];
  }
  if (node.type !== 'task') return ['out'];
  const handles: WorkflowHandle[] = ['out'];
  if (node.data.kind === 'confirm') handles.push('rejected');
  if (typeof node.data.dueInDays === 'number' && node.data.dueInDays > 0) handles.push('timeout');
  return handles;
}

/** Ids of every node a run has passed before it can reach `nodeId`. */
function ancestorsOf(graph: WorkflowGraph, nodeId: string): Set<string> {
  const incoming = new Map<string, string[]>();
  for (const edge of graph.edges) {
    incoming.set(edge.target, [...(incoming.get(edge.target) ?? []), edge.source]);
  }
  const seen = new Set<string>();
  const queue = [...(incoming.get(nodeId) ?? [])];
  while (queue.length > 0) {
    const current = queue.pop() as string;
    if (seen.has(current)) continue;
    seen.add(current);
    queue.push(...(incoming.get(current) ?? []));
  }
  return seen;
}

function reachableFrom(graph: WorkflowGraph, nodeId: string): Set<string> {
  const seen = new Set<string>([nodeId]);
  const queue = [nodeId];
  while (queue.length > 0) {
    const current = queue.pop() as string;
    for (const edge of graph.edges) {
      if (edge.source === current && !seen.has(edge.target)) {
        seen.add(edge.target);
        queue.push(edge.target);
      }
    }
  }
  return seen;
}

/** Whether `steps.<id>.<key>` names something that node produces. */
function producesKey(node: WorkflowNode, key: string): boolean {
  if (key === 'outcome') return true;
  if (node.type === 'action') return getWorkflowAction(node.data.action)?.output.some((o) => o.key === key) ?? false;
  if (node.type === 'wait') {
    return node.data.mode === 'event' && (getWorkflowEvent(node.data.event)?.output.some((o) => o.key === key) ?? false);
  }
  if (node.type === 'task') {
    if (TASK_OUTPUTS[node.data.kind]?.some((o) => o.key === key)) return true;
    return node.data.kind === 'form' && (node.data.fields ?? []).some((field) => field.key === key);
  }
  return false;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOptionalText(value: unknown): boolean {
  return value === undefined || value === null || typeof value === 'string';
}

/** The shape checks — anything else in this file may assume them. Returns false when the graph is unusable. */
function checkShape(graph: unknown, issues: WorkflowIssue[]): graph is WorkflowGraph {
  if (!isObject(graph) || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    issues.push({ code: 'BAD_GRAPH', message: 'The flow has no nodes and edges.' });
    return false;
  }
  if (graph.nodes.length > MAX_NODES || graph.edges.length > MAX_EDGES) {
    issues.push({ code: 'TOO_LARGE', message: `A flow may have at most ${MAX_NODES} nodes and ${MAX_EDGES} edges.` });
    return false;
  }
  let usable = true;
  const ids = new Set<string>();
  for (const node of graph.nodes as unknown[]) {
    if (!isObject(node) || typeof node.id !== 'string' || !NODE_ID.test(node.id)) {
      issues.push({ code: 'BAD_NODE_ID', message: 'A node has no valid id.' });
      usable = false;
      continue;
    }
    if (ids.has(node.id)) {
      issues.push({ code: 'DUPLICATE_NODE_ID', message: `The id "${node.id}" is used twice.`, nodeId: node.id });
      usable = false;
    }
    ids.add(node.id);
    if (!(WORKFLOW_NODE_TYPES as readonly string[]).includes(node.type as string) || !isObject(node.data)) {
      issues.push({ code: 'BAD_NODE', message: 'A node has an unknown type or no settings.', nodeId: node.id });
      usable = false;
    } else if (['label', 'title', 'description', 'result'].some((key) => !isOptionalText((node.data as Record<string, unknown>)[key]))) {
      // Everything below (and the engine) reads these as text.
      issues.push({ code: 'BAD_NODE', message: 'A text setting of a node is not text.', nodeId: node.id });
      usable = false;
    }
  }
  const edgeIds = new Set<string>();
  for (const edge of graph.edges as unknown[]) {
    if (!isObject(edge) || typeof edge.id !== 'string' || typeof edge.source !== 'string' || typeof edge.target !== 'string') {
      issues.push({ code: 'BAD_EDGE', message: 'A connection is incomplete.' });
      usable = false;
      continue;
    }
    if (edgeIds.has(edge.id)) {
      issues.push({ code: 'BAD_EDGE', message: 'Two connections share an id.', edgeId: edge.id });
      usable = false;
    }
    edgeIds.add(edge.id);
    if (!ids.has(edge.source) || !ids.has(edge.target)) {
      issues.push({ code: 'DANGLING_EDGE', message: 'A connection leads to a node that does not exist.', edgeId: edge.id });
      usable = false;
    }
    const handle = edge.sourceHandle;
    if (handle !== undefined && handle !== null && !(WORKFLOW_HANDLES as readonly string[]).includes(handle as string)) {
      issues.push({ code: 'BAD_HANDLE', message: 'A connection leaves through an exit that does not exist.', edgeId: edge.id });
      usable = false;
    }
  }
  return usable;
}

function checkValue(
  value: WorkflowValue | undefined,
  where: { nodeId: string; field?: string },
  graph: WorkflowGraph,
  known: Set<string>,
  ancestors: Set<string>,
  issues: WorkflowIssue[]
): void {
  for (const path of collectPaths(value)) {
    const bad = (message: string) => issues.push({ code: 'BAD_REFERENCE', message, ...where });
    if (!isValidPath(path)) {
      bad(`"${path}" is not a valid reference.`);
      continue;
    }
    const [root, stepId, ...rest] = path.split('.');
    if (root !== 'steps') {
      if (!known.has(path)) bad(`"${path}" does not exist for this flow's subject.`);
      continue;
    }
    const source = stepId ? findNode(graph, stepId) : undefined;
    if (!source || rest.length !== 1) {
      bad(`"${path}" does not point at a step's result.`);
    } else if (!ancestors.has(source.id)) {
      bad(`"${path}" refers to a step that does not run before this one.`);
    } else if (!producesKey(source, rest[0])) {
      bad(`"${path}": that step has no result "${rest[0]}".`);
    }
  }
}

/** Sums up what every action in the graph needs. */
export function derivePermissions(graph: WorkflowGraph): ApiTokenPermissions {
  const resources: Partial<Record<ResourceKey, PermissionLevel>> = {};
  const capabilities = new Set<CapabilityKey>();
  for (const node of graph.nodes) {
    if (node.type !== 'action') continue;
    const need = getWorkflowAction(node.data.action)?.needs(node.data.input ?? {});
    for (const resource of need?.resources ?? []) {
      if (!hasLevel(resources[resource.key], resource.level)) resources[resource.key] = resource.level;
    }
    for (const capability of need?.capabilities ?? []) capabilities.add(capability);
  }
  return { resources, capabilities: Array.from(capabilities).sort() };
}

export function validateGraph(candidate: unknown, subjectType: WorkflowSubjectType): WorkflowValidation {
  const issues: WorkflowIssue[] = [];
  const add = (issue: WorkflowIssue) => issues.push(issue);
  if (!checkShape(candidate, issues)) {
    return { valid: false, issues, permissions: { resources: {}, capabilities: [] } };
  }
  const graph = candidate;

  const starts = graph.nodes.filter((node) => node.type === 'start');
  if (starts.length === 0) add({ code: 'NO_START', message: 'The flow needs a start.' });
  if (starts.length > 1) add({ code: 'MULTIPLE_STARTS', message: 'The flow may have only one start.', nodeId: starts[1].id });
  if (!graph.nodes.some((node) => node.type === 'end')) add({ code: 'NO_END', message: 'The flow needs an end.' });

  const variables = subjectVariables(subjectType);
  if (!variables) {
    add({ code: 'UNKNOWN_SUBJECT', message: `Flows cannot be about "${subjectType}" at the moment (is its addon enabled?).` });
  }
  const known = new Set((variables ?? []).map((variable) => variable.path));
  for (const extra of ['subject.id', 'subject.type', 'subject.label', 'run.id', 'run.test']) known.add(extra);
  // A run started by an event knows what happened.
  const startsWith = starts[0]?.type === 'start' && starts[0].data.trigger === 'event' ? getWorkflowEvent(starts[0].data.event?.type) : undefined;
  if (startsWith) {
    known.add('event.type');
    for (const output of startsWith.output) known.add(`event.${output.key}`);
  }
  const reachable = starts.length > 0 ? reachableFrom(graph, starts[0].id) : new Set<string>();

  for (const edge of graph.edges) {
    const source = findNode(graph, edge.source) as WorkflowNode;
    const target = findNode(graph, edge.target) as WorkflowNode;
    if (edge.source === edge.target) add({ code: 'SELF_LOOP', message: 'A node cannot lead straight back to itself.', edgeId: edge.id });
    if (target.type === 'start') add({ code: 'START_HAS_ENTRY', message: 'Nothing can lead into the start.', edgeId: edge.id });
    if (!handlesOf(source).includes(handleOf(edge))) {
      add({ code: 'BAD_HANDLE', message: 'A connection leaves through an exit this node does not have.', edgeId: edge.id, nodeId: source.id });
    }
    if (edge.condition && source.type !== 'gateway') {
      add({ code: 'BAD_CONDITION', message: 'Only the exits of a branch can have conditions.', edgeId: edge.id });
    }
    if (edge.condition && source.type === 'gateway' && source.data.mode === 'parallel') {
      add({
        code: 'PARALLEL_CONDITION',
        message: 'A parallel branch takes all its exits; they cannot have conditions.',
        edgeId: edge.id,
        nodeId: source.id,
      });
    }
  }

  for (const node of graph.nodes) {
    const where = { nodeId: node.id };
    if (starts.length > 0 && !reachable.has(node.id)) {
      add({ code: 'UNREACHABLE', message: 'This node is not connected to the start.', ...where });
    }
    const ancestors = ancestorsOf(graph, node.id);

    // Exits: every node but the end needs its "out"; only branches may have several.
    if (node.type !== 'end') {
      const exits = outgoing(graph, node.id, 'out');
      if (exits.length === 0) add({ code: 'NO_EXIT', message: 'This node leads nowhere.', ...where });
      if (node.type !== 'gateway') {
        for (const handle of handlesOf(node)) {
          if (outgoing(graph, node.id, handle).length > 1) {
            add({ code: 'MULTIPLE_EXITS', message: 'Only a branch can lead to several nodes from one exit.', ...where });
          }
        }
      }
    }

    switch (node.type) {
      case 'start': {
        const { trigger, schedule } = node.data;
        if (trigger !== 'manual' && trigger !== 'schedule' && trigger !== 'event') {
          add({ code: 'BAD_START', message: 'Choose how the flow starts.', ...where });
        }
        if (trigger === 'event') {
          const event = getWorkflowEvent(node.data.event?.type);
          const clients = node.data.event?.clientIds;
          if (!event) {
            add({ code: 'BAD_EVENT', message: 'Choose the event the flow starts with.', ...where });
          } else if (event.subject_type !== subjectType) {
            const about = getWorkflowSubject(event.subject_type)?.title.toLowerCase() ?? event.subject_type;
            add({ code: 'EVENT_SUBJECT', message: `This event happens to another kind of record (${about}); the flow must be about that.`, ...where });
          }
          if (clients !== undefined && (!Array.isArray(clients) || clients.some((id) => typeof id !== 'string'))) {
            add({ code: 'BAD_EVENT', message: 'The clients of the event start are not a list.', ...where });
          }
          // A flow that starts when an invoice is created and creates one would start itself again.
          const loops =
            event?.key === 'invoice.created' &&
            graph.nodes.some((other) => other.type === 'action' && other.data.action === 'invoice.createDraft');
          if (loops) {
            add({ code: 'EVENT_LOOP', message: 'This flow creates an invoice, which would start it again. Use another start or remove that action.', ...where });
          }
        }
        if (trigger === 'schedule') {
          const day = schedule?.dayOfMonth;
          const dayOk = day === 'last' || (typeof day === 'number' && Number.isInteger(day) && day >= 1 && day <= 28);
          const periodOk = schedule?.period === 'current_month' || schedule?.period === 'previous_month';
          const subjects = Array.isArray(schedule?.subjectIds) ? schedule.subjectIds : [];
          if (!dayOk || !periodOk) add({ code: 'BAD_SCHEDULE', message: 'Choose the day and the period of the schedule.', ...where });
          if (subjectType !== 'none' && !getWorkflowSubject(subjectType)?.schedulable) {
            add({ code: 'BAD_SCHEDULE', message: 'A flow about this cannot start on a schedule.', ...where });
          } else if (subjectType !== 'none' && subjects.length === 0) {
            add({ code: 'NO_SCHEDULE_SUBJECTS', message: 'Choose who the scheduled flow runs for.', ...where });
          }
        }
        break;
      }
      case 'action': {
        const action = getWorkflowAction(node.data.action);
        if (!action) {
          add({ code: 'UNKNOWN_ACTION', message: `The action "${node.data.action}" does not exist.`, ...where });
          break;
        }
        if (node.data.mode !== 'auto' && node.data.mode !== 'approval') {
          add({ code: 'BAD_MODE', message: 'Choose whether the action runs by itself or waits for approval.', ...where });
        }
        const input = isObject(node.data.input) ? (node.data.input as Record<string, WorkflowValue>) : {};
        for (const field of action.input) {
          const value = input[field.key];
          const missing = value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
          if (field.required && missing) {
            add({ code: 'MISSING_INPUT', message: `"${field.label}" is missing.`, field: field.key, ...where });
          }
          checkValue(value, { ...where, field: field.key }, graph, known, ancestors, issues);
        }
        const problem = action.check?.(input);
        if (problem) add({ code: 'ACTION_INVALID', message: problem, ...where });
        break;
      }
      case 'task': {
        const data = node.data;
        if (!(WORKFLOW_TASK_KINDS as readonly string[]).includes(data.kind)) {
          add({ code: 'BAD_TASK', message: 'Choose what kind of task this is.', ...where });
        }
        if (!data.title || data.title.trim() === '') add({ code: 'MISSING_TITLE', message: 'The task needs a title.', ...where });
        checkValue(data.title, { ...where, field: 'title' }, graph, known, ancestors, issues);
        checkValue(data.description, { ...where, field: 'description' }, graph, known, ancestors, issues);
        if (data.kind === 'upload' && (!data.documentType || !WORKFLOW_DOCUMENT_TYPES.includes(data.documentType))) {
          add({ code: 'BAD_DOCUMENT_TYPE', message: 'Choose the type the uploaded document is filed as.', ...where });
        }
        // The uploaded file is filed with a client, so the run has to know one.
        if (data.kind === 'upload' && !known.has('client.id')) {
          add({ code: 'UPLOAD_NEEDS_CLIENT', message: 'An upload is filed with a client, so the flow must be about one, or about something that belongs to one.', ...where });
        }
        if (data.kind === 'form') {
          const fields = Array.isArray(data.fields) ? data.fields : [];
          const keys = new Set<string>();
          if (fields.length === 0) add({ code: 'NO_FORM_FIELDS', message: 'The form needs at least one field.', ...where });
          for (const field of fields) {
            const fieldOk =
              isObject(field) &&
              typeof field.key === 'string' &&
              FORM_KEY.test(field.key) &&
              !keys.has(field.key) &&
              typeof field.label === 'string' &&
              field.label.trim() !== '' &&
              ['text', 'number', 'date', 'boolean'].includes(field.type as string);
            if (!fieldOk) {
              add({ code: 'BAD_FORM_FIELD', message: 'Every form field needs a label, a type and a unique key.', ...where });
              break;
            }
            keys.add(field.key);
          }
        }
        if (data.dueInDays !== undefined && data.dueInDays !== null && !(Number(data.dueInDays) > 0 && Number(data.dueInDays) <= 365)) {
          add({ code: 'BAD_DUE', message: 'The due date must be between 1 and 365 days.', ...where });
        }
        break;
      }
      case 'wait': {
        if (node.data.mode !== undefined && node.data.mode !== 'duration' && node.data.mode !== 'event') {
          add({ code: 'BAD_WAIT', message: 'Choose what to wait for.', ...where });
        } else if (node.data.mode === 'event') {
          const event = getWorkflowEvent(node.data.event);
          if (!event) add({ code: 'BAD_EVENT', message: 'Choose the event to wait for.', ...where });
          // Without its own setting the wait is about the run's subject — which fits only if the
          // event happens to that kind of subject.
          const subject = node.data.subject;
          const unset = subject === undefined || subject === null || subject === '';
          if (unset && event && event.subject_type !== subjectType) {
            add({ code: 'WAIT_NO_SUBJECT', message: 'Choose the record to wait for.', field: 'subject', ...where });
          }
          checkValue(subject, { ...where, field: 'subject' }, graph, known, ancestors, issues);
          const days = node.data.timeoutDays;
          if (days !== undefined && days !== null && !(Number(days) > 0 && Number(days) <= 365)) {
            add({ code: 'BAD_DUE', message: 'The due date must be between 1 and 365 days.', ...where });
          }
        } else {
          const hours = (Number(node.data.days) || 0) * 24 + (Number(node.data.hours) || 0);
          if (!(hours > 0) || hours > 366 * 24) add({ code: 'BAD_DURATION', message: 'Choose how long to wait (at most a year).', ...where });
        }
        break;
      }
      case 'gateway': {
        const exits = outgoing(graph, node.id, 'out');
        if (node.data.mode !== undefined && node.data.mode !== 'exclusive' && node.data.mode !== 'parallel') {
          add({ code: 'BAD_GATEWAY', message: 'Choose whether the branch takes one exit or all.', ...where });
        }
        if (node.data.mode === 'parallel') break; // all exits are taken; conditions are refused with the edges above
        if (exits.filter((edge) => !edge.condition).length > 1) {
          add({ code: 'MULTIPLE_DEFAULTS', message: 'A branch can have only one exit without a condition.', ...where });
        }
        for (const edge of exits) {
          if (!edge.condition) continue;
          const { match, rules } = edge.condition;
          const rulesOk =
            (match === 'all' || match === 'any') &&
            Array.isArray(rules) &&
            rules.length > 0 &&
            rules.every(
              (rule) =>
                typeof rule?.left === 'string' &&
                isValidPath(rule.left) &&
                (WORKFLOW_CONDITION_OPS as readonly string[]).includes(rule.op)
            );
          if (!rulesOk) {
            add({ code: 'BAD_CONDITION', message: 'A condition is incomplete.', edgeId: edge.id, ...where });
            continue;
          }
          for (const rule of rules) {
            checkValue({ $ref: rule.left }, { ...where }, graph, known, ancestors, issues);
          }
        }
        break;
      }
      case 'end':
        checkValue(node.data.result, { ...where, field: 'result' }, graph, known, ancestors, issues);
        if (outgoing(graph, node.id).length > 0) add({ code: 'END_HAS_EXIT', message: 'Nothing can follow the end.', ...where });
        break;
    }
  }

  return { valid: issues.length === 0, issues, permissions: derivePermissions(graph) };
}
