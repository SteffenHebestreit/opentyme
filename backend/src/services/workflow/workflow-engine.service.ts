/**
 * @fileoverview The workflow engine: starts runs and moves them from node to
 * node until they rest (on a task, a timer, an incident) or end.
 *
 * How a run stays correct across crashes, double clicks and long waits:
 *
 * - A step is a row. It is claimed (`pending` → `running`) before its node
 *   executes and settled afterwards; nothing is held in memory between steps,
 *   and no database transaction is open while an action talks to the outside.
 * - An action with an outside effect runs at most once per attempt. A step
 *   found `running` after a restart is not repeated: it fails as
 *   "interrupted" and the run waits for the user (retry / skip / cancel).
 * - Everything that resumes a run — a settled task, a fired timer, an event,
 *   a retry — only flips rows and then calls advance(); advance() runs one at
 *   a time per run in this process, and the claim uses SKIP LOCKED, so a
 *   second trigger never executes the same step twice.
 * - Events (an invoice sent, paid, corrected …) are rows a database trigger
 *   writes in the transaction that changed the invoice. processEvents()
 *   claims them: runs waiting for one continue, flows starting with one start.
 * - A parallel gateway sends the run down all its exits; where the branches
 *   meet again, a parallel gateway waits for every one of them. An end closes
 *   its branch — the run ends with its last one.
 *
 * @module services/workflow/workflow-engine
 */

import crypto from 'crypto';
import type {
  WorkflowEdge,
  WorkflowGraph,
  WorkflowHandle,
  WorkflowNode,
  WorkflowNodeType,
  WorkflowRun,
  WorkflowRunStatus,
  WorkflowRunSummary,
  WorkflowStep,
  WorkflowSubjectType,
  WorkflowTask,
  WorkflowTaskRecordKind,
  WorkflowFormField,
  WorkflowValue,
} from '../../types/workflow.types';
import type { CreateClientDocumentData } from '../../models/business/client-document.model';
import { getDbClient } from '../../utils/database';
import { logger } from '../../utils/logger';
import {
  WorkflowActionContext,
  WorkflowActionDefinition,
  WorkflowPreviewRow,
  getWorkflowAction,
} from './workflow-actions';
import { WorkflowApi, WorkflowApiIdentity, createWorkflowApi } from './workflow-api';
import {
  DbRow,
  WorkflowDefinitionService,
  WorkflowInputError,
  WorkflowVersionRecord,
  isUuid,
  workflowDefinitionService,
} from './workflow-definition.service';
import { getWorkflowEvent } from './workflow-events';
import { evaluateCondition, interpolate, resolveValue } from './workflow-expression';
import { findNode, nodeLabel, outgoing, startNode } from './workflow-graph';
import { getWorkflowSubject } from './workflow-subjects';

/** A run that loops without ever resting is stopped here instead of spinning forever. */
const MAX_STEPS_PER_RUN = 500;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** An event older than this starts nothing: a restore or an import is not something that just happened. */
const EVENT_START_MAX_AGE_MS = 24 * 3_600_000;
/** A flow that starts itself over and over through its own events is stopped here. */
const MAX_EVENT_STARTS_PER_HOUR = 60;
/** Input types that name a record. */
const ID_FIELD_TYPES: readonly string[] = ['client', 'project', 'invoice', 'document', 'documents', 'emailTemplate'];

export class WorkflowNotFoundError extends Error {}
/**
 * A failure the engine raises itself. The code and its parameters are stored
 * with the step, so the UI can say it in the user's language; the message is
 * the English fallback.
 */
export class WorkflowStepError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly params: Record<string, unknown> = {}
  ) {
    super(message);
  }
}
/** The object exists, but not in a state that allows the request (HTTP 409). */
export class WorkflowStateError extends Error {}
export class RunExistsError extends Error {
  constructor(public readonly runId: string) {
    super('This flow already has a run for this subject and period.');
  }
}

export interface StartRunParams {
  userId: string;
  definitionId: string;
  subjectId?: string | null;
  periodStart?: string;
  periodEnd?: string;
  test?: boolean;
  startedBy?: 'manual' | 'schedule' | 'event';
  /** Replaces the "one run per subject and period" key (event starts: one run per event). */
  businessKey?: string;
  /** The event that started the run, as run data (`event.type`, `event.reason` …). */
  event?: Record<string, unknown>;
}

export type TaskDecision = 'complete' | 'reject' | 'approve' | 'skip' | 'dismiss';

export interface TaskSettlement {
  comment?: string;
  values?: Record<string, unknown>;
  title?: string;
  file?: { buffer: Buffer; originalname: string; mimetype: string; size: number };
}

export interface WorkflowEngineDeps {
  /** The flow owner's contact data (Keycloak). */
  resolveOwner: (userId: string) => Promise<{ email: string; name: string } | null>;
  mailOwner: (email: string, subject: string, text: string) => Promise<void>;
  createApi: (identity: WorkflowApiIdentity) => WorkflowApi;
  /** Files an uploaded document with a client; returns its id and stored file name. */
  storeDocument: (
    clientId: string,
    userId: string,
    data: Record<string, unknown>,
    file: NonNullable<TaskSettlement['file']>
  ) => Promise<{ id: string; file_filename: string | null }>;
}

const defaultDeps: WorkflowEngineDeps = {
  // Imported on use: these pull in Keycloak, the mailer and object storage,
  // which the engine's tests and the auth middleware must not load.
  resolveOwner: async (userId) => {
    const { apiTokenService } = await import('../auth/api-token.service');
    const owner = await apiTokenService.resolveOwner(userId);
    if (!owner) return null;
    return { email: owner.email, name: [owner.firstName, owner.lastName].filter(Boolean).join(' ') || owner.username };
  },
  mailOwner: async (email, subject, text) => {
    const { emailService } = await import('../external/email.service');
    await emailService.sendNotificationEmail(email, subject, text);
  },
  createApi: createWorkflowApi,
  storeDocument: async (clientId, userId, data, file) => {
    const { ClientDocumentService } = await import('../business/client-document.service');
    return new ClientDocumentService().createDocument(
      clientId,
      userId,
      data as unknown as CreateClientDocumentData,
      file as unknown as Express.Multer.File
    );
  },
};

interface RunRow {
  id: string;
  user_id: string;
  definition_id: string;
  version_id: string;
  subject_type: WorkflowSubjectType;
  subject_id: string | null;
  status: WorkflowRunStatus;
  test_mode: boolean;
  context: DbRow;
}

interface StepRow {
  id: string;
  run_id: string;
  node_id: string;
  node_type: WorkflowNodeType;
  status: string;
  seq: number;
  input: Record<string, unknown> | null;
  outcome: string | null;
}

const ymd = (date: Date): string => date.toISOString().slice(0, 10);
const iso = (value: unknown): string | null => (value instanceof Date ? value.toISOString() : value ? String(value) : null);
const dateOnly = (value: unknown): string | null => (value instanceof Date ? ymd(value) : value ? String(value).slice(0, 10) : null);
const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error)).slice(0, 2000);

function monthOf(date: Date): { start: string; end: string } {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  return { start: ymd(new Date(Date.UTC(year, month, 1))), end: ymd(new Date(Date.UTC(year, month + 1, 0))) };
}

function isEmptyValue(value: unknown): boolean {
  return value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
}

