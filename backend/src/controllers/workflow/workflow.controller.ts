/**
 * @fileoverview REST handlers of the workflow engine (docs/WORKFLOW_ENGINE.md).
 *
 * Every handler is scoped to the caller: the services take the user's id and
 * answer "not found" for anything that is not theirs.
 *
 * @module controllers/workflow/workflow
 */

import { Request, Response } from 'express';
import Joi from 'joi';
import { hasLevel, ApiTokenPermissions } from '../../services/auth/api-token-permissions';
import { refuseScope } from '../../middleware/auth/token-permission';
import { buildWorkflowCatalog } from '../../services/workflow/workflow-actions';
import { WorkflowInputError, workflowDefinitionService } from '../../services/workflow/workflow-definition.service';
import {
  RunExistsError,
  TaskDecision,
  WorkflowNotFoundError,
  WorkflowStateError,
  workflowEngine,
} from '../../services/workflow/workflow-engine.service';
import { listWorkflowTemplates } from '../../services/workflow/workflow-templates';
import { getWorkflowSubject } from '../../services/workflow/workflow-subjects';
import { logger } from '../../utils/logger';

const graphSchema = Joi.object({ nodes: Joi.array().required(), edges: Joi.array().required() }).unknown(false);

const createSchema = Joi.object({
  name: Joi.string().trim().max(255).allow(''),
  description: Joi.string().max(2000).allow(null, ''),
  subject_type: Joi.string().max(60),
  graph: graphSchema,
  template: Joi.string().max(100),
  lang: Joi.string().max(10),
});

const updateSchema = Joi.object({
  name: Joi.string().trim().min(1).max(255),
  description: Joi.string().max(2000).allow(null, ''),
  graph: graphSchema,
}).min(1);

const statusSchema = Joi.object({ status: Joi.string().valid('active', 'paused', 'archived').required() });

const date = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/);
const startSchema = Joi.object({
  subject_id: Joi.string().uuid().allow(null),
  period_start: date,
  period_end: date,
  test: Joi.boolean(),
}).and('period_start', 'period_end');

function userIdOf(req: Request, res: Response): string | null {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return null;
  }
  return userId;
}

function badRequest(res: Response, error: Joi.ValidationError): void {
  res.status(400).json({ message: error.details[0].message });
}

/** Maps the engine's errors to the statuses the API documents. */
function fail(res: Response, error: unknown, what: string): void {
  if (error instanceof WorkflowNotFoundError) {
    res.status(404).json({ message: error.message });
  } else if (error instanceof RunExistsError) {
    res.status(409).json({ message: error.message, code: 'RUN_EXISTS', run_id: error.runId });
  } else if (error instanceof WorkflowStateError) {
    res.status(409).json({ message: error.message });
  } else if (error instanceof WorkflowInputError) {
    res.status(400).json({ message: error.message });
  } else {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`[Workflow] ${what} failed: ${message}`);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/** The first permission of the flow the token lacks ("invoices:write"), or null. */
function missingPermission(token: ApiTokenPermissions, flow: ApiTokenPermissions): string | null {
  for (const [key, level] of Object.entries(flow.resources ?? {})) {
    if (level && !hasLevel(token.resources?.[key as keyof typeof token.resources], level)) return `${key}:${level}`;
  }
  for (const capability of flow.capabilities ?? []) {
    if (!token.capabilities?.includes(capability)) return capability;
  }
  return null;
}

// ── Catalog ──────────────────────────────────────────────────────────────────

const languageOf = (req: Request): string | undefined => {
  const lang = typeof req.query.lang === 'string' ? req.query.lang : req.headers['accept-language'];
  return typeof lang === 'string' ? lang.split(',')[0] : undefined;
};

export function getCatalog(req: Request, res: Response): void {
  res.json(buildWorkflowCatalog(languageOf(req)));
}

/** The caller's records of one subject type, for pickers (start dialog, scheduled starts). */
export async function getSubjectOptions(req: Request, res: Response): Promise<void> {
  const userId = userIdOf(req, res);
  if (!userId) return;
  const subject = getWorkflowSubject(req.params.type);
  if (!subject) {
    res.status(404).json({ message: 'Flows cannot be about this.' });
    return;
  }
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.slice(0, 100) : undefined;
    res.json(await subject.options(userId, search));
  } catch (error) {
    fail(res, error, 'Listing subjects');
  }
}

export function getTemplates(req: Request, res: Response): void {
  res.json(listWorkflowTemplates(languageOf(req)));
}

// ── Flows ────────────────────────────────────────────────────────────────────

