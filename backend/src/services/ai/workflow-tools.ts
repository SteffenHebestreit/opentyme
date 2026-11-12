/**
 * @fileoverview The assistant's tools for flows: which flows exist, starting
 * one, what is waiting for the user, settling a simple task, and how a run is
 * doing.
 *
 * Task-shaped like log_time_entry (see core-tools.ts): names are resolved on
 * the server — the flow by its name, what it runs for by the name or number
 * the user used — and the user reviews the resolved names on the approval card
 * before anything starts. Every tool calls the workflow routes with the user's
 * own authorization, so it can do exactly what the user (or the API token the
 * conversation was started with) may do there.
 *
 * Deliberately missing:
 * - approving an action — the approval exists so that a person looks at what
 *   is about to be sent, and that is shown in Tasks, not on a tool card;
 * - uploads — the assistant has no file to hand over;
 * - drawing and publishing flows — that needs a signed-in session and happens
 *   in the editor.
 *
 * @module services/ai/workflow-tools
 */

import type {
  WorkflowDefinitionSummary,
  WorkflowRun,
  WorkflowRunSummary,
  WorkflowTask,
} from '../../types/workflow.types';
import { logger } from '../../utils/logger';
import { TOOL_CALL_HEADER } from '../auth/internal-call';
import { nodeLabel } from '../workflow/workflow-graph';
import { registerCustomTool } from './ai-tool-registry.service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TASKS_PAGE = 'the Tasks page in OpenTyme';

interface ToolContext {
  bearerToken: string;
}

/** Read per call: tests start the server on a port of their own. */
const baseUrl = (): string => process.env.INTERNAL_API_URL ?? 'http://localhost:8000';

/** A refusal of the workflow routes — its message is meant for the user and goes back to the model. */
export class WorkflowToolError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body: Record<string, unknown> = {}
  ) {
    super(message);
  }
}

