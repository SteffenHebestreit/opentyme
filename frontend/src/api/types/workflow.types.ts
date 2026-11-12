/**
 * @fileoverview The workflow engine’s vocabulary as the API returns it: the
 * graph a flow is drawn as, what a run records, the catalog the editor offers.
 *
 * Mirror of backend/src/types/workflow.types.ts (the contract) — keep the two
 * in step. Semantics: docs/WORKFLOW_ENGINE.md.
 *
 * @module api/types/workflow
 */

import type { ApiTokenPermissions } from '../types';

// ── Graph ────────────────────────────────────────────────────────────────────

export const WORKFLOW_NODE_TYPES = ['start', 'action', 'task', 'wait', 'gateway', 'end'] as const;
export type WorkflowNodeType = (typeof WORKFLOW_NODE_TYPES)[number];

/** What a run is about. `none` = a flow without a subject (started by hand). */
export const WORKFLOW_SUBJECT_TYPES = ['client', 'project', 'invoice', 'none'] as const;
export type WorkflowSubjectType = (typeof WORKFLOW_SUBJECT_TYPES)[number];

/**
 * A configured value: a literal, or `{ $ref: 'path' }` into the run's data
 * (e.g. `steps.n3.documentId`, `client.id`, `period.start`). String literals
 * may also embed `{{path}}` placeholders.
 */
export type WorkflowValue = string | number | boolean | null | { $ref: string } | WorkflowValue[];

/** Exits a node can be left through; an edge names one in `sourceHandle`. */
export const WORKFLOW_HANDLES = ['out', 'rejected', 'timeout'] as const;
export type WorkflowHandle = (typeof WORKFLOW_HANDLES)[number];

export interface WorkflowSchedule {
  /** Day of the month the flow starts on: 1–28 or the last day. Fires at 06:00 UTC. */
  dayOfMonth: number | 'last';
  /** The period a scheduled run covers. */
  period: 'current_month' | 'previous_month';
  /** Subjects (client / project ids) a run is started for. */
  subjectIds: string[];
}

export interface WorkflowEventTrigger {
  /** Key of a catalog event, e.g. `invoice.corrected`. */
  type: string;
  /** Only for records of these clients; empty or missing = all. */
  clientIds?: string[];
}

export interface StartNodeData {
  label?: string;
  /**
   * `manual` runs can always be started by hand; `schedule` adds the timer;
   * `event` starts a run whenever the event happens (flows about an invoice).
   */
  trigger: 'manual' | 'schedule' | 'event';
  schedule?: WorkflowSchedule;
  event?: WorkflowEventTrigger;
}

export type WorkflowActionMode = 'auto' | 'approval';

export interface ActionNodeData {
  label?: string;
  /** Key of a catalog action, e.g. `email.send`. */
  action: string;
  input: Record<string, WorkflowValue>;
  /** `approval`: a task shows the prepared action first; nothing runs until it is approved. */
  mode: WorkflowActionMode;
}

export const WORKFLOW_TASK_KINDS = ['confirm', 'upload', 'form'] as const;
export type WorkflowTaskKind = (typeof WORKFLOW_TASK_KINDS)[number];

export interface WorkflowFormField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'boolean';
  required?: boolean;
}

export interface TaskNodeData {
  label?: string;
  kind: WorkflowTaskKind;
  /** Shown in the task list; may embed `{{path}}` placeholders. */
  title: string;
  description?: string;
  /** `upload`: the client-document type the uploaded file is stored as. */
  documentType?: string;
  /** `form`: the fields to fill in; values land in the step's output. */
  fields?: WorkflowFormField[];
  /** Days until the task expires and the run leaves through `timeout`. */
  dueInDays?: number;
}

export interface WaitNodeData {
  label?: string;
  /** `duration` (default) waits `days` / `hours`; `event` waits until the event happens to `subject`. */
  mode?: 'duration' | 'event';
  days?: number;
  hours?: number;
  /** `event`: key of a catalog event, e.g. `invoice.paid`. */
  event?: string;
  /** `event`: the invoice the event is about; defaults to the run's own invoice. */
  subject?: WorkflowValue;
  /** `event`: days after which the run stops waiting and leaves through `timeout`. */
  timeoutDays?: number;
}

export interface GatewayNodeData {
  label?: string;
  /**
   * `exclusive` (default) takes exactly one exit, by its conditions. `parallel` takes all
   * exits at once; a parallel gateway with several entries waits until every branch arrived.
   */
  mode?: 'exclusive' | 'parallel';
}

export interface EndNodeData {
  label?: string;
  /** Recorded as the run's result; may embed `{{path}}` placeholders. */
  result?: string;
}

