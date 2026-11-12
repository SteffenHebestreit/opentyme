/**
 * @fileoverview Flows as the user draws and publishes them.
 *
 * A flow has one editable draft and, once published, numbered versions that
 * never change — a run executes the version it started with. Publishing is
 * the only way a graph reaches the engine, and it only accepts graphs that
 * pass validateGraph(); the version stores the permissions its runs act with.
 *
 * @module services/workflow/workflow-definition
 */

import type { ApiTokenPermissions } from '../auth/api-token-permissions';
import type {
  WorkflowDefinition,
  WorkflowDefinitionStatus,
  WorkflowDefinitionSummary,
  WorkflowGraph,
  WorkflowIssue,
  WorkflowSchedule,
  WorkflowSubjectType,
  WorkflowValidation,
} from '../../types/workflow.types';
import { getDbClient } from '../../utils/database';
import { logger } from '../../utils/logger';
import { EMPTY_GRAPH, MAX_EDGES, MAX_NODES, startNode, validateGraph } from './workflow-graph';
import { getWorkflowTemplate } from './workflow-templates';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);

/** Hour (UTC) at which scheduled flows start. */
const SCHEDULE_HOUR_UTC = 6;

export class WorkflowInputError extends Error {}

/** A node-pg result row: untyped by nature, narrowed where it is mapped. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbRow = Record<string, any>;

export interface WorkflowVersionRecord {
  id: string;
  definition_id: string;
  version: number;
  graph: WorkflowGraph;
  permissions: ApiTokenPermissions;
}

export interface CreateDefinitionInput {
  name?: string;
  description?: string | null;
  subject_type?: WorkflowSubjectType;
  graph?: WorkflowGraph;
  template?: string;
  lang?: string;
}

export type PublishResult =
  | { ok: true; definition: WorkflowDefinition }
  | { ok: false; issues: WorkflowIssue[] };

const SELECT_DEFINITION = `
  SELECT d.id, d.name, d.description, d.subject_type, d.status, d.published_version,
         d.created_at, d.updated_at, d.draft_graph, v.permissions AS published_permissions,
         (d.published_version IS NULL OR d.draft_graph <> v.graph) AS has_unpublished_changes,
         (SELECT count(*)::int FROM workflow_runs r
           WHERE r.definition_id = d.id AND r.status IN ('running', 'waiting', 'incident')) AS active_runs,
         (SELECT min(t.due_at) FROM workflow_timers t
           WHERE t.definition_id = d.id AND t.kind = 'schedule' AND t.fired_at IS NULL) AS next_run_at
  FROM workflow_definitions d
  LEFT JOIN workflow_versions v ON v.definition_id = d.id AND v.version = d.published_version`;

const iso = (value: unknown): string | null =>
  value instanceof Date ? value.toISOString() : value ? String(value) : null;

function toSummary(row: DbRow): WorkflowDefinitionSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    subject_type: row.subject_type,
    status: row.status,
    published_version: row.published_version,
    has_unpublished_changes: row.has_unpublished_changes,
    active_runs: row.active_runs,
    // A paused or archived flow keeps no pending start, so this is null for them.
    next_run_at: iso(row.next_run_at),
    created_at: iso(row.created_at) as string,
    updated_at: iso(row.updated_at) as string,
  };
}

function toDefinition(row: DbRow): WorkflowDefinition {
  return { ...toSummary(row), graph: row.draft_graph, published_permissions: row.published_permissions ?? null };
}

/** A draft may be unfinished, but it has to be a graph of a sane size. */
function assertStorableGraph(graph: unknown): asserts graph is WorkflowGraph {
  const candidate = graph as WorkflowGraph;
  if (!candidate || !Array.isArray(candidate.nodes) || !Array.isArray(candidate.edges)) {
    throw new WorkflowInputError('The flow must have a list of nodes and a list of edges.');
  }
  if (candidate.nodes.length > MAX_NODES || candidate.edges.length > MAX_EDGES) {
    throw new WorkflowInputError(`A flow may have at most ${MAX_NODES} nodes and ${MAX_EDGES} edges.`);
  }
}

/**
 * The next start of a monthly schedule strictly after `after`:
 * the given day (or the month's last day) at 06:00 UTC.
 */