function defaultPreview(action: WorkflowActionDefinition, input: Record<string, unknown>): WorkflowPreviewRow[] {
  return action.input
    .filter((field) => !isEmptyValue(input[field.key]))
    .map((field) => {
      const value = input[field.key];
      return { key: field.key, label: field.label, value: Array.isArray(value) ? value.join(', ') : String(value) };
    });
}

function toStep(row: DbRow): WorkflowStep {
  return {
    id: row.id,
    node_id: row.node_id,
    node_type: row.node_type,
    status: row.status,
    seq: row.seq,
    attempt: row.attempt,
    input: row.input,
    output: row.output,
    // "approved" only marks an action that is about to run — not an exit.
    outcome: row.outcome === 'approved' ? null : row.outcome,
    error: row.error,
    error_code: row.error_code ?? null,
    error_params: row.error_params ?? null,
    created_at: iso(row.created_at) as string,
    started_at: iso(row.started_at),
    finished_at: iso(row.finished_at),
  };
}

function toTask(row: DbRow): WorkflowTask {
  return {
    id: row.id,
    run_id: row.run_id,
    step_id: row.step_id,
    node_id: row.node_id,
    kind: row.kind,
    title: row.title,
    description: row.description,
    payload: row.payload ?? {},
    status: row.status,
    due_at: iso(row.due_at),
    result: row.result,
    created_at: iso(row.created_at) as string,
    completed_at: iso(row.completed_at),
    definition_id: row.definition_id,
    definition_name: row.definition_name,
    subject_type: row.subject_type,
    subject_id: row.subject_id,
    subject_label: row.subject_label,
    test_mode: row.test_mode,
  };
}

const SELECT_TASK = `
  SELECT t.*, r.definition_id, d.name AS definition_name, r.subject_type, r.subject_id, r.subject_label, r.test_mode
  FROM workflow_tasks t
  JOIN workflow_runs r ON r.id = t.run_id
  JOIN workflow_definitions d ON d.id = r.definition_id`;

const SELECT_RUN = `
  SELECT r.id, r.definition_id, d.name AS definition_name, v.version, v.graph, r.subject_type, r.subject_id,
         r.subject_label, r.period_start, r.period_end, r.status, r.test_mode, r.started_by, r.result,
         r.started_at, r.ended_at,
         (SELECT s.node_id FROM workflow_steps s
           WHERE s.run_id = r.id AND s.status IN ('pending', 'running', 'waiting', 'failed')
           ORDER BY s.seq DESC LIMIT 1) AS current_node_id
  FROM workflow_runs r
  JOIN workflow_definitions d ON d.id = r.definition_id
  JOIN workflow_versions v ON v.id = r.version_id`;

function toRunSummary(row: DbRow): WorkflowRunSummary {
  const current = row.current_node_id ? findNode(row.graph as WorkflowGraph, row.current_node_id) : undefined;
  return {
    id: row.id,
    definition_id: row.definition_id,
    definition_name: row.definition_name,
    version: row.version,
    subject_type: row.subject_type,
    subject_id: row.subject_id,
    subject_label: row.subject_label,
    period_start: dateOnly(row.period_start),
    period_end: dateOnly(row.period_end),
    status: row.status,
    test_mode: row.test_mode,
    started_by: row.started_by,
    current_node_label: current ? nodeLabel(current) : null,
    result: row.result,
    started_at: iso(row.started_at) as string,
    ended_at: iso(row.ended_at),
  };
}

export class WorkflowEngine {
  private readonly deps: WorkflowEngineDeps;
  /** Runs this process is advancing right now, and those triggered again meanwhile. */
  private readonly advancing = new Set<string>();
  private readonly again = new Set<string>();

  constructor(
    deps: Partial<WorkflowEngineDeps> = {},
    private readonly definitions: WorkflowDefinitionService = workflowDefinitionService
  ) {
    this.deps = { ...defaultDeps, ...deps };
  }

  // ── Starting ───────────────────────────────────────────────────────────────

  /** Starts a run of the flow's published version and advances it to its first rest. */
  async startRun(params: StartRunParams): Promise<string> {
    const db = getDbClient();
    const { userId, definitionId } = params;
    if (!isUuid(definitionId)) throw new WorkflowNotFoundError('Flow not found.');
    const found = await db.query(
      `SELECT id, subject_type, status FROM workflow_definitions WHERE id = $1 AND user_id = $2`,
      [definitionId, userId]
    );
    if (found.rows.length === 0) throw new WorkflowNotFoundError('Flow not found.');
    const definition = found.rows[0] as { subject_type: WorkflowSubjectType; status: string };
    if (definition.status === 'archived') throw new WorkflowStateError('This flow is archived.');
    const version = await this.definitions.publishedVersion(definitionId);
    if (!version) throw new WorkflowStateError('Publish the flow before starting it.');
    const start = startNode(version.graph);
    if (!start) throw new WorkflowStateError('The published flow has no start.');

    const period = this.resolvePeriod(params.periodStart, params.periodEnd);
    const subject = await this.loadSubject(userId, definition.subject_type, params.subjectId ?? null);
    const owner = await this.deps.resolveOwner(userId);
    const test = params.test === true;
    const runId = crypto.randomUUID();
    const context = {
      ...subject.blocks,
      subject: { id: subject.id, type: definition.subject_type, label: subject.label },
      period: { ...period, label: period.start.slice(0, 7) },
      owner: { email: owner?.email ?? '', name: owner?.name ?? '' },
      run: { id: runId, test },
      ...(params.event ? { event: params.event } : {}),
      steps: {},
    };
    // Test runs carry no key: they may repeat, and must not block the real run.
    const businessKey = test
      ? null
      : (params.businessKey ?? `${definition.subject_type}:${subject.id ?? '-'}:${period.start}:${period.end}`);

    try {
      await db.query(
        `INSERT INTO workflow_runs
           (id, user_id, definition_id, version_id, subject_type, subject_id, subject_label,
            period_start, period_end, test_mode, started_by, context, business_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13)`,
        [
          runId, userId, definitionId, version.id, definition.subject_type, subject.id, subject.label,
          period.start, period.end, test, params.startedBy ?? 'manual', JSON.stringify(context), businessKey,
        ]
      );
    } catch (error) {
      if ((error as { code?: string } | null)?.code === '23505') {
        const existing = await db.query(
          `SELECT id FROM workflow_runs WHERE definition_id = $1 AND business_key = $2 AND status <> 'cancelled' LIMIT 1`,
          [definitionId, businessKey]
        );
        throw new RunExistsError(existing.rows[0]?.id ?? '');
      }
      throw error;
    }
    await db.query(`INSERT INTO workflow_steps (run_id, node_id, node_type, seq) VALUES ($1, $2, 'start', 1)`, [runId, start.id]);
    logger.info(`[Workflow] Run ${runId} of flow ${definitionId} started (${params.startedBy ?? 'manual'}${test ? ', test' : ''})`);
    await this.advance(runId);
    return runId;
  }

  private resolvePeriod(start?: string, end?: string): { start: string; end: string } {
    if (!start && !end) return monthOf(new Date());
    if (!start || !end || !DATE.test(start) || !DATE.test(end)) {
      throw new WorkflowInputError('Give the period as two dates (YYYY-MM-DD).');
    }
    if (start > end) throw new WorkflowInputError('The period ends before it starts.');
    return { start, end };
  }

