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
 * (requiresApproval defaults to true), where the human-readable project name
 * also makes the approval card far easier to review than a UUID payload.
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

async function resolveProject(
  project: string,
  bearerToken: string
): Promise<{ id: string; name: string }> {
  const trimmed = project.trim();
  if (!trimmed) throw new Error('project is required (a project name or UUID)');
  if (UUID_RE.test(trimmed)) return { id: trimmed, name: trimmed };

  const res = await axios.get(`${INTERNAL_BASE_URL}/api/projects`, {
    headers: { Authorization: bearerToken },
    timeout: 15000,
  });
  const projects = (Array.isArray(res.data) ? res.data : res.data?.projects ?? []) as Array<{
    id: string;
    name: string;
  }>;

  const needle = trimmed.toLowerCase();
  const exact = projects.filter((p) => p.name.toLowerCase() === needle);
  if (exact.length === 1) return exact[0];
  const partial = projects.filter((p) => p.name.toLowerCase().includes(needle));
  if (partial.length === 1) return partial[0];

  const candidates = (exact.length > 1 ? exact : partial).map((p) => p.name);
  if (candidates.length > 1) {
    throw new Error(
      `Project name "${project}" is ambiguous — candidates: ${candidates.join(', ')}. Ask the user which one is meant.`
    );
  }
  throw new Error(
    `No project matches "${project}". Available projects: ${projects.map((p) => p.name).join(', ') || '(none)'}.`
  );
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
        entry_date: { type: 'string', description: 'Date of the work, YYYY-MM-DD' },
        start_time: { type: 'string', description: 'Start time, HH:MM (24h)' },
        end_time: { type: 'string', description: 'End time, HH:MM (24h), after start_time (same day)' },
        task_name: { type: 'string', description: 'Optional task label; omit if none' },
        description: { type: 'string', description: 'Optional description; omit if none' },
      },
      required: ['project', 'entry_date', 'start_time', 'end_time'],
    },
    execute: async (args, ctx) => {
      if (!ctx?.bearerToken) throw new Error('log_time_entry requires an authenticated context');

      const project = String(args.project ?? '');
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

      const resolved = await resolveProject(project, ctx.bearerToken);

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
      return { created: true, project: resolved.name, entry: res.data };
    },
  });

  logger.info('[AI] Core composite tools registered (log_time_entry)');
}