export function nextScheduledStart(schedule: WorkflowSchedule, after: Date): Date {
  for (let offset = 0; offset < 3; offset++) {
    const year = after.getUTCFullYear();
    const month = after.getUTCMonth() + offset;
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const day = schedule.dayOfMonth === 'last' ? lastDay : Math.min(schedule.dayOfMonth, lastDay);
    const candidate = new Date(Date.UTC(year, month, day, SCHEDULE_HOUR_UTC, 0, 0));
    if (candidate.getTime() > after.getTime()) return candidate;
  }
  // Unreachable: one of three consecutive months always lies after `after`.
  throw new Error('Could not compute the next scheduled start.');
}

export class WorkflowDefinitionService {
  async list(userId: string): Promise<WorkflowDefinitionSummary[]> {
    const result = await getDbClient().query(`${SELECT_DEFINITION} WHERE d.user_id = $1 ORDER BY lower(d.name), d.created_at`, [userId]);
    return result.rows.map(toSummary);
  }

  async get(id: string, userId: string): Promise<WorkflowDefinition | null> {
    if (!isUuid(id)) return null;
    const result = await getDbClient().query(`${SELECT_DEFINITION} WHERE d.id = $1 AND d.user_id = $2`, [id, userId]);
    return result.rows.length > 0 ? toDefinition(result.rows[0]) : null;
  }

  async create(userId: string, input: CreateDefinitionInput): Promise<WorkflowDefinition> {
    let name = input.name?.trim();
    let description = input.description ?? null;
    let subjectType = input.subject_type ?? 'client';
    let graph: WorkflowGraph = input.graph ?? EMPTY_GRAPH;

    if (input.template) {
      const template = getWorkflowTemplate(input.template, input.lang);
      if (!template) throw new WorkflowInputError('This template does not exist.');
      name = name || template.name;
      description = description ?? template.description;
      subjectType = template.subject_type;
      graph = template.graph;
    }
    if (!name) throw new WorkflowInputError('The flow needs a name.');
    assertStorableGraph(graph);

    const result = await getDbClient().query(
      `INSERT INTO workflow_definitions (user_id, name, description, subject_type, draft_graph)
       VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING id`,
      [userId, name.slice(0, 255), description, subjectType, JSON.stringify(graph)]
    );
    return (await this.get(result.rows[0].id, userId)) as WorkflowDefinition;
  }

  /** Saves the draft. Published versions, and so every run, stay as they are. */
  async update(
    id: string,
    userId: string,
    changes: { name?: string; description?: string | null; graph?: WorkflowGraph }
  ): Promise<WorkflowDefinition | null> {
    if (!isUuid(id)) return null;
    const sets: string[] = [];
    const values: unknown[] = [];
    const set = (column: string, value: unknown, cast = '') => {
      values.push(value);
      sets.push(`${column} = $${values.length}${cast}`);
    };
    if (changes.name !== undefined) {
      if (!changes.name.trim()) throw new WorkflowInputError('The flow needs a name.');
      set('name', changes.name.trim().slice(0, 255));
    }
    if (changes.description !== undefined) set('description', changes.description);
    if (changes.graph !== undefined) {
      assertStorableGraph(changes.graph);
      set('draft_graph', JSON.stringify(changes.graph), '::jsonb');
    }
    if (sets.length > 0) {
      values.push(id, userId);
      const result = await getDbClient().query(
        `UPDATE workflow_definitions SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP
         WHERE id = $${values.length - 1} AND user_id = $${values.length}`,
        values
      );
      if (result.rowCount === 0) return null;
    }
    return this.get(id, userId);
  }

  /** Deletes a flow with its versions and history — unless a run is still under way. */
  async remove(id: string, userId: string): Promise<'deleted' | 'not_found' | 'active_runs'> {
    const definition = await this.get(id, userId);
    if (!definition) return 'not_found';
    if (definition.active_runs > 0) return 'active_runs';
    await getDbClient().query(`DELETE FROM workflow_definitions WHERE id = $1 AND user_id = $2`, [id, userId]);
    return 'deleted';
  }

  async validate(id: string, userId: string, graph?: unknown): Promise<WorkflowValidation | null> {
    const definition = await this.get(id, userId);
    if (!definition) return null;
    return validateGraph(graph ?? definition.graph, definition.subject_type);
  }