  /** The run's subject as run data. Scoped to the owner, so a foreign id is "not found". */
  private async loadSubject(
    userId: string,
    type: WorkflowSubjectType,
    subjectId: string | null
  ): Promise<{ id: string | null; label: string | null; blocks: Record<string, unknown> }> {
    if (type === 'none') return { id: null, label: null, blocks: {} };
    const subject = getWorkflowSubject(type);
    if (!subject) throw new WorkflowStateError(`Flows cannot be about "${type}" at the moment (is its addon enabled?).`);
    if (!isUuid(subjectId)) throw new WorkflowInputError(`Choose the ${subject.title.toLowerCase()} the flow runs for.`);
    const loaded = await subject.load(userId, subjectId);
    if (!loaded) throw new WorkflowNotFoundError(`${subject.title} not found.`);
    return { id: loaded.id, label: loaded.label, blocks: loaded.blocks };
  }

  // ── Advancing ──────────────────────────────────────────────────────────────

  /** Executes the run's pending steps until it rests or ends. Safe to call at any time. */
  async advance(runId: string): Promise<void> {
    if (this.advancing.has(runId)) {
      this.again.add(runId);
      return;
    }
    this.advancing.add(runId);
    try {
      do {
        this.again.delete(runId);
        await this.drain(runId);
      } while (this.again.has(runId));
    } finally {
      this.advancing.delete(runId);
    }
  }

  private async drain(runId: string): Promise<void> {
    const db = getDbClient();
    let version: WorkflowVersionRecord | null = null;
    for (;;) {
      const claimed = await db.query(
        `UPDATE workflow_steps SET status = 'running', started_at = CURRENT_TIMESTAMP
         WHERE id = (SELECT id FROM workflow_steps WHERE run_id = $1 AND status = 'pending'
                     ORDER BY seq LIMIT 1 FOR UPDATE SKIP LOCKED)
         RETURNING id, run_id, node_id, node_type, status, seq, input, outcome`,
        [runId]
      );
      const step = claimed.rows[0] as StepRow | undefined;
      if (!step) break;
      const run = await this.loadRun(runId);
      if (!run || run.status === 'cancelled' || run.status === 'completed') {
        await db.query(`UPDATE workflow_steps SET status = 'cancelled', finished_at = CURRENT_TIMESTAMP WHERE id = $1`, [step.id]);
        continue;
      }
      try {
        version = version ?? (await this.definitions.version(run.version_id));
        const node = version ? findNode(version.graph, step.node_id) : undefined;
        if (!version || !node) throw new WorkflowStepError('STEP_MISSING', 'This step no longer exists in the flow.');
        await this.execute(run, version, node, step);
      } catch (error) {
        await this.failStep(step, error);
      }
    }
    await this.settleRunStatus(runId);
  }

  private async loadRun(runId: string): Promise<RunRow | null> {
    const result = await getDbClient().query(
      `SELECT id, user_id, definition_id, version_id, subject_type, subject_id, status, test_mode, context
       FROM workflow_runs WHERE id = $1`,
      [runId]
    );
    return result.rows[0] ?? null;
  }

  /** The data a node's configuration is resolved against. */
  private dataOf(run: RunRow): Record<string, unknown> {
    return { ...run.context, today: ymd(new Date()) };
  }