export async function listDefinitions(req: Request, res: Response): Promise<void> {
  const userId = userIdOf(req, res);
  if (!userId) return;
  try {
    res.json(await workflowDefinitionService.list(userId));
  } catch (error) {
    fail(res, error, 'Listing flows');
  }
}

export async function createDefinition(req: Request, res: Response): Promise<void> {
  const userId = userIdOf(req, res);
  if (!userId) return;
  const { error, value } = createSchema.validate(req.body ?? {});
  if (error) return badRequest(res, error);
  try {
    res.status(201).json(await workflowDefinitionService.create(userId, value));
  } catch (err) {
    fail(res, err, 'Creating a flow');
  }
}

export async function getDefinition(req: Request, res: Response): Promise<void> {
  const userId = userIdOf(req, res);
  if (!userId) return;
  try {
    const definition = await workflowDefinitionService.get(req.params.id, userId);
    if (!definition) {
      res.status(404).json({ message: 'Flow not found.' });
      return;
    }
    res.json(definition);
  } catch (error) {
    fail(res, error, 'Reading a flow');
  }
}

export async function updateDefinition(req: Request, res: Response): Promise<void> {
  const userId = userIdOf(req, res);
  if (!userId) return;
  const { error, value } = updateSchema.validate(req.body ?? {});
  if (error) return badRequest(res, error);
  try {
    const definition = await workflowDefinitionService.update(req.params.id, userId, value);
    if (!definition) {
      res.status(404).json({ message: 'Flow not found.' });
      return;
    }
    res.json(definition);
  } catch (err) {
    fail(res, err, 'Saving a flow');
  }
}

export async function deleteDefinition(req: Request, res: Response): Promise<void> {
  const userId = userIdOf(req, res);
  if (!userId) return;
  try {
    const outcome = await workflowDefinitionService.remove(req.params.id, userId);
    if (outcome === 'not_found') res.status(404).json({ message: 'Flow not found.' });
    else if (outcome === 'active_runs') {
      res.status(409).json({ message: 'This flow still has runs under way. Cancel them, or archive the flow instead.' });
    } else res.status(204).send();
  } catch (error) {
    fail(res, error, 'Deleting a flow');
  }
}

export async function validateDefinition(req: Request, res: Response): Promise<void> {
  const userId = userIdOf(req, res);
  if (!userId) return;
  try {
    const validation = await workflowDefinitionService.validate(req.params.id, userId, req.body?.graph);
    if (!validation) {
      res.status(404).json({ message: 'Flow not found.' });
      return;
    }
    res.json(validation);
  } catch (error) {
    fail(res, error, 'Checking a flow');
  }
}

export async function publishDefinition(req: Request, res: Response): Promise<void> {
  const userId = userIdOf(req, res);
  if (!userId) return;
  try {
    const result = await workflowDefinitionService.publish(req.params.id, userId);
    if (!result) {
      res.status(404).json({ message: 'Flow not found.' });
    } else if (!result.ok) {
      res.status(422).json({ message: 'The flow cannot be published yet.', issues: result.issues });
    } else {
      res.json(result.definition);
    }
  } catch (error) {
    fail(res, error, 'Publishing a flow');
  }
}

export async function setDefinitionStatus(req: Request, res: Response): Promise<void> {
  const userId = userIdOf(req, res);
  if (!userId) return;
  const { error, value } = statusSchema.validate(req.body ?? {});
  if (error) return badRequest(res, error);
  try {
    const result = await workflowDefinitionService.setStatus(req.params.id, userId, value.status);
    if (result === null) res.status(404).json({ message: 'Flow not found.' });
    else if (result === 'not_published') res.status(409).json({ message: 'Publish the flow first.' });
    else res.json(result);
  } catch (err) {
    fail(res, err, 'Changing a flow');
  }
}

// ── Runs ─────────────────────────────────────────────────────────────────────

export async function startRun(req: Request, res: Response): Promise<void> {
  const userId = userIdOf(req, res);
  if (!userId) return;
  const { error, value } = startSchema.validate(req.body ?? {});
  if (error) return badRequest(res, error);
  try {
    // A run acts with the flow's permissions. A token may only set that in
    // motion if it holds every one of them itself — otherwise starting a flow
    // would be a way around the token's own limits.
    if (req.authContext?.method === 'pat') {
      const version = await workflowDefinitionService.publishedVersion(req.params.id);
      const missing = version ? missingPermission(req.authContext.permissions, version.permissions) : null;
      if (missing) {
        refuseScope(res, missing);
        return;
      }
    }
    const runId = await workflowEngine.startRun({
      userId,
      definitionId: req.params.id,
      subjectId: value.subject_id ?? null,
      periodStart: value.period_start,
      periodEnd: value.period_end,
      test: value.test === true,
    });
    res.status(201).json(await workflowEngine.getRun(runId, userId));
  } catch (err) {
    fail(res, err, 'Starting a run');
  }
}