  /** Turns the draft into the next version, if it is valid, and activates the flow. */
  async publish(id: string, userId: string): Promise<PublishResult | null> {
    if (!isUuid(id)) return null;
    const client = await getDbClient().connect();
    try {
      await client.query('BEGIN');
      // Locked, so two publishes cannot mint the same version number.
      const locked = await client.query(
        `SELECT id, subject_type, status, draft_graph FROM workflow_definitions WHERE id = $1 AND user_id = $2 FOR UPDATE`,
        [id, userId]
      );
      if (locked.rows.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }
      const row = locked.rows[0];
      const validation = validateGraph(row.draft_graph, row.subject_type);
      if (!validation.valid) {
        await client.query('ROLLBACK');
        return { ok: false, issues: validation.issues };
      }
      const next = await client.query(
        `SELECT COALESCE(max(version), 0) + 1 AS version FROM workflow_versions WHERE definition_id = $1`,
        [id]
      );
      const version: number = next.rows[0].version;
      await client.query(
        `INSERT INTO workflow_versions (definition_id, version, graph, permissions) VALUES ($1, $2, $3::jsonb, $4::jsonb)`,
        [id, version, JSON.stringify(row.draft_graph), JSON.stringify(validation.permissions)]
      );
      // A first publish (or one of an archived flow) switches the flow on; a paused flow stays paused.
      await client.query(
        `UPDATE workflow_definitions
         SET published_version = $2,
             status = CASE WHEN status = 'paused' THEN 'paused' ELSE 'active' END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [id, version]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
    await this.syncSchedule(id);
    logger.info(`[Workflow] Flow ${id} published`);
    return { ok: true, definition: (await this.get(id, userId)) as WorkflowDefinition };
  }

  async setStatus(
    id: string,
    userId: string,
    status: Exclude<WorkflowDefinitionStatus, 'draft'>
  ): Promise<WorkflowDefinition | null | 'not_published'> {
    const definition = await this.get(id, userId);
    if (!definition) return null;
    if (status !== 'archived' && definition.published_version === null) return 'not_published';
    await getDbClient().query(
      `UPDATE workflow_definitions SET status = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2`,
      [id, userId, status]
    );
    await this.syncSchedule(id);
    return this.get(id, userId);
  }

  /** The version a new run of this flow executes. */
  async publishedVersion(definitionId: string): Promise<WorkflowVersionRecord | null> {
    const result = await getDbClient().query(
      `SELECT v.id, v.definition_id, v.version, v.graph, v.permissions
       FROM workflow_versions v
       JOIN workflow_definitions d ON d.id = v.definition_id AND d.published_version = v.version
       WHERE d.id = $1`,
      [definitionId]
    );
    return result.rows[0] ?? null;
  }

  async version(versionId: string): Promise<WorkflowVersionRecord | null> {
    const result = await getDbClient().query(
      `SELECT id, definition_id, version, graph, permissions FROM workflow_versions WHERE id = $1`,
      [versionId]
    );
    return result.rows[0] ?? null;
  }

  /**
   * Makes the flow's pending scheduled start match its published version and
   * status: exactly one timer while it is active and has a schedule, else none.
   */
  async syncSchedule(definitionId: string, after: Date = new Date()): Promise<Date | null> {
    const db = getDbClient();
    await db.query(`DELETE FROM workflow_timers WHERE definition_id = $1 AND kind = 'schedule' AND fired_at IS NULL`, [definitionId]);
    const status = await db.query(`SELECT status FROM workflow_definitions WHERE id = $1`, [definitionId]);
    if (status.rows[0]?.status !== 'active') return null;
    const version = await this.publishedVersion(definitionId);
    const start = version ? startNode(version.graph) : undefined;
    if (!start || start.type !== 'start' || start.data.trigger !== 'schedule' || !start.data.schedule) return null;
    const dueAt = nextScheduledStart(start.data.schedule, after);
    await db.query(`INSERT INTO workflow_timers (kind, definition_id, due_at) VALUES ('schedule', $1, $2)`, [definitionId, dueAt]);
    return dueAt;
  }
}

export const workflowDefinitionService = new WorkflowDefinitionService();
