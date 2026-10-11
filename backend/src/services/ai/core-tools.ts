/**
 * Hand-written composite AI tools for the hottest workflows.
 *
 * Research-backed (see docs/ai-architecture-notes.md): auto-generated CRUD
 * tools are API-shaped, so common tasks need multi-hop chains (resolve project
 * UUID → compute duration → create entry) where each hop compounds local-model
 * unreliability — the observed failure mode of the schedule back-logging test.
 * Task-shaped composites collapse those chains to one call: names are resolved
 * and arithmetic is done SERVER-side, never by the model.
 *
 * Registered at startup; write-gated via the normal approval flow
 * (requiresApproval defaults to true). The project is resolved BEFORE the
 * approval card is shown (`prepare`), so the user reviews the exact project
 * name + id that will be booked, and ambiguous names are sent back to the
 * model to ask the user instead of being guessed.
 */

import axios from 'axios';
import { registerCustomTool } from './ai-tool-registry.service';
import { logger } from '../../utils/logger';

const INTERNAL_BASE_URL = process.env.INTERNAL_API_URL ?? 'http://localhost:8000';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export interface ProjectCandidate {
  id: string;
  name: string;
  status?: string;
}

const isActive = (p: ProjectCandidate): boolean => !p.status || p.status === 'active';

function describeCandidates(list: ProjectCandidate[]): string {
  return list
    .slice(0, 15)
    .map((p) => (p.status ? `${p.name} (${p.status})` : p.name))
    .join(', ');
}

/**
 * Matches a project reference (name or UUID) against the user's projects.
 * Exact (case-insensitive) name matches win over partial ones; among several
 * candidates the single ACTIVE one is preferred. Anything still ambiguous is
 * refused — the model must ask the user instead of silently picking one.
 */
export function matchProject(project: string, projects: ProjectCandidate[]): { id: string; name: string } {
  const trimmed = project.trim();
  if (!trimmed) throw new Error('project is required (a project name or UUID)');

  if (UUID_RE.test(trimmed)) {
    const byId = projects.find((p) => p.id.toLowerCase() === trimmed.toLowerCase());
    if (!byId) throw new Error(`No project with id ${trimmed} exists for this user.`);
    return { id: byId.id, name: byId.name };
  }

  const needle = trimmed.toLowerCase();
  const pick = (candidates: ProjectCandidate[]): ProjectCandidate | undefined => {
    if (candidates.length === 1) return candidates[0];
    const active = candidates.filter(isActive);
    return active.length === 1 ? active[0] : undefined;
  };

  const exact = projects.filter((p) => p.name.trim().toLowerCase() === needle);
  const partial = exact.length > 0 ? [] : projects.filter((p) => p.name.toLowerCase().includes(needle));
  const candidates = exact.length > 0 ? exact : partial;
  const chosen = pick(candidates);
  if (chosen) return { id: chosen.id, name: chosen.name };

  if (candidates.length > 1) {
    throw new Error(
      `Project name "${trimmed}" is ambiguous — it matches: ${describeCandidates(candidates)}. ` +
        'Ask the user which project is meant; do not guess.'
    );
  }
  const available = projects.filter(isActive);
  throw new Error(
    `No project matches "${trimmed}". Active projects: ${describeCandidates(available) || '(none)'}. ` +
      'Ask the user which project is meant.'
  );
}

async function fetchProjects(bearerToken: string): Promise<ProjectCandidate[]> {
  const res = await axios.get(`${INTERNAL_BASE_URL}/api/projects`, {
    headers: { Authorization: bearerToken },
    timeout: 15000,
    maxContentLength: 2 * 1024 * 1024,
  });
  const rows = (Array.isArray(res.data) ? res.data : res.data?.projects ?? []) as Array<Record<string, unknown>>;
  return rows
    .filter((p) => typeof p?.id === 'string' && typeof p?.name === 'string')
    .map((p) => ({
      id: p.id as string,
      name: p.name as string,
      ...(typeof p.status === 'string' ? { status: p.status } : {}),
    }));
}

/**
 * Resolves the project for log_time_entry. A `project_id` (filled in by the
 * pre-approval step) is honoured as long as the visible `project` name still
 * refers to it — if the user edited the name on the approval card, the name wins
 * and is resolved again.
 */