async function callApi<T>(ctx: ToolContext | undefined, method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  if (!ctx?.bearerToken) throw new Error('This tool needs an authenticated conversation.');
  let response: Response;
  try {
    response = await fetch(`${baseUrl()}/api/workflows${path}`, {
      method,
      headers: {
        Authorization: ctx.bearerToken,
        // Marks the call as the assistant's own (not new use of an API token).
        [TOOL_CALL_HEADER]: '1',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    // No transport text (internal host and port) in what reaches the model.
    throw new Error('The workflow API could not be reached.');
  }
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const details = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
    const message = typeof details.message === 'string' ? details.message : `The request failed (HTTP ${response.status}).`;
    throw new WorkflowToolError(response.status, message, details);
  }
  return data as T;
}

// ── Resolving names ──────────────────────────────────────────────────────────

export interface NamedCandidate {
  id: string;
  name: string;
}

const listed = (candidates: NamedCandidate[]): string =>
  candidates
    .slice(0, 15)
    .map((candidate) => candidate.name)
    .join(', ') || '(none)';

/**
 * Matches what the user called something against what exists. An exact name
 * (ignoring case) wins over a partial one; anything ambiguous is refused, so
 * the model asks instead of picking.
 */
export function matchByName<T extends NamedCandidate>(what: string, reference: string, candidates: T[]): T {
  const wanted = reference.trim();
  if (UUID_RE.test(wanted)) {
    const byId = candidates.find((candidate) => candidate.id.toLowerCase() === wanted.toLowerCase());
    if (!byId) throw new Error(`No ${what} with the id ${wanted} exists for this user.`);
    return byId;
  }
  const needle = wanted.toLowerCase();
  const exact = candidates.filter((candidate) => candidate.name.trim().toLowerCase() === needle);
  const matches = exact.length > 0 ? exact : candidates.filter((candidate) => candidate.name.toLowerCase().includes(needle));
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    throw new Error(`"${wanted}" is ambiguous — it matches: ${listed(matches)}. Ask the user which ${what} is meant; do not guess.`);
  }
  throw new Error(`No ${what} matches "${wanted}". Available: ${listed(candidates)}. Ask the user which ${what} is meant.`);
}

/** A reference that is still valid: the id filled in before approval, unless the user changed the name on the card. */
function keptId<T extends NamedCandidate>(name: string, id: unknown, candidates: T[]): T | undefined {
  if (typeof id !== 'string' || !UUID_RE.test(id.trim())) return undefined;
  const found = candidates.find((candidate) => candidate.id.toLowerCase() === id.trim().toLowerCase());
  if (!found) return undefined;
  return !name || name.toLowerCase() === found.name.trim().toLowerCase() ? found : undefined;
}

const canStart = (flow: WorkflowDefinitionSummary): boolean => flow.published_version !== null && flow.status !== 'archived';

async function resolveFlow(args: Record<string, unknown>, ctx: ToolContext): Promise<WorkflowDefinitionSummary> {
  const name = String(args.workflow ?? '').trim();
  const flows = await callApi<WorkflowDefinitionSummary[]>(ctx, 'GET', '/definitions');
  const startable = flows.filter(canStart);
  const kept = keptId(name, args.workflow_id, startable);
  if (kept) return kept;
  if (!name) throw new Error('workflow is required (the name of a flow, see list_workflows).');
  try {
    return matchByName('flow', name, startable);
  } catch (error) {
    // Say why a flow that exists cannot be started, instead of "no flow matches".
    const other = flows.filter((flow) => !canStart(flow) && flow.name.trim().toLowerCase() === name.toLowerCase())[0];
    if (other) {
      throw new Error(
        other.status === 'archived'
          ? `The flow "${other.name}" is archived and cannot be started.`
          : `The flow "${other.name}" has not been published yet. It is published in the flow editor.`
      );
    }
    throw error;
  }
}

/** What the flow runs for, by the name or number the user used. Null for a flow about nothing. */
async function resolveSubject(
  flow: WorkflowDefinitionSummary,
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<NamedCandidate | null> {
  if (flow.subject_type === 'none') return null;
  const name = String(args.subject ?? '').trim();
  const options = (search?: string) =>
    callApi<Array<{ id: string; label: string }>>(
      ctx,
      'GET',
      `/subjects/${encodeURIComponent(flow.subject_type)}/options${search ? `?search=${encodeURIComponent(search)}` : ''}`
    ).then((rows) => rows.map((row) => ({ id: row.id, name: row.label })));

  // "Project · Client" and "RE-2026-001 · Client" are listed with their client; the user names the first part.
  const head = (label: string) => label.split(' · ')[0].trim();
  const subjectId = typeof args.subject_id === 'string' ? args.subject_id.trim() : '';
  const id = UUID_RE.test(subjectId) ? subjectId : UUID_RE.test(name) ? name : '';
  const term = UUID_RE.test(name) ? '' : head(name);
  const found = await options(term || undefined);
  if (id) {
    // The id filled in before approval still stands for the name on the card.
    const known = found.find((candidate) => candidate.id.toLowerCase() === id.toLowerCase());
    if (known) return known;
    // Only an id: the API says whether it exists.
    if (!term) return { id, name: id };
  }
  if (!term) {
    throw new Error(`The flow "${flow.name}" runs for a ${flow.subject_type}: pass its name or number as subject. Ask the user if it is not clear.`);
  }
  const byHead = found.filter((candidate) => head(candidate.name).toLowerCase() === term.toLowerCase());
  if (byHead.length === 1) return byHead[0];
  return matchByName(flow.subject_type, name, found.length > 0 ? found : await options());
}

function periodOf(args: Record<string, unknown>): { period_start?: string; period_end?: string } {
  const start = typeof args.period_start === 'string' ? args.period_start.trim() : '';
  const end = typeof args.period_end === 'string' ? args.period_end.trim() : '';
  if (!start && !end) return {};
  if (!DATE_RE.test(start) || !DATE_RE.test(end)) throw new Error('Give both period_start and period_end as YYYY-MM-DD, or neither (= the current month).');
  if (start > end) throw new Error('period_end is before period_start.');
  return { period_start: start, period_end: end };
}

// ── What the model gets back ─────────────────────────────────────────────────

const subjectOf = (row: { subject_label: string | null }): string | undefined => row.subject_label ?? undefined;

const HOW_TO_SETTLE: Record<WorkflowTask['kind'], string> = {
  confirm: 'settle_workflow_task with decision "complete" (done / yes) or "reject" (no)',
  form: 'settle_workflow_task with decision "complete" and values for the fields',
  notice: 'settle_workflow_task with decision "dismiss"',
  upload: `needs a file — the user uploads it on ${TASKS_PAGE}`,
  approval: `the user approves or skips it on ${TASKS_PAGE}, where what will be sent is shown`,
};

function taskSummary(task: WorkflowTask): Record<string, unknown> {
  return {
    task_id: task.id,
    title: task.title,
    kind: task.kind,
    description: task.description ?? undefined,
    workflow: task.definition_name,
    subject: subjectOf(task),
    due_at: task.due_at ?? undefined,
    test_run: task.test_mode || undefined,
    how_to_settle: HOW_TO_SETTLE[task.kind],
    ...(task.kind === 'form' ? { fields: task.payload.fields } : {}),
  };
}

function runSummary(run: WorkflowRunSummary): Record<string, unknown> {
  return {
    run_id: run.id,
    workflow: run.definition_name,
    subject: subjectOf(run),
    period: run.period_start && run.period_end ? `${run.period_start} – ${run.period_end}` : undefined,
    status: run.status,
    waiting_at: run.current_node_label ?? undefined,
    result: run.result ?? undefined,
    test_run: run.test_mode || undefined,
    started_by: run.started_by,
    started_at: run.started_at,
    ended_at: run.ended_at ?? undefined,
  };
}

function runDetails(run: WorkflowRun): Record<string, unknown> {
  const label = (nodeId: string): string => {
    const node = run.graph.nodes.find((candidate) => candidate.id === nodeId);
    return node ? nodeLabel(node) : nodeId;
  };
  return {
    ...runSummary(run),
    open_tasks: run.tasks.filter((task) => task.status === 'open').map(taskSummary),
    failed_steps: run.steps
      .filter((step) => step.status === 'failed')
      .map((step) => ({ step: label(step.node_id), error: step.error ?? 'failed' })),
    steps: run.steps.map((step) => `${label(step.node_id)}: ${step.status}`),
  };
}

// ── The tools ────────────────────────────────────────────────────────────────

const DEFINITIONS = { method: 'GET', path: '/api/workflows/definitions' };
const RUNS = { method: 'GET', path: '/api/workflows/runs' };
const TASKS = { method: 'GET', path: '/api/workflows/tasks' };

/** Registers the flow tools. Call once at startup, before the first AI request. */
export function registerWorkflowAiTools(): void {
  registerCustomTool({
    name: 'list_workflows',
    description:
      'List the user\'s flows (workflows / business processes; German: Ablauf, Abläufe) — e.g. "timesheet for signature, then invoice". Shows for each what it runs for (client, project, invoice …) and whether it can be started. Use before start_workflow_run when the flow name is not clear.',
    parameters: { type: 'object', properties: {} },
    requiresApproval: false,
    apiAccess: [DEFINITIONS],
    execute: async (_args, ctx) => {
      const flows = await callApi<WorkflowDefinitionSummary[]>(ctx, 'GET', '/definitions');
      return flows
        .filter((flow) => flow.status !== 'archived')
        .map((flow) => ({
          workflow_id: flow.id,
          name: flow.name,
          description: flow.description ?? undefined,
          runs_for: flow.subject_type === 'none' ? 'nothing in particular' : `a ${flow.subject_type}`,
          can_be_started: canStart(flow),
          ...(canStart(flow) ? {} : { why_not: 'not published yet (flows are published in the flow editor)' }),
          status: flow.status,
          runs_under_way: flow.active_runs,
          next_scheduled_start: flow.next_run_at ?? undefined,
        }));
    },
  });

  registerCustomTool({
    name: 'start_workflow_run',
    description:
      'Start a run of a flow (workflow; German: Ablauf starten) by NAME for a client, project or invoice named by the user — names are resolved server-side, no id lookup needed. The period defaults to the current month. Set test=true for a test run (mails go to the user, invoices stay drafts).',
    parameters: {
      type: 'object',
      properties: {
        workflow: { type: 'string', description: 'Name of the flow (or its id)' },
        subject: {
          type: 'string',
          description: 'What the flow runs for: the name of the client or project, or the invoice number. Omit for a flow that runs for nothing in particular.',
        },
        period_start: { type: 'string', description: 'First day of the period, YYYY-MM-DD. Omit both dates for the current month.' },
        period_end: { type: 'string', description: 'Last day of the period, YYYY-MM-DD' },
        test: { type: 'boolean', description: 'true = test run. Default false.' },
        workflow_id: { type: 'string', description: 'Filled in automatically when the flow is resolved; omit it' },
        subject_id: { type: 'string', description: 'Filled in automatically when the subject is resolved; omit it' },
      },
      required: ['workflow'],
    },
    apiAccess: [
      DEFINITIONS,
      { method: 'GET', path: '/api/workflows/subjects/{type}/options' },
      { method: 'POST', path: '/api/workflows/definitions/{id}/runs' },
    ],
    // Resolved BEFORE the approval card is shown: the user reviews the exact flow and what it
    // runs for, and an ambiguous or unknown name never reaches the card.
    prepare: async (args, ctx) => {
      const period = periodOf(args);
      const flow = await resolveFlow(args, ctx);
      const subject = await resolveSubject(flow, args, ctx);
      const { subject: _subject, subject_id: _subjectId, ...rest } = args;
      return {
        ...rest,
        ...period,
        workflow: flow.name,
        workflow_id: flow.id,
        ...(subject ? { subject: subject.name, subject_id: subject.id } : {}),
      };
    },
    execute: async (args, ctx) => {
      if (!ctx?.bearerToken) throw new Error('start_workflow_run requires an authenticated context');
      const period = periodOf(args);
      const flow = await resolveFlow(args, ctx);
      const subject = await resolveSubject(flow, args, ctx);
      try {
        const run = await callApi<WorkflowRun>(ctx, 'POST', `/definitions/${flow.id}/runs`, {
          ...(subject ? { subject_id: subject.id } : {}),
          ...period,
          test: args.test === true,
        });
        return { started: true, ...runDetails(run) };
      } catch (error) {
        if (error instanceof WorkflowToolError && error.body.code === 'RUN_EXISTS') {
          throw new Error(
            `"${flow.name}" already has a run for ${subject?.name ?? 'this'} in that period (run_id ${String(error.body.run_id)}). ` +
              'Use get_workflow_runs to see how it is doing; a second run needs another period, or test=true.'
          );
        }
        throw error;
      }
    },
  });

  registerCustomTool({
    name: 'list_workflow_tasks',
    description:
      'List the open tasks that flows (workflows; German: Aufgaben, offene Aufgaben) are waiting for the user to do: confirmations, uploads (e.g. the signed timesheet), forms, approvals and notices. Each says how it is settled.',
    parameters: { type: 'object', properties: {} },
    requiresApproval: false,
    apiAccess: [TASKS],
    execute: async (_args, ctx) => {
      const tasks = await callApi<WorkflowTask[]>(ctx, 'GET', '/tasks?status=open');
      return tasks.map(taskSummary);
    },
  });

  registerCustomTool({
    name: 'settle_workflow_task',
    description:
      'Settle one open task of a flow (workflow task; German: Aufgabe erledigen) from list_workflow_tasks: confirm it ("complete"), answer no ("reject"), fill in a form ("complete" with values) or dismiss a notice ("dismiss"). Uploads and approvals of mails cannot be settled here — the user does those on the Tasks page.',
    parameters: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'task_id from list_workflow_tasks' },
        decision: { type: 'string', enum: ['complete', 'reject', 'dismiss'], description: 'complete = done / yes; reject = no; dismiss = close a notice' },
        comment: { type: 'string', description: 'Optional note that is kept with the task' },
        values: { type: 'object', description: 'For a form: its field keys with their values', properties: {} },
        task: { type: 'string', description: 'Filled in automatically (title of the task); omit it' },
      },
      required: ['task_id', 'decision'],
    },
    apiAccess: [
      TASKS,
      { method: 'POST', path: '/api/workflows/tasks/{id}/complete' },
      { method: 'POST', path: '/api/workflows/tasks/{id}/reject' },
      { method: 'POST', path: '/api/workflows/tasks/{id}/dismiss' },
      { method: 'GET', path: '/api/workflows/runs/{id}' },
    ],
    prepare: async (args, ctx) => {
      const { task } = await settlement(args, ctx);
      const about = [task.definition_name, task.subject_label].filter(Boolean).join(' · ');
      return { ...args, task: about ? `${task.title} (${about})` : task.title };
    },
    execute: async (args, ctx) => {
      const { task, decision } = await settlement(args, ctx);
      const settled = await callApi<WorkflowTask>(ctx, 'POST', `/tasks/${task.id}/${decision}`, {
        ...(typeof args.comment === 'string' && args.comment.trim() ? { comment: args.comment.trim() } : {}),
        ...(task.kind === 'form' ? { values: args.values ?? {} } : {}),
      });
      const run = await callApi<WorkflowRun>(ctx, 'GET', `/runs/${task.run_id}`).catch(() => null);
      return { settled: true, task: settled.title, task_status: settled.status, ...(run ? { run: runDetails(run) } : {}) };
    },
  });

  registerCustomTool({
    name: 'get_workflow_runs',
    description:
      'How the runs of flows (workflows; German: Ablauf, Stand, Status) are doing: without run_id the most recent runs (optionally of one flow or with one status), with run_id one run in detail — its steps, what it waits for and what went wrong.',
    parameters: {
      type: 'object',
      properties: {
        run_id: { type: 'string', description: 'One run in detail (from start_workflow_run or a previous list)' },
        workflow: { type: 'string', description: 'Only runs of this flow (name or id)' },
        status: { type: 'string', enum: ['running', 'waiting', 'incident', 'completed', 'cancelled'], description: 'Only runs in this status. incident = a step failed.' },
      },
    },
    requiresApproval: false,
    apiAccess: [RUNS, DEFINITIONS, { method: 'GET', path: '/api/workflows/runs/{id}' }],
    execute: async (args, ctx) => {
      const runId = typeof args.run_id === 'string' ? args.run_id.trim() : '';
      if (runId) {
        if (!UUID_RE.test(runId)) throw new Error('run_id must be the id of a run.');
        return runDetails(await callApi<WorkflowRun>(ctx, 'GET', `/runs/${runId}`));
      }
      const query = new URLSearchParams({ limit: '20' });
      if (typeof args.workflow === 'string' && args.workflow.trim()) {
        const flows = await callApi<WorkflowDefinitionSummary[]>(ctx, 'GET', '/definitions');
        query.set('definition_id', matchByName('flow', args.workflow, flows).id);
      }
      if (typeof args.status === 'string' && args.status) query.set('status', args.status);
      const runs = await callApi<WorkflowRunSummary[]>(ctx, 'GET', `/runs?${query.toString()}`);
      return runs.map(runSummary);
    },
  });

  logger.info('[AI] Workflow tools registered (list_workflows, start_workflow_run, list_workflow_tasks, settle_workflow_task, get_workflow_runs)');
}

