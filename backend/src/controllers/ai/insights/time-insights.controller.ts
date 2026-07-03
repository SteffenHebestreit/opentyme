/**
 * Time-tracking insights endpoints (LLM tool use): aggregated time summary and
 * the per-weekday working-pattern analysis used for schedule replication.
 * All aggregation happens in SQL / server-side so the model receives
 * ready-to-use numbers rather than raw rows.
 */

import { Request, Response } from 'express';
import { pool } from '../../../utils/database';
import { logger } from '../../../utils/logger';
import { userId } from './insights-shared';

// ── GET /api/insights/time-summary ──────────────────────────────────────────

export async function getTimeSummary(req: Request, res: Response): Promise<void> {
  const uid = userId(req);
  const { start_date, end_date, project_id, client_id, is_billable } = req.query as Record<string, string | undefined>;

  try {
    const db = pool();
    // Guard: validate client_id and project_id belong to the user
    if (client_id) {
      const check = await db.query(`SELECT id FROM clients WHERE id = $1 AND user_id = $2`, [client_id, uid]);
      if (check.rows.length === 0) {
        res.status(400).json({ error: `client_id "${client_id}" not found. Use get_clients to retrieve valid client UUIDs.` });
        return;
      }
    }
    if (project_id) {
      const check = await db.query(`SELECT id FROM projects WHERE id = $1 AND user_id = $2`, [project_id, uid]);
      if (check.rows.length === 0) {
        res.status(400).json({ error: `project_id "${project_id}" not found. Use get_projects to retrieve valid project UUIDs.` });
        return;
      }
    }

    const params: unknown[] = [uid];
    const filters: string[] = [];

    if (start_date) { params.push(start_date); filters.push(`te.entry_date >= $${params.length}`); }
    if (end_date)   { params.push(end_date);   filters.push(`te.entry_date <= $${params.length}`); }
    if (project_id) { params.push(project_id); filters.push(`te.project_id = $${params.length}`); }
    if (is_billable !== undefined) { params.push(is_billable === 'true'); filters.push(`te.is_billable = $${params.length}`); }

    // client_id join
    const clientJoin = client_id
      ? `JOIN projects pr ON pr.id = te.project_id AND pr.client_id = '${client_id.replace(/'/g, '')}'`
      : '';

    const where = filters.length ? 'AND ' + filters.join(' AND ') : '';

    const summary = await db.query(
      `SELECT
         COUNT(*)::int                                                        AS entries_count,
         COALESCE(SUM(te.duration_hours), 0)                                 AS total_hours,
         COALESCE(SUM(CASE WHEN te.is_billable THEN te.duration_hours ELSE 0 END), 0) AS billable_hours,
         COALESCE(SUM(CASE WHEN NOT te.is_billable THEN te.duration_hours ELSE 0 END), 0) AS non_billable_hours,
         COALESCE(SUM(CASE WHEN te.is_billable THEN te.duration_hours * COALESCE(te.hourly_rate, 0) ELSE 0 END), 0) AS billable_value
       FROM time_entries te
       ${clientJoin}
       WHERE te.user_id = $1 ${where}`,
      params
    );

    const byProject = await db.query(
      `SELECT
         p.id   AS project_id,
         p.name AS project_name,
         c.name AS client_name,
         COALESCE(SUM(te.duration_hours), 0) AS total_hours,
         COALESCE(SUM(CASE WHEN te.is_billable THEN te.duration_hours ELSE 0 END), 0) AS billable_hours,
         COALESCE(SUM(CASE WHEN te.is_billable THEN te.duration_hours * COALESCE(te.hourly_rate, 0) ELSE 0 END), 0) AS billable_value
       FROM time_entries te
       JOIN projects p ON p.id = te.project_id
       LEFT JOIN clients c ON c.id = p.client_id
       ${clientJoin ? 'JOIN projects pr ON pr.id = te.project_id AND pr.client_id = $' + (params.length + 1) : ''}
       WHERE te.user_id = $1 ${where}
       GROUP BY p.id, p.name, c.name
       ORDER BY total_hours DESC`,
      client_id ? [...params, client_id] : params
    );

    const row = summary.rows[0];
    res.json({
      total_hours: Number(row.total_hours),
      billable_hours: Number(row.billable_hours),
      non_billable_hours: Number(row.non_billable_hours),
      billable_value: Number(row.billable_value),
      entries_count: Number(row.entries_count),
      filters: { start_date, end_date, project_id, client_id, is_billable },
      by_project: byProject.rows.map(r => ({
        project_id: r.project_id,
        project_name: r.project_name,
        client_name: r.client_name,
        total_hours: Number(r.total_hours),
        billable_hours: Number(r.billable_hours),
        billable_value: Number(r.billable_value),
      })),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[Insights] getTimeSummary: ${msg}`);
    res.status(500).json({ error: msg });
  }
}

// ── GET /api/insights/time-pattern ──────────────────────────────────────────

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "HH:MM[:SS]" → minutes since midnight (null if unparseable). */
function timeToMinutes(t: string | null): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** minutes since midnight → "HH:MM", rounded to the nearest 5 minutes. */
function minutesToTime(min: number): string {
  const r = Math.round(min / 5) * 5;
  return `${String(Math.floor(r / 60) % 24).padStart(2, '0')}:${String(r % 60).padStart(2, '0')}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Computes the user's typical working pattern PER WEEKDAY for a project from real
 * historical entries: average daily hours and the typical blocks (start/end/hours)
 * by position. The gaps between consecutive blocks are the recurring breaks. This
 * lets the assistant reproduce real structure instead of inventing generic blocks.
 */
export async function getTimePattern(req: Request, res: Response): Promise<void> {
  const uid = userId(req);
  const { project_id } = req.query as Record<string, string | undefined>;
  const weeks = Math.min(52, Math.max(1, parseInt((req.query.weeks as string) || '8', 10) || 8));

  try {
    const db = pool();
    if (project_id) {
      const check = await db.query(`SELECT id FROM projects WHERE id = $1 AND user_id = $2`, [project_id, uid]);
      if (check.rows.length === 0) {
        res.status(400).json({ error: `project_id "${project_id}" not found. Use get_projects to retrieve valid project UUIDs.` });
        return;
      }
    }

    const params: unknown[] = [uid, weeks * 7];
    let filter = '';
    if (project_id) { params.push(project_id); filter = `AND project_id = $${params.length}`; }

    const result = await db.query(
      `SELECT entry_date, entry_time, entry_end_time, duration_hours
       FROM time_entries
       WHERE user_id = $1
         AND entry_date >= CURRENT_DATE - ($2::int * INTERVAL '1 day')
         ${filter}
       ORDER BY entry_date, entry_time`,
      params
    );

    type Block = { startMin: number | null; endMin: number | null; hours: number };
    const days = new Map<string, { dow: number; blocks: Block[] }>();
    for (const row of result.rows) {
      // pg parses DATE at process-LOCAL midnight; format with LOCAL components
      // (not toISOString/UTC) so the calendar date survives any container TZ.
      const d = row.entry_date;
      const dateStr =
        d instanceof Date
          ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
          : String(d).slice(0, 10);
      let day = days.get(dateStr);
      if (!day) {
        day = { dow: new Date(dateStr + 'T00:00:00Z').getUTCDay(), blocks: [] };
        days.set(dateStr, day);
      }
      day.blocks.push({
        startMin: timeToMinutes(row.entry_time),
        endMin: timeToMinutes(row.entry_end_time),
        hours: Number(row.duration_hours) || 0,
      });
    }

    const byDow = new Map<number, Array<{ totalHours: number; blocks: Block[] }>>();
    for (const day of days.values()) {
      const arr = byDow.get(day.dow) ?? [];
      arr.push({ totalHours: day.blocks.reduce((s, b) => s + b.hours, 0), blocks: day.blocks });
      byDow.set(day.dow, arr);
    }

    const weekdays = [];
    for (let dow = 1; dow <= 5; dow++) {
      const sample = byDow.get(dow);
      if (!sample || sample.length === 0) continue;
      const sampleDays = sample.length;
      const maxBlocks = Math.max(...sample.map((d) => d.blocks.length));

      const typicalBlocks = [];
      for (let pos = 0; pos < maxBlocks; pos++) {
        const present = sample.filter((d) => d.blocks[pos]?.startMin != null && d.blocks[pos]?.endMin != null);
        if (present.length === 0) continue;
        typicalBlocks.push({
          position: pos + 1,
          start: minutesToTime(present.reduce((s, d) => s + (d.blocks[pos].startMin as number), 0) / present.length),
          end: minutesToTime(present.reduce((s, d) => s + (d.blocks[pos].endMin as number), 0) / present.length),
          avg_hours: round2(present.reduce((s, d) => s + d.blocks[pos].hours, 0) / present.length),
          occurrence: round2(present.length / sampleDays),
        });
      }

      weekdays.push({
        weekday: WEEKDAY_NAMES[dow],
        iso_weekday: dow,
        sample_days: sampleDays,
        avg_total_hours: round2(sample.reduce((s, d) => s + d.totalHours, 0) / sampleDays),
        avg_blocks_per_day: round2(sample.reduce((s, d) => s + d.blocks.length, 0) / sampleDays),
        typical_blocks: typicalBlocks,
      });
    }

    res.json({
      project_id: project_id ?? null,
      lookback_weeks: weeks,
      total_days_sampled: days.size,
      weekdays,
      note: 'Per-weekday averages from REAL entries. Reproduce these blocks exactly when back-logging; the gaps between consecutive blocks are the recurring breaks (e.g. kindergarten pickup). Do not invent generic blocks. Skip weekdays not listed (no historical work) and days that already have entries.',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[Insights] getTimePattern: ${msg}`);
    res.status(500).json({ error: msg });
  }
}