  private async execute(run: RunRow, version: WorkflowVersionRecord, node: WorkflowNode, step: StepRow): Promise<void> {
    const graph = version.graph;
    const db = getDbClient();
    switch (node.type) {
      case 'start':
        await this.completeStep(run, graph, node, step, {}, 'out');
        return;
      case 'action':
        await this.runAction(run, version, node, step);
        return;
      case 'task':
        await this.openTask(run, graph, node, step);
        return;
      case 'wait': {
        if (node.data.mode === 'event') {
          await this.waitForEvent(run, graph, node, step);
          return;
        }
        const hours = (Number(node.data.days) || 0) * 24 + (Number(node.data.hours) || 0);
        const pending = await db.query(`SELECT 1 FROM workflow_timers WHERE step_id = $1 AND fired_at IS NULL`, [step.id]);
        if (pending.rows.length === 0) {
          await db.query(
            `INSERT INTO workflow_timers (kind, run_id, step_id, due_at) VALUES ('wait', $1, $2, $3)`,
            [run.id, step.id, new Date(Date.now() + hours * 3_600_000)]
          );
        }
        await db.query(`UPDATE workflow_steps SET status = 'waiting' WHERE id = $1`, [step.id]);
        return;
      }
      case 'gateway': {
        if (node.data.mode === 'parallel') {
          // Every exit is taken (completeStep follows them all); a join got here only once all branches arrived.
          await this.completeStep(run, graph, node, step, {}, 'all');
          return;
        }
        const data = this.dataOf(run);
        const exits = outgoing(graph, node.id, 'out');
        const chosen =
          exits.find((edge) => edge.condition && evaluateCondition(edge.condition, data)) ??
          exits.find((edge) => !edge.condition);
        if (!chosen) {
          throw new WorkflowStepError(
            'NO_BRANCH',
            `None of the conditions of "${nodeLabel(node)}" applies, and it has no exit without a condition.`
          );
        }
        await this.completeStep(run, graph, node, step, {}, chosen.id);
        return;
      }
      case 'end': {
        const result = node.data.result ? interpolate(node.data.result, this.dataOf(run)).slice(0, 2000) : null;
        await db.query(
          `UPDATE workflow_steps SET status = 'completed', outcome = 'end', finished_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [step.id]
        );
        // With parallel branches an end closes its branch; the run ends with the last one.
        const open = await db.query(
          `SELECT 1 FROM workflow_steps
           WHERE run_id = $1 AND id <> $2 AND status IN ('pending', 'running', 'waiting', 'failed') LIMIT 1`,
          [run.id, step.id]
        );
        if (open.rows.length === 0) await this.finishRun(run.id, 'completed', result);
        else if (result) await db.query(`UPDATE workflow_runs SET result = $2 WHERE id = $1`, [run.id, result]);
        return;
      }
    }
  }

  private resolveInput(
    config: Record<string, WorkflowValue>,
    action: WorkflowActionDefinition,
    data: Record<string, unknown>
  ): Record<string, unknown> {
    const input: Record<string, unknown> = {};
    for (const field of action.input) {
      const value = resolveValue(config?.[field.key], data);
      const about = { action: action.key, field: field.key, label: field.label };
      if (field.required && isEmptyValue(value)) {
        throw new WorkflowStepError('INPUT_EMPTY', `"${field.label}" is empty for this run.`, about);
      }
      // These end up in API paths. A value from a form or an earlier step must be an id, nothing else.
      if (ID_FIELD_TYPES.includes(field.type) && !isEmptyValue(value)) {
        const ids = Array.isArray(value) ? value : [value];
        if (!ids.every((id) => isUuid(id))) {
          throw new WorkflowStepError('INPUT_NOT_ID', `"${field.label}" is not a valid id for this run.`, about);
        }
      }
      input[field.key] = value;
    }
    return input;
  }

  private actionContext(run: RunRow, version: WorkflowVersionRecord, node: WorkflowNode, step: StepRow): WorkflowActionContext {
    const data = this.dataOf(run);
    return {
      userId: run.user_id,
      runId: run.id,
      testMode: run.test_mode,
      data,
      api: this.deps.createApi({ userId: run.user_id, runId: run.id, permissions: version.permissions }),
      notify: async (title, description) => {
        await this.insertTask(run, step, node.id, 'notice', title, description ?? null, {}, null);
      },
      mailOwner: async (subject, text) => {
        const email = run.context?.owner?.email;
        if (!email) throw new Error('Your account has no email address to send the note to.');
        await this.deps.mailOwner(email, subject, text);
      },
    };
  }

  private async runAction(run: RunRow, version: WorkflowVersionRecord, node: WorkflowNode, step: StepRow): Promise<void> {
    if (node.type !== 'action') return;
    const db = getDbClient();
    const action = getWorkflowAction(node.data.action);
    if (!action) throw new Error(`The action "${node.data.action}" is not available.`);
    const approved = step.outcome === 'approved';
    // What was approved is what runs: the input is resolved once and kept on the step.
    const input = approved && step.input ? step.input : this.resolveInput(node.data.input, action, this.dataOf(run));
    const ctx = this.actionContext(run, version, node, step);

    if (node.data.mode === 'approval' && !approved) {
      const preview = action.preview ? await action.preview(input, ctx) : defaultPreview(action, input);
      await db.query(`UPDATE workflow_steps SET status = 'waiting', input = $2::jsonb WHERE id = $1`, [step.id, JSON.stringify(input)]);
      await this.insertTask(
        run, step, node.id, 'approval',
        `${run.test_mode ? '[Test] ' : ''}${nodeLabel(node)}`,
        null,
        { action: action.key, input, preview },
        null
      );
      return;
    }

    await db.query(`UPDATE workflow_steps SET input = $2::jsonb WHERE id = $1`, [step.id, JSON.stringify(input)]);
    const output = (await action.execute(input, ctx)) ?? {};
    await this.completeStep(run, version.graph, node, step, output, 'out');
  }

  private async openTask(run: RunRow, graph: WorkflowGraph, node: WorkflowNode, step: StepRow): Promise<void> {
    if (node.type !== 'task') return;
    const db = getDbClient();
    const open = await db.query(`SELECT 1 FROM workflow_tasks WHERE step_id = $1 AND status = 'open' AND kind <> 'notice'`, [step.id]);
    if (open.rows.length === 0) {
      const data = this.dataOf(run);
      const days = Number(node.data.dueInDays);
      const dueAt = days > 0 ? new Date(Date.now() + days * 86_400_000) : null;
      const payload: Record<string, unknown> =
        node.data.kind === 'upload'
          ? { documentType: node.data.documentType }
          : node.data.kind === 'form'
            ? { fields: node.data.fields ?? [] }
            : // Rejecting leads somewhere only if that exit is wired; otherwise it cancels the run.
              { rejectCancelsRun: outgoing(graph, node.id, 'rejected').length === 0 };
      await this.insertTask(
        run, step, node.id, node.data.kind,
        `${run.test_mode ? '[Test] ' : ''}${interpolate(node.data.title, data)}`,
        node.data.description ? interpolate(node.data.description, data) : null,
        payload,
        dueAt
      );
      if (dueAt && outgoing(graph, node.id, 'timeout').length > 0) {
        await db.query(
          `INSERT INTO workflow_timers (kind, run_id, step_id, due_at) VALUES ('task_timeout', $1, $2, $3)`,
          [run.id, step.id, dueAt]
        );
      }
    }
    await db.query(`UPDATE workflow_steps SET status = 'waiting' WHERE id = $1`, [step.id]);
  }

  private async insertTask(
    run: RunRow,
    step: StepRow,
    nodeId: string,
    kind: WorkflowTaskRecordKind,
    title: string,
    description: string | null,
    payload: Record<string, unknown>,
    dueAt: Date | null
  ): Promise<void> {
    await getDbClient().query(
      `INSERT INTO workflow_tasks (user_id, run_id, step_id, node_id, kind, title, description, payload, due_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)`,
      [run.user_id, run.id, step.id, nodeId, kind, title.slice(0, 500), description, JSON.stringify(payload), dueAt]
    );
  }

  /** Settles a step, records its output in the run's data and queues the node its exit leads to. */
  private async completeStep(
    run: RunRow,
    graph: WorkflowGraph,
    node: WorkflowNode,
    step: StepRow,
    output: Record<string, unknown>,
    outcome: string,
    status: 'completed' | 'skipped' = 'completed'
  ): Promise<void> {
    const db = getDbClient();
    await db.query(
      `UPDATE workflow_steps
       SET status = $2, output = $3::jsonb, outcome = $4, error = NULL, error_code = NULL, error_params = NULL,
           finished_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [step.id, status, JSON.stringify(output), outcome]
    );
    const recorded = { ...output, outcome: status === 'skipped' ? 'skipped' : outcome };
    await db.query(
      `UPDATE workflow_runs SET context = jsonb_set(context, $2::text[], $3::jsonb, true), updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [run.id, ['steps', node.id], JSON.stringify(recorded)]
    );
    run.context = { ...run.context, steps: { ...(run.context.steps ?? {}), [node.id]: recorded } };

    const exits =
      node.type !== 'gateway'
        ? outgoing(graph, node.id, outcome as WorkflowHandle).slice(0, 1)
        : node.data.mode === 'parallel'
          ? outgoing(graph, node.id, 'out')
          : graph.edges.filter((candidate) => candidate.id === outcome);
    if (exits.length === 0) {
      // Only an unwired "rejected" exit gets here (validation wires every "out").
      await this.finishRun(run.id, 'cancelled', outcome === 'rejected' ? 'Rejected' : `Ended at "${nodeLabel(node)}"`);
      return;
    }
    for (const edge of exits) await this.enqueue(run, graph, edge);
  }

  /** Queues the node an edge leads to. A parallel gateway with several entries is a join: it waits for all of them. */
  private async enqueue(run: RunRow, graph: WorkflowGraph, edge: WorkflowEdge): Promise<void> {
    const db = getDbClient();
    const target = findNode(graph, edge.target);
    if (!target) return;
    const seq = await db.query(`SELECT COALESCE(max(seq), 0) + 1 AS next FROM workflow_steps WHERE run_id = $1`, [run.id]);
    const next: number = seq.rows[0].next;
    if (next > MAX_STEPS_PER_RUN) {
      await db.query(
        `INSERT INTO workflow_steps (run_id, node_id, node_type, seq, status, error, error_code, error_params, finished_at)
         VALUES ($1, $2, $3, $4, 'failed', $5, 'TOO_MANY_STEPS', $6::jsonb, CURRENT_TIMESTAMP)`,
        [
          run.id, target.id, target.type, next,
          `The run has taken ${MAX_STEPS_PER_RUN} steps — the flow probably runs in a circle.`,
          JSON.stringify({ max: MAX_STEPS_PER_RUN }),
        ]
      );
      return;
    }
    const entries = graph.edges.filter((candidate) => candidate.target === target.id);
    if (target.type === 'gateway' && target.data.mode === 'parallel' && entries.length > 1) {
      // The join's step collects the branches that arrived; it becomes runnable with the last one.
      const waiting = await db.query(
        `SELECT id, input FROM workflow_steps WHERE run_id = $1 AND node_id = $2 AND status = 'waiting' ORDER BY seq DESC LIMIT 1`,
        [run.id, target.id]
      );
      const arrived = new Set<string>([...((waiting.rows[0]?.input?.arrived as string[] | undefined) ?? []), edge.id]);
      const status = entries.every((entry) => arrived.has(entry.id)) ? 'pending' : 'waiting';
      const input = JSON.stringify({ arrived: Array.from(arrived) });
      if (waiting.rows.length > 0) {
        await db.query(`UPDATE workflow_steps SET status = $2, input = $3::jsonb WHERE id = $1`, [waiting.rows[0].id, status, input]);
      } else {
        await db.query(
          `INSERT INTO workflow_steps (run_id, node_id, node_type, seq, status, input) VALUES ($1, $2, 'gateway', $3, $4, $5::jsonb)`,
          [run.id, target.id, next, status, input]
        );
      }
      return;
    }
    await db.query(`INSERT INTO workflow_steps (run_id, node_id, node_type, seq) VALUES ($1, $2, $3, $4)`, [run.id, target.id, target.type, next]);
  }

  /** Parks a run until an event happens to a record — unless it already has. */
  private async waitForEvent(run: RunRow, graph: WorkflowGraph, node: WorkflowNode, step: StepRow): Promise<void> {
    if (node.type !== 'wait') return;
    const db = getDbClient();
    const type = String(node.data.event ?? '');
    const event = getWorkflowEvent(type);
    const subject = getWorkflowSubject(event?.subject_type);
    if (!event || !subject) {
      throw new WorkflowStepError('WAIT_UNKNOWN_EVENT', `The event "${type}" is not available at the moment (is its addon enabled?).`, {
        event: type,
      });
    }
    // Without its own setting the wait is about the run's subject (validation made sure the event fits it).
    const subjectId = resolveValue(node.data.subject ?? { $ref: 'subject.id' }, this.dataOf(run));
    if (!isUuid(subjectId) || !(await subject.load(run.user_id, subjectId))) {
      throw new WorkflowStepError('WAIT_NO_SUBJECT', `There is no ${subject.title.toLowerCase()} in this run to wait for.`, {
        subject: subject.key,
      });
    }

    // Registered first, checked second: an event arriving in between finds the wait and is not lost.
    const registered = await db.query(`SELECT 1 FROM workflow_waits WHERE step_id = $1`, [step.id]);
    if (registered.rows.length === 0) {
      await db.query(
        `INSERT INTO workflow_waits (user_id, run_id, step_id, event_type, subject_id) VALUES ($1, $2, $3, $4, $5)`,
        [run.user_id, run.id, step.id, type, subjectId]
      );
      const days = Number(node.data.timeoutDays);
      if (days > 0 && outgoing(graph, node.id, 'timeout').length > 0) {
        await db.query(
          `INSERT INTO workflow_timers (kind, run_id, step_id, due_at) VALUES ('wait_timeout', $1, $2, $3)`,
          [run.id, step.id, new Date(Date.now() + days * 86_400_000)]
        );
      }
    }
    // Only from "running": if the event got here first, the step is already settled.
    await db.query(`UPDATE workflow_steps SET status = 'waiting' WHERE id = $1 AND status = 'running'`, [step.id]);

    // A state the record has reached already (paid, cancelled) is not announced a second time.
    const reached = event.reached ? await event.reached(run.user_id, subjectId) : false;
    if (reached) {
      // Whoever deletes the wait settles the step — the event handler or this.
      const claimed = await db.query(`DELETE FROM workflow_waits WHERE step_id = $1 RETURNING id`, [step.id]);
      if ((claimed.rowCount ?? 0) > 0) {
        await db.query(`DELETE FROM workflow_timers WHERE step_id = $1 AND fired_at IS NULL`, [step.id]);
        const carried = reached === true ? {} : reached;
        await this.completeStep(run, graph, node, step, { event: type, ...carried, alreadyHappened: true }, 'out');
      }
    }
  }

  private async failStep(step: Pick<StepRow, 'id' | 'run_id' | 'node_id'>, error: unknown): Promise<void> {
    const message = errorText(error);
    const own = error instanceof WorkflowStepError ? error : null;
    logger.warn(`[Workflow] Run ${step.run_id}: step ${step.node_id} failed: ${message}`);
    await getDbClient().query(
      `UPDATE workflow_steps
       SET status = 'failed', error = $2, error_code = $3, error_params = $4::jsonb, finished_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [step.id, message, own?.code ?? null, own ? JSON.stringify(own.params) : null]
    );
  }

  private async settleRunStatus(runId: string): Promise<void> {
    await getDbClient().query(
      `UPDATE workflow_runs r
       SET status = CASE
             WHEN EXISTS (SELECT 1 FROM workflow_steps s WHERE s.run_id = r.id AND s.status = 'failed') THEN 'incident'
             WHEN EXISTS (SELECT 1 FROM workflow_steps s WHERE s.run_id = r.id AND s.status = 'waiting') THEN 'waiting'
             ELSE 'running'
           END,
           updated_at = CURRENT_TIMESTAMP
       WHERE r.id = $1 AND r.status IN ('running', 'waiting', 'incident')`,
      [runId]
    );
  }

  /** Ends a run: whatever still waited is closed, pending timers are dropped. */
  private async finishRun(runId: string, status: 'completed' | 'cancelled', result: string | null): Promise<void> {
    const db = getDbClient();
    await db.query(
      `UPDATE workflow_runs
       SET status = $2, result = COALESCE($3, result), ended_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status NOT IN ('completed', 'cancelled')`,
      [runId, status, result]
    );
    await db.query(
      `UPDATE workflow_steps SET status = 'cancelled', finished_at = CURRENT_TIMESTAMP
       WHERE run_id = $1 AND status IN ('pending', 'waiting')`,
      [runId]
    );
    // Notices stay: they are messages to the owner, not part of the run's progress.
    await db.query(
      `UPDATE workflow_tasks SET status = 'cancelled', completed_at = CURRENT_TIMESTAMP
       WHERE run_id = $1 AND status = 'open' AND kind <> 'notice'`,
      [runId]
    );
    await db.query(`DELETE FROM workflow_timers WHERE run_id = $1 AND fired_at IS NULL`, [runId]);
    await db.query(`DELETE FROM workflow_waits WHERE run_id = $1`, [runId]);
    logger.info(`[Workflow] Run ${runId} ${status}`);
  }

  // ── Tasks ──────────────────────────────────────────────────────────────────

  /** Settles a task for its owner and moves the run on. */
  async settleTask(taskId: string, userId: string, decision: TaskDecision, settlement: TaskSettlement = {}): Promise<WorkflowTask> {
    const db = getDbClient();
    const task = await this.findTask(taskId, userId);
    if (!task) throw new WorkflowNotFoundError('Task not found.');
    const allowed: Record<WorkflowTaskRecordKind, TaskDecision[]> = {
      confirm: ['complete', 'reject'],
      upload: ['complete'],
      form: ['complete'],
      approval: ['approve', 'skip'],
      notice: ['dismiss'],
    };
    if (!allowed[task.kind].includes(decision)) throw new WorkflowInputError('This task cannot be settled that way.');
    if (task.kind === 'upload' && !settlement.file) throw new WorkflowInputError('Choose the file to upload.');
    const values = task.kind === 'form' ? this.checkFormValues(task, settlement.values) : {};
    const comment = settlement.comment?.trim().slice(0, 2000) || undefined;

    // Claimed first, so a double click or a second tab settles nothing twice.
    const status = decision === 'reject' ? 'rejected' : 'done';
    const claimed = await db.query(
      `UPDATE workflow_tasks SET status = $2, completed_at = CURRENT_TIMESTAMP WHERE id = $1 AND status = 'open' RETURNING id`,
      [taskId, status]
    );
    if (claimed.rowCount === 0) throw new WorkflowStateError('This task has already been settled.');
    const reopen = () =>
      db.query(`UPDATE workflow_tasks SET status = 'open', completed_at = NULL, result = NULL WHERE id = $1`, [taskId]);

    if (task.kind === 'notice') return (await this.findTask(taskId, userId)) as WorkflowTask;

    let run: RunRow | null;
    let output: Record<string, unknown> = {};
    try {
      run = await this.loadRun(task.run_id);
      const stepResult = await db.query(
        `SELECT id, run_id, node_id, node_type, status, seq, input, outcome FROM workflow_steps WHERE id = $1`,
        [task.step_id]
      );
      const step = stepResult.rows[0] as StepRow | undefined;
      const version = run ? await this.definitions.version(run.version_id) : null;
      const node = version && step ? findNode(version.graph, step.node_id) : undefined;
      if (!run || !step || !version || !node || step.status !== 'waiting') {
        throw new WorkflowStateError('The run is no longer waiting for this task.');
      }

      if (task.kind === 'upload') output = await this.storeUpload(run, task, settlement);
      else if (task.kind === 'form') output = values;
      else if (comment) output = { comment };

      await db.query(`UPDATE workflow_tasks SET result = $2::jsonb WHERE id = $1`, [taskId, JSON.stringify({ ...output, decision })]);
      await db.query(`DELETE FROM workflow_timers WHERE step_id = $1 AND fired_at IS NULL`, [step.id]);

      if (decision === 'approve') {
        // Back to the queue, marked: advance() now runs the action with the input that was shown.
        await db.query(`UPDATE workflow_steps SET status = 'pending', outcome = 'approved' WHERE id = $1`, [step.id]);
      } else if (decision === 'skip') {
        await this.completeStep(run, version.graph, node, step, {}, 'out', 'skipped');
      } else {
        await this.completeStep(run, version.graph, node, step, output, decision === 'reject' ? 'rejected' : 'out');
      }
    } catch (error) {
      await reopen();
      throw error;
    }
    await this.advance(task.run_id);
    return (await this.findTask(taskId, userId)) as WorkflowTask;
  }

  private checkFormValues(task: WorkflowTask, given: Record<string, unknown> | undefined): Record<string, unknown> {
    const fields = (task.payload.fields as WorkflowFormField[] | undefined) ?? [];
    const values: Record<string, unknown> = {};
    for (const field of fields) {
      const raw = given?.[field.key];
      const empty = raw === undefined || raw === null || raw === '';
      if (empty) {
        if (field.required) throw new WorkflowInputError(`"${field.label}" is required.`);
        values[field.key] = null;
        continue;
      }
      if (field.type === 'number') {
        const number = Number(raw);
        if (!Number.isFinite(number)) throw new WorkflowInputError(`"${field.label}" must be a number.`);
        values[field.key] = number;
      } else if (field.type === 'boolean') {
        values[field.key] = raw === true || raw === 'true';
      } else if (field.type === 'date') {
        if (typeof raw !== 'string' || !DATE.test(raw)) throw new WorkflowInputError(`"${field.label}" must be a date (YYYY-MM-DD).`);
        values[field.key] = raw;
      } else {
        values[field.key] = String(raw).slice(0, 5000);
      }
    }
    return values;
  }

  private async storeUpload(run: RunRow, task: WorkflowTask, settlement: TaskSettlement): Promise<Record<string, unknown>> {
    const file = settlement.file as NonNullable<TaskSettlement['file']>;
    const clientId = run.context?.client?.id;
    if (!clientId) throw new WorkflowStateError('This run has no client to file the document with.');
    const documentType = String(task.payload.documentType ?? 'other');
    const fallback = file.originalname.replace(/\.[^.]+$/, '') || 'Document';
    const document = await this.deps.storeDocument(
      clientId,
      run.user_id,
      {
        title: `${run.test_mode ? '[Test] ' : ''}${settlement.title?.trim() || fallback}`.slice(0, 255),
        document_type: documentType,
        project_id: run.context?.project?.id ?? null,
        period_start: run.context?.period?.start ?? null,
        period_end: run.context?.period?.end ?? null,
        ...(documentType === 'timesheet_signed' ? { signed_at: ymd(new Date()) } : {}),
      },
      file
    );
    return { documentId: document.id, filename: document.file_filename ?? file.originalname };
  }

  private async findTask(taskId: string, userId: string): Promise<WorkflowTask | null> {
    if (!isUuid(taskId)) return null;
    const result = await getDbClient().query(`${SELECT_TASK} WHERE t.id = $1 AND t.user_id = $2`, [taskId, userId]);
    return result.rows.length > 0 ? toTask(result.rows[0]) : null;
  }

  // ── Incidents and cancelling ───────────────────────────────────────────────

  private async ownedRunAndStep(runId: string, stepId: string, userId: string): Promise<{ run: RunRow; step: StepRow }> {
    const run = isUuid(runId) ? await this.loadRun(runId) : null;
    if (!run || run.user_id !== userId) throw new WorkflowNotFoundError('Run not found.');
    const result = isUuid(stepId)
      ? await getDbClient().query(
          `SELECT id, run_id, node_id, node_type, status, seq, input, outcome FROM workflow_steps WHERE id = $1 AND run_id = $2`,
          [stepId, runId]
        )
      : { rows: [] };
    const step = result.rows[0] as StepRow | undefined;
    if (!step) throw new WorkflowNotFoundError('Step not found.');
    if (step.status !== 'failed') throw new WorkflowStateError('Only a failed step can be retried or skipped.');
    return { run, step };
  }

  /** Runs a failed step again — with freshly resolved input, and a fresh approval if it needs one. */
  async retryStep(runId: string, stepId: string, userId: string): Promise<void> {
    const { run, step } = await this.ownedRunAndStep(runId, stepId, userId);
    const db = getDbClient();
    // The subject may be what was wrong (a client without an email address): read it again.
    const subject = await this.loadSubject(userId, run.subject_type, run.subject_id).catch(() => null);
    if (subject) {
      await db.query(`UPDATE workflow_runs SET context = context || $2::jsonb WHERE id = $1`, [runId, JSON.stringify(subject.blocks)]);
    }
    await db.query(
      `UPDATE workflow_steps
       SET status = 'pending', attempt = attempt + 1, error = NULL, error_code = NULL, error_params = NULL,
           outcome = NULL, input = NULL, started_at = NULL, finished_at = NULL
       WHERE id = $1`,
      [step.id]
    );
    await this.advance(runId);
  }

  /** Leaves a failed step behind and continues through its normal exit. */
  async skipStep(runId: string, stepId: string, userId: string): Promise<void> {
    const { run, step } = await this.ownedRunAndStep(runId, stepId, userId);
    const version = await this.definitions.version(run.version_id);
    const node = version ? findNode(version.graph, step.node_id) : undefined;
    if (!version || !node) throw new WorkflowStateError('This step no longer exists in the flow.');
    if (node.type === 'gateway' || node.type === 'end') {
      throw new WorkflowStateError('This step cannot be skipped. Retry it or cancel the run.');
    }
    await this.completeStep(run, version.graph, node, step, {}, 'out', 'skipped');
    await this.advance(runId);
  }

  async cancelRun(runId: string, userId: string): Promise<void> {
    const run = isUuid(runId) ? await this.loadRun(runId) : null;
    if (!run || run.user_id !== userId) throw new WorkflowNotFoundError('Run not found.');
    if (run.status === 'completed' || run.status === 'cancelled') throw new WorkflowStateError('This run has already ended.');
    await this.finishRun(runId, 'cancelled', 'Cancelled');
  }

  // ── Timers ─────────────────────────────────────────────────────────────────

  /** Fires every timer that is due. Returns how many fired. */
  async fireDueTimers(now: Date = new Date()): Promise<number> {
    const due = await getDbClient().query(
      `UPDATE workflow_timers SET fired_at = CURRENT_TIMESTAMP
       WHERE id IN (SELECT id FROM workflow_timers WHERE fired_at IS NULL AND due_at <= $1
                    ORDER BY due_at LIMIT 100 FOR UPDATE SKIP LOCKED)
       RETURNING id, kind, run_id, step_id, definition_id, due_at`,
      [now]
    );
    for (const timer of due.rows) {
      try {
        if (timer.kind === 'schedule') await this.fireSchedule(timer.definition_id, new Date(timer.due_at));
        else await this.fireStepTimer(timer.kind, timer.run_id, timer.step_id);
      } catch (error) {
        logger.error(`[Workflow] Timer ${timer.id} (${timer.kind}) failed: ${errorText(error)}`);
      }
    }
    return due.rows.length;
  }

  private async fireStepTimer(kind: 'wait' | 'task_timeout' | 'wait_timeout', runId: string, stepId: string): Promise<void> {
    const db = getDbClient();
    const run = await this.loadRun(runId);
    const stepResult = await db.query(
      `SELECT id, run_id, node_id, node_type, status, seq, input, outcome FROM workflow_steps WHERE id = $1`,
      [stepId]
    );
    const step = stepResult.rows[0] as StepRow | undefined;
    if (!run || !step || step.status !== 'waiting') return;
    const version = await this.definitions.version(run.version_id);
    const node = version ? findNode(version.graph, step.node_id) : undefined;
    if (!version || !node) return;

    if (kind === 'task_timeout') {
      // The task may have been settled in the instant the timer came due — then it wins.
      const expired = await db.query(
        `UPDATE workflow_tasks SET status = 'expired', completed_at = CURRENT_TIMESTAMP
         WHERE step_id = $1 AND status = 'open' AND kind <> 'notice' RETURNING id`,
        [stepId]
      );
      if (expired.rowCount === 0) return;
      await this.completeStep(run, version.graph, node, step, {}, 'timeout');
    } else if (kind === 'wait_timeout') {
      // The event may have arrived in the instant the timer came due — then it wins.
      const claimed = await db.query(`DELETE FROM workflow_waits WHERE step_id = $1 RETURNING id`, [stepId]);
      if ((claimed.rowCount ?? 0) === 0) return;
      await this.completeStep(run, version.graph, node, step, {}, 'timeout');
    } else {
      await this.completeStep(run, version.graph, node, step, {}, 'out');
    }
    await this.advance(runId);
  }

  // ── Events ─────────────────────────────────────────────────────────────────

  /** Handles the events recorded since the last look. Returns how many there were. */
  async processEvents(): Promise<number> {
    const db = getDbClient();
    const claimed = await db.query(
      `UPDATE workflow_events SET processed_at = CURRENT_TIMESTAMP
       WHERE id IN (SELECT id FROM workflow_events WHERE processed_at IS NULL
                    ORDER BY created_at LIMIT 200 FOR UPDATE SKIP LOCKED)
       RETURNING id, user_id, type, subject_type, subject_id, payload, created_at`
    );
    for (const event of claimed.rows) {
      try {
        await this.resumeWaits(event);
        await this.startFlowsFor(event);
      } catch (error) {
        logger.error(`[Workflow] Event ${event.id} (${event.type}) failed: ${errorText(error)}`);
      }
    }
    if (claimed.rows.length > 0) {
      await db.query(`DELETE FROM workflow_events WHERE processed_at < CURRENT_TIMESTAMP - interval '30 days'`);
    }
    return claimed.rows.length;
  }

  /** Runs that wait for exactly this event on exactly this record continue. */
  private async resumeWaits(event: DbRow): Promise<void> {
    if (!event.subject_id) return;
    const db = getDbClient();
    // Deleting the wait is the claim: the timeout timer and a late status check go for the same row.
    const waits = await db.query(
      `DELETE FROM workflow_waits w USING workflow_steps s
       WHERE w.step_id = s.id AND s.status = 'waiting'
         AND w.user_id = $1 AND w.event_type = $2 AND w.subject_id = $3
       RETURNING w.run_id, w.step_id`,
      [event.user_id, event.type, event.subject_id]
    );
    for (const wait of waits.rows) {
      const run = await this.loadRun(wait.run_id);
      const stepResult = await db.query(
        `SELECT id, run_id, node_id, node_type, status, seq, input, outcome FROM workflow_steps WHERE id = $1`,
        [wait.step_id]
      );
      const step = stepResult.rows[0] as StepRow | undefined;
      const version = run ? await this.definitions.version(run.version_id) : null;
      const node = version && step ? findNode(version.graph, step.node_id) : undefined;
      if (!run || !step || !version || !node) continue;
      await db.query(`DELETE FROM workflow_timers WHERE step_id = $1 AND fired_at IS NULL`, [step.id]);
      await this.completeStep(run, version.graph, node, step, { event: event.type, ...(event.payload ?? {}) }, 'out');
      await this.advance(run.id);
    }
  }

  /** Active flows about this kind of record whose start is this event get a run of their own. */
  private async startFlowsFor(event: DbRow): Promise<void> {
    const definition = getWorkflowEvent(event.type);
    const subject = getWorkflowSubject(event.subject_type);
    if (!definition || !subject || !isUuid(event.subject_id)) return;
    const db = getDbClient();
    const flows = await db.query(
      `SELECT d.id, v.graph FROM workflow_definitions d
       JOIN workflow_versions v ON v.definition_id = d.id AND v.version = d.published_version
       WHERE d.user_id = $1 AND d.status = 'active' AND d.subject_type = $2`,
      [event.user_id, event.subject_type]
    );
    const starting = flows.rows.filter((flow) => {
      const start = startNode(flow.graph as WorkflowGraph);
      return start?.type === 'start' && start.data.trigger === 'event' && start.data.event?.type === event.type;
    });
    if (starting.length === 0) return;

    const loaded = await subject.load(event.user_id, event.subject_id);
    if (!loaded) return;
    // Where the record knows when it changed, its own timestamps decide: rows a restore or an import
    // writes carry old ones, and must not set off a flow as if the invoice had just been created or sent.
    const happenedAt = definition.occurredAt
      ? await definition.occurredAt(event.user_id, event.subject_id)
      : new Date(event.created_at);
    if (!happenedAt || Date.now() - happenedAt.getTime() > EVENT_START_MAX_AGE_MS) {
      logger.info(`[Workflow] Event ${event.type} for ${event.subject_type} ${event.subject_id} is not recent; no flow started`);
      return;
    }
    // An event start can be limited to some clients — for every subject that belongs to one.
    const clientId = (loaded.blocks.client as { id?: unknown } | undefined)?.id;

    for (const flow of starting) {
      const start = startNode(flow.graph as WorkflowGraph);
      const clients = start?.type === 'start' ? (start.data.event?.clientIds ?? []) : [];
      if (clients.length > 0 && (typeof clientId !== 'string' || !clients.includes(clientId))) continue;
      const recent = await db.query(
        `SELECT count(*)::int AS n FROM workflow_runs
         WHERE definition_id = $1 AND started_by = 'event' AND started_at > CURRENT_TIMESTAMP - interval '1 hour'`,
        [flow.id]
      );
      if (recent.rows[0].n >= MAX_EVENT_STARTS_PER_HOUR) {
        logger.warn(`[Workflow] Flow ${flow.id} was started by events ${recent.rows[0].n} times within an hour; not starting again`);
        continue;
      }
      try {
        await this.startRun({
          userId: event.user_id,
          definitionId: flow.id,
          subjectId: event.subject_id,
          startedBy: 'event',
          businessKey: `event:${event.id}`,
          event: { type: event.type, ...(event.payload ?? {}) },
        });
      } catch (error) {
        if (!(error instanceof RunExistsError)) {
          logger.warn(`[Workflow] Flow ${flow.id} could not start on ${event.type}: ${errorText(error)}`);
        }
      }
    }
  }

  /** A scheduled start: one run per listed subject, then the next start is planned. */
  private async fireSchedule(definitionId: string, dueAt: Date): Promise<void> {
    const found = await getDbClient().query(`SELECT user_id, status FROM workflow_definitions WHERE id = $1`, [definitionId]);
    const definition = found.rows[0];
    const version = definition ? await this.definitions.publishedVersion(definitionId) : null;
    const start = version ? startNode(version.graph) : undefined;
    if (definition?.status === 'active' && start?.type === 'start' && start.data.trigger === 'schedule' && start.data.schedule) {
      const schedule = start.data.schedule;
      const reference =
        schedule.period === 'previous_month'
          ? new Date(Date.UTC(dueAt.getUTCFullYear(), dueAt.getUTCMonth() - 1, 1))
          : dueAt;
      const period = monthOf(reference);
      const subjects: Array<string | null> = schedule.subjectIds.length > 0 ? schedule.subjectIds : [null];
      for (const subjectId of subjects) {
        try {
          await this.startRun({
            userId: definition.user_id,
            definitionId,
            subjectId,
            periodStart: period.start,
            periodEnd: period.end,
            startedBy: 'schedule',
          });
        } catch (error) {
          // Already started by hand, or the subject is gone: neither stops the others.
          if (!(error instanceof RunExistsError)) {
            logger.warn(`[Workflow] Scheduled start of flow ${definitionId} for ${subjectId ?? 'no subject'} failed: ${errorText(error)}`);
          }
        }
      }
    }
    // Planned from the start that just fired, so starts missed during downtime are caught up one by one.
    await this.definitions.syncSchedule(definitionId, dueAt);
  }

  /**
   * After a restart: steps that were executing when the process died. An
   * action that changes something is not repeated — it may have taken effect —
   * so it fails and the user decides. Everything else is safe to run again.
   */
  async recover(): Promise<void> {
    const db = getDbClient();
    const stuck = await db.query(
      `SELECT s.id, s.run_id, s.node_id, s.node_type, v.graph
       FROM workflow_steps s
       JOIN workflow_runs r ON r.id = s.run_id
       JOIN workflow_versions v ON v.id = r.version_id
       WHERE s.status = 'running'`
    );
    for (const row of stuck.rows) {
      const node = findNode(row.graph as WorkflowGraph, row.node_id);
      const repeatable = node?.type !== 'action' || getWorkflowAction(node.data.action)?.effect === 'read';
      if (repeatable) {
        await db.query(`UPDATE workflow_steps SET status = 'pending', started_at = NULL WHERE id = $1`, [row.id]);
      } else {
        await this.failStep(
          row as StepRow,
          new WorkflowStepError(
            'INTERRUPTED',
            'The server stopped while this step was running. Check whether it took effect, then retry or skip it.'
          )
        );
      }
    }
    const pending = await db.query(
      `SELECT DISTINCT s.run_id FROM workflow_steps s JOIN workflow_runs r ON r.id = s.run_id
       WHERE s.status IN ('pending', 'failed') AND r.status IN ('running', 'waiting', 'incident')`
    );
    for (const row of pending.rows) {
      await this.advance(row.run_id).catch((error) => logger.error(`[Workflow] Could not resume run ${row.run_id}: ${errorText(error)}`));
    }
    if (stuck.rows.length > 0) logger.info(`[Workflow] Recovered ${stuck.rows.length} interrupted step(s)`);
  }

  // ── Reading ────────────────────────────────────────────────────────────────

  async getRun(runId: string, userId: string): Promise<WorkflowRun | null> {
    if (!isUuid(runId)) return null;
    const db = getDbClient();
    const result = await db.query(`${SELECT_RUN} WHERE r.id = $1 AND r.user_id = $2`, [runId, userId]);
    if (result.rows.length === 0) return null;
    const steps = await db.query(`SELECT * FROM workflow_steps WHERE run_id = $1 ORDER BY seq`, [runId]);
    const tasks = await db.query(`${SELECT_TASK} WHERE t.run_id = $1 ORDER BY t.created_at`, [runId]);
    return {
      ...toRunSummary(result.rows[0]),
      graph: result.rows[0].graph,
      steps: steps.rows.map(toStep),
      tasks: tasks.rows.map(toTask),
    };
  }

  async listRuns(
    userId: string,
    filters: { definitionId?: string; subjectType?: string; subjectId?: string; status?: string; limit?: number }
  ): Promise<WorkflowRunSummary[]> {
    const where = ['r.user_id = $1'];
    const values: unknown[] = [userId];
    const add = (sql: string, value: unknown) => {
      values.push(value);
      where.push(sql.replace('?', `$${values.length}`));
    };
    if (isUuid(filters.definitionId)) add('r.definition_id = ?', filters.definitionId);
    if (filters.subjectType) add('r.subject_type = ?', filters.subjectType);
    if (isUuid(filters.subjectId)) add('r.subject_id = ?', filters.subjectId);
    if (filters.status === 'active') where.push(`r.status IN ('running', 'waiting', 'incident')`);
    else if (filters.status) add('r.status = ?', filters.status);
    values.push(Math.min(Math.max(Number(filters.limit) || 100, 1), 500));
    const result = await getDbClient().query(
      `${SELECT_RUN} WHERE ${where.join(' AND ')} ORDER BY r.started_at DESC LIMIT $${values.length}`,
      values
    );
    return result.rows.map(toRunSummary);
  }

  async listTasks(userId: string, filters: { status?: string; runId?: string }): Promise<WorkflowTask[]> {
    const where = ['t.user_id = $1'];
    const values: unknown[] = [userId];
    if (isUuid(filters.runId)) {
      values.push(filters.runId);
      where.push(`t.run_id = $${values.length}`);
    }
    const status = filters.status ?? 'open';
    if (status === 'open') where.push(`t.status = 'open'`);
    else if (status === 'closed') where.push(`t.status <> 'open'`);
    // Open tasks by urgency; settled ones newest first.
    const order =
      status === 'open' ? 't.due_at ASC NULLS LAST, t.created_at ASC' : 'COALESCE(t.completed_at, t.created_at) DESC';
    const result = await getDbClient().query(`${SELECT_TASK} WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT 300`, values);
    return result.rows.map(toTask);
  }

  async countOpenTasks(userId: string): Promise<number> {
    const result = await getDbClient().query(
      `SELECT count(*)::int AS open FROM workflow_tasks WHERE user_id = $1 AND status = 'open'`,
      [userId]
    );
    return result.rows[0].open;
  }
}

export const workflowEngine = new WorkflowEngine();