/** The open task a settle call is about, and the decision checked against what its kind allows. */
async function settlement(
  args: Record<string, unknown>,
  ctx: ToolContext | undefined
): Promise<{ task: WorkflowTask; decision: 'complete' | 'reject' | 'dismiss' }> {
  const taskId = String(args.task_id ?? '').trim();
  if (!UUID_RE.test(taskId)) throw new Error('task_id must be the task_id of a task from list_workflow_tasks.');
  const tasks = await callApi<WorkflowTask[]>(ctx, 'GET', '/tasks?status=open');
  const task = tasks.find((candidate) => candidate.id.toLowerCase() === taskId.toLowerCase());
  if (!task) throw new Error('There is no open task with this task_id (it may have been settled already). Use list_workflow_tasks.');
  if (task.kind === 'upload' || task.kind === 'approval') {
    throw new Error(`"${task.title}" cannot be settled here: ${HOW_TO_SETTLE[task.kind]}. Tell the user.`);
  }
  const allowed: Record<'confirm' | 'form' | 'notice', Array<'complete' | 'reject' | 'dismiss'>> = {
    confirm: ['complete', 'reject'],
    form: ['complete'],
    notice: ['dismiss'],
  };
  const decision = String(args.decision ?? '') as 'complete' | 'reject' | 'dismiss';
  if (!allowed[task.kind].includes(decision)) {
    throw new Error(`"${task.title}" is a ${task.kind} task: ${HOW_TO_SETTLE[task.kind]}.`);
  }
  if (task.kind === 'form' && (!args.values || typeof args.values !== 'object' || Array.isArray(args.values))) {
    throw new Error(`"${task.title}" is a form: pass values for its fields (${JSON.stringify(task.payload.fields ?? [])}).`);
  }
  return { task, decision };
}