interface NodeBase<T extends WorkflowNodeType, D> {
  /** Unique within the graph; `[A-Za-z0-9_-]{1,64}`. Used in `steps.<id>.…` references. */
  id: string;
  type: T;
  position: { x: number; y: number };
  data: D;
}

export type WorkflowNode =
  | NodeBase<'start', StartNodeData>
  | NodeBase<'action', ActionNodeData>
  | NodeBase<'task', TaskNodeData>
  | NodeBase<'wait', WaitNodeData>
  | NodeBase<'gateway', GatewayNodeData>
  | NodeBase<'end', EndNodeData>;

export const WORKFLOW_CONDITION_OPS = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains', 'empty', 'not_empty'] as const;
export type WorkflowConditionOp = (typeof WORKFLOW_CONDITION_OPS)[number];

export interface WorkflowConditionRule {
  /** Path into the run's data, e.g. `steps.n2.totalHours`. */
  left: string;
  op: WorkflowConditionOp;
  /** Not used by `empty` / `not_empty`. */
  right?: string | number | boolean | null;
}

export interface WorkflowCondition {
  match: 'all' | 'any';
  rules: WorkflowConditionRule[];
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  /** Which exit of the source node; defaults to `out`. */
  sourceHandle?: WorkflowHandle | null;
  label?: string;
  /**
   * Gateway exits only. Edges are tried in array order; the first whose
   * condition holds is taken. An edge without a condition is the "otherwise"
   * branch (at most one per gateway).
   */
  condition?: WorkflowCondition | null;
}