async function resolveProject(
  args: Record<string, unknown>,
  bearerToken: string
): Promise<{ id: string; name: string }> {
  const project = String(args.project ?? '').trim();
  const projectId = typeof args.project_id === 'string' ? args.project_id.trim() : '';
  const projects = await fetchProjects(bearerToken);

  if (projectId && UUID_RE.test(projectId)) {
    const byId = projects.find((p) => p.id.toLowerCase() === projectId.toLowerCase());
    if (byId) {
      const consistent =
        !project ||
        project.toLowerCase() === byId.name.trim().toLowerCase() ||
        project.toLowerCase() === byId.id.toLowerCase();
      if (consistent) return { id: byId.id, name: byId.name };
    } else if (!project) {
      throw new Error(`No project with id ${projectId} exists for this user.`);
    }
  }
  return matchProject(project, projects);
}

interface EntryTimes {
  entryDate: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
}

function validateEntryArgs(args: Record<string, unknown>): EntryTimes {
  const entryDate = String(args.entry_date ?? '');
  const startTime = String(args.start_time ?? '');
  const endTime = String(args.end_time ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) throw new Error('entry_date must be YYYY-MM-DD');
  if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime)) {
    throw new Error('start_time and end_time must be HH:MM (24h)');
  }
  const durationMinutes = toMinutes(endTime) - toMinutes(startTime);
  if (durationMinutes <= 0) {
    throw new Error('end_time must be after start_time on the same day — split overnight work into two entries');
  }
  return { entryDate, startTime, endTime, durationMinutes };
}

/** Registers the core composite tools. Call once at startup, before the first AI request. */
export function registerCoreAiTools(): void {
  registerCustomTool({
    name: 'log_time_entry',
    description:
      'Create ONE time entry by project NAME (resolved server-side — no UUID lookup needed). Duration is computed server-side from start/end. Preferred over post_time_entries for logging time. For multiple entries, call once per entry.',
    parameters: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name (matched server-side) or project UUID' },
        project_id: {
          type: 'string',
          description: 'Optional project UUID — filled in automatically when the project is resolved; omit it',
        },
        entry_date: { type: 'string', description: 'Date of the work, YYYY-MM-DD' },
        start_time: { type: 'string', description: 'Start time, HH:MM (24h)' },
        end_time: { type: 'string', description: 'End time, HH:MM (24h), after start_time (same day)' },
        task_name: { type: 'string', description: 'Optional task label; omit if none' },
        description: { type: 'string', description: 'Optional description; omit if none' },
      },
      required: ['project', 'entry_date', 'start_time', 'end_time'],
    },
    // Resolve the project BEFORE the approval card is shown, so the user
    // reviews the exact project (name + id) that will be booked — and an
    // ambiguous or unknown name never reaches the card at all.
    prepare: async (args, ctx) => {
      validateEntryArgs(args);
      const resolved = await resolveProject(args, ctx.bearerToken);
      return { ...args, project: resolved.name, project_id: resolved.id };
    },
    execute: async (args, ctx) => {
      if (!ctx?.bearerToken) throw new Error('log_time_entry requires an authenticated context');

      const { entryDate, startTime, endTime, durationMinutes } = validateEntryArgs(args);
      const resolved = await resolveProject(args, ctx.bearerToken);

      const res = await axios.post(
        `${INTERNAL_BASE_URL}/api/time-entries`,
        {
          project_id: resolved.id,
          task_name: String(args.task_name ?? ''),
          description: String(args.description ?? ''),
          entry_date: entryDate,
          entry_time: startTime,
          entry_end_time: endTime,
          duration_hours: Math.round((durationMinutes / 60) * 100) / 100,
          billable: true,
        },
        { headers: { Authorization: ctx.bearerToken }, timeout: 15000, validateStatus: () => true }
      );
      if (res.status >= 400) {
        throw new Error(`Creating the time entry failed (${res.status}): ${JSON.stringify(res.data).slice(0, 300)}`);
      }
      return { created: true, project: resolved.name, project_id: resolved.id, entry: res.data };
    },
  });

  logger.info('[AI] Core composite tools registered (log_time_entry)');
}