export async function listRuns(req: Request, res: Response): Promise<void> {
  const userId = userIdOf(req, res);
  if (!userId) return;
  const text = (value: unknown) => (typeof value === 'string' ? value : undefined);
  try {
    res.json(
      await workflowEngine.listRuns(userId, {
        definitionId: text(req.query.definition_id),
        subjectType: text(req.query.subject_type),
        subjectId: text(req.query.subject_id),
        status: text(req.query.status),
        limit: Number(req.query.limit) || undefined,
      })
    );
  } catch (error) {
    fail(res, error, 'Listing runs');
  }
}

async function sendRun(res: Response, runId: string, userId: string): Promise<void> {
  const run = await workflowEngine.getRun(runId, userId);
  if (!run) {
    res.status(404).json({ message: 'Run not found.' });
    return;
  }
  res.json(run);
}

export async function getRun(req: Request, res: Response): Promise<void> {
  const userId = userIdOf(req, res);
  if (!userId) return;
  try {
    await sendRun(res, req.params.id, userId);
  } catch (error) {
    fail(res, error, 'Reading a run');
  }
}

export async function cancelRun(req: Request, res: Response): Promise<void> {
  const userId = userIdOf(req, res);
  if (!userId) return;
  try {
    await workflowEngine.cancelRun(req.params.id, userId);
    await sendRun(res, req.params.id, userId);
  } catch (error) {
    fail(res, error, 'Cancelling a run');
  }
}

export async function retryStep(req: Request, res: Response): Promise<void> {
  const userId = userIdOf(req, res);
  if (!userId) return;
  try {
    await workflowEngine.retryStep(req.params.id, req.params.stepId, userId);
    await sendRun(res, req.params.id, userId);
  } catch (error) {
    fail(res, error, 'Retrying a step');
  }
}

export async function skipStep(req: Request, res: Response): Promise<void> {
  const userId = userIdOf(req, res);
  if (!userId) return;
  try {
    await workflowEngine.skipStep(req.params.id, req.params.stepId, userId);
    await sendRun(res, req.params.id, userId);
  } catch (error) {
    fail(res, error, 'Skipping a step');
  }
}

// ── Tasks ────────────────────────────────────────────────────────────────────

export async function listTasks(req: Request, res: Response): Promise<void> {
  const userId = userIdOf(req, res);
  if (!userId) return;
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  if (status && !['open', 'closed', 'all'].includes(status)) {
    res.status(400).json({ message: 'status must be open, closed or all.' });
    return;
  }
  try {
    res.json(
      await workflowEngine.listTasks(userId, {
        status,
        runId: typeof req.query.run_id === 'string' ? req.query.run_id : undefined,
      })
    );
  } catch (error) {
    fail(res, error, 'Listing tasks');
  }
}

export async function countTasks(req: Request, res: Response): Promise<void> {
  const userId = userIdOf(req, res);
  if (!userId) return;
  try {
    res.json({ open: await workflowEngine.countOpenTasks(userId) });
  } catch (error) {
    fail(res, error, 'Counting tasks');
  }
}

/** A form's values arrive as JSON, or — in a multipart request — as a JSON string. */
function valuesOf(body: { values?: unknown } | undefined): Record<string, unknown> | undefined {
  const raw = body?.values;
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function settle(decision: TaskDecision) {
  return async (req: Request, res: Response): Promise<void> => {
    const userId = userIdOf(req, res);
    if (!userId) return;
    try {
      const body = req.body ?? {};
      const file = req.file
        ? { buffer: req.file.buffer, originalname: req.file.originalname, mimetype: req.file.mimetype, size: req.file.size }
        : undefined;
      res.json(
        await workflowEngine.settleTask(req.params.id, userId, decision, {
          comment: typeof body.comment === 'string' ? body.comment : undefined,
          title: typeof body.title === 'string' ? body.title : undefined,
          values: valuesOf(body),
          file,
        })
      );
    } catch (error) {
      // The document service's own refusals (unknown type, foreign project) are the caller's to fix.
      if (error instanceof Error && /does not belong|not found or unauthorized/i.test(error.message)) {
        res.status(400).json({ message: error.message });
        return;
      }
      fail(res, error, `Settling a task (${decision})`);
    }
  };
}

export const completeTask = settle('complete');
export const rejectTask = settle('reject');
export const approveTask = settle('approve');
export const skipTask = settle('skip');
export const dismissTask = settle('dismiss');