export interface WorkflowGraph {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

// ── Validation ───────────────────────────────────────────────────────────────

export interface WorkflowIssue {
  /** Stable code the UI translates, e.g. `NO_START`, `MISSING_INPUT`. */
  code: string;
  /** English fallback text. */
  message: string;
  nodeId?: string;
  edgeId?: string;
  /** Input field the issue is about (`MISSING_INPUT`, `BAD_REFERENCE`). */
  field?: string;
}

export interface WorkflowValidation {
  valid: boolean;
  issues: WorkflowIssue[];
  /** What the flow's actions need — granted to its runs when it is published. */
  permissions: ApiTokenPermissions;
}

// ── Catalog (what the editor offers) ─────────────────────────────────────────

export type WorkflowFieldType =
  | 'string'
  | 'text'
  | 'number'
  | 'boolean'
  | 'date'
  | 'email'
  | 'select'
  | 'client'
  | 'project'
  | 'invoice'
  | 'document'
  | 'documents'
  | 'emailTemplate'
  | 'documentType';

export interface WorkflowFieldSpec {
  key: string;
  type: WorkflowFieldType;
  /** English fallback; the UI translates `workflows:actions.<action>.fields.<key>`. */
  label: string;
  required?: boolean;
  /** `select` only. */
  options?: string[];
  /** Pre-filled when the node is dropped on the canvas. */
  default?: WorkflowValue;
}

export interface WorkflowOutputSpec {
  key: string;
  /** What kind of value it is, so the editor only offers fitting references. */
  type: 'string' | 'number' | 'boolean' | 'date' | 'client' | 'project' | 'invoice' | 'document' | 'email';
  label: string;
}

export type WorkflowActionEffect = 'read' | 'write' | 'external';

export interface WorkflowActionSpec {
  key: string;
  category: string;
  /** English fallback; the UI translates `workflows:actions.<key>.title`. */
  title: string;
  description: string;
  /** `external` leaves the system (mail) — never repeated automatically. */
  effect: WorkflowActionEffect;
  defaultMode: WorkflowActionMode;
  input: WorkflowFieldSpec[];
  output: WorkflowOutputSpec[];
}

export interface WorkflowVariableSpec {
  path: string;
  type: WorkflowOutputSpec['type'];
  label: string;
}

export interface WorkflowEventSpec {
  /** E.g. `invoice.paid`. */
  key: string;
  /** What the event happens to — a flow starting with it runs for that record. */
  subject_type: WorkflowSubjectType;
  /** English fallback; the UI translates `workflows:events.<key>.title`. */
  title: string;
  description: string;
  /** Run data an event start provides under `event.<key>`; a wait's step outputs the same keys. */
  output: WorkflowOutputSpec[];
}

export interface WorkflowCatalog {
  actions: WorkflowActionSpec[];
  events: WorkflowEventSpec[];
  /** Run data available per subject type, besides the steps' outputs. */
  variables: Record<WorkflowSubjectType, WorkflowVariableSpec[]>;
  /** Outputs of task nodes, by kind (form fields add their own keys). */
  taskOutputs: Record<WorkflowTaskKind, WorkflowOutputSpec[]>;
  documentTypes: string[];
}

export interface WorkflowTemplate {
  key: string;
  name: string;
  description: string;
  subject_type: WorkflowSubjectType;
  graph: WorkflowGraph;
}

// ── Stored objects as the API returns them ───────────────────────────────────

export const WORKFLOW_DEFINITION_STATUSES = ['draft', 'active', 'paused', 'archived'] as const;
export type WorkflowDefinitionStatus = (typeof WORKFLOW_DEFINITION_STATUSES)[number];

export interface WorkflowDefinitionSummary {
  id: string;
  name: string;
  description: string | null;
  subject_type: WorkflowSubjectType;
  status: WorkflowDefinitionStatus;
  /** Null until first published. */
  published_version: number | null;
  /** The draft differs from the published version. */
  has_unpublished_changes: boolean;
  /** Runs that are neither completed nor cancelled. */
  active_runs: number;
  /** Next scheduled start, if the published version has a schedule and the flow is active. */
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkflowDefinition extends WorkflowDefinitionSummary {
  /** The editable draft. */
  graph: WorkflowGraph;
  /** Permissions the published version's runs act with. */
  published_permissions: ApiTokenPermissions | null;
}

export const WORKFLOW_RUN_STATUSES = ['running', 'waiting', 'incident', 'completed', 'cancelled'] as const;
export type WorkflowRunStatus = (typeof WORKFLOW_RUN_STATUSES)[number];

export const WORKFLOW_STEP_STATUSES = ['pending', 'running', 'waiting', 'completed', 'failed', 'skipped', 'cancelled'] as const;
export type WorkflowStepStatus = (typeof WORKFLOW_STEP_STATUSES)[number];

export interface WorkflowStep {
  id: string;
  node_id: string;
  node_type: WorkflowNodeType;
  status: WorkflowStepStatus;
  /** Order in which the run reached its steps (1-based). */
  seq: number;
  attempt: number;
  /** The resolved input (actions) the step ran with. */
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  /** The exit taken: a handle, or the id of the gateway edge. */
  outcome: string | null;
  /** English text of what went wrong. */
  error: string | null;
  /** For errors the engine raises itself (e.g. `INPUT_EMPTY`), so the UI can say it in the user's language. */
  error_code?: string | null;
  error_params?: Record<string, unknown> | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export const WORKFLOW_TASK_STATUSES = ['open', 'done', 'rejected', 'expired', 'cancelled'] as const;
export type WorkflowTaskStatus = (typeof WORKFLOW_TASK_STATUSES)[number];

/** `approval` = an action waiting for its go; `notice` = a note that blocks nothing. */
export type WorkflowTaskRecordKind = WorkflowTaskKind | 'approval' | 'notice';

export interface WorkflowTask {
  id: string;
  run_id: string;
  step_id: string;
  node_id: string;
  kind: WorkflowTaskRecordKind;
  title: string;
  description: string | null;
  /**
   * Kind-specific details. `upload`: { documentType }. `form`: { fields }.
   * `confirm`: { rejectCancelsRun } — true when the flow wires no "rejected" exit.
   * `approval`: { action, input, preview: Array<{ key?, label, value, valueKey? }> } — `label` and
   * `value` are English fallbacks; `key` (an input field or a preview row such as `attachments`)
   * and `valueKey` let the UI translate them.
   */
  payload: Record<string, unknown>;
  status: WorkflowTaskStatus;
  due_at: string | null;
  result: Record<string, unknown> | null;
  created_at: string;
  completed_at: string | null;
  /** For the task list: which flow and subject the task belongs to. */
  definition_id: string;
  definition_name: string;
  subject_type: WorkflowSubjectType;
  subject_id: string | null;
  subject_label: string | null;
  test_mode: boolean;
}

export interface WorkflowRunSummary {
  id: string;
  definition_id: string;
  definition_name: string;
  version: number;
  subject_type: WorkflowSubjectType;
  subject_id: string | null;
  subject_label: string | null;
  period_start: string | null;
  period_end: string | null;
  status: WorkflowRunStatus;
  test_mode: boolean;
  started_by: 'manual' | 'schedule' | 'event';
  /** Label of the node the run currently rests on, if any. */
  current_node_label: string | null;
  result: string | null;
  started_at: string;
  ended_at: string | null;
}

export interface WorkflowRun extends WorkflowRunSummary {
  /** The graph of the version the run executes. */
  graph: WorkflowGraph;
  steps: WorkflowStep[];
  tasks: WorkflowTask[];
}

export interface StartRunRequest {
  /** Required unless the flow's subject type is `none`. */
  subject_id?: string;
  /** Defaults to the current month. */
  period_start?: string;
  period_end?: string;
  /** Test run: mails go to the owner, invoices are not marked as sent. */
  test?: boolean;
}
