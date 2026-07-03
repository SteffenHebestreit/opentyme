/**
 * Entity-overview insights endpoints (LLM tool use): a complete picture of one
 * client (hours + invoices + projects) or one project (hours, budget, invoices,
 * expenses). All aggregation happens in SQL so the model receives ready-to-use
 * numbers rather than raw rows.
 */

import { Request, Response } from 'express';
import { pool } from '../../../utils/database';
import { userId, handleInsightsError } from './insights-shared';

// ── GET /api/insights/client-overview ───────────────────────────────────────

export async function getClientOverview(req: Request, res: Response): Promise<void> {
  const uid = userId(req);
  const { client_id, start_date, end_date } = req.query as Record<string, string | undefined>;

  if (!client_id) {
    res.status(400).json({ error: 'client_id is required' });
    return;
  }

  try {
    const db = pool();
    const params: unknown[] = [uid, client_id];
    const invFilters: string[] = [];
    const teFilters: string[] = [];

    if (start_date) {
      params.push(start_date);
      invFilters.push(`i.issue_date >= $${params.length}`);
      teFilters.push(`te.entry_date >= $${params.length}`);
    }
    if (end_date) {
      params.push(end_date);
      invFilters.push(`i.issue_date <= $${params.length}`);
      teFilters.push(`te.entry_date <= $${params.length}`);
    }

    const invWhere = invFilters.length ? 'AND ' + invFilters.join(' AND ') : '';
    const teWhere  = teFilters.length  ? 'AND ' + teFilters.join(' AND ')  : '';

    const [clientRes, invRes, hoursRes, projectsRes] = await Promise.all([
      db.query(`SELECT id, name, email, company FROM clients WHERE id = $1 AND user_id = $2`, [client_id, uid]),
      db.query(
        `SELECT
           COUNT(*)::int AS invoice_count,
           COALESCE(SUM(i.total_amount), 0) AS total_invoiced,
           COALESCE(SUM(CASE WHEN i.status = 'paid' THEN i.total_amount ELSE 0 END), 0) AS total_paid,
           COALESCE(SUM(CASE WHEN i.status IN ('sent','overdue') THEN i.total_amount ELSE 0 END), 0) AS total_outstanding,
           COALESCE(SUM(CASE WHEN i.status = 'draft' THEN i.total_amount ELSE 0 END), 0) AS total_draft
         FROM invoices i WHERE i.user_id = $1 AND i.client_id = $2 ${invWhere}`,
        params
      ),
      db.query(
        `SELECT
           COALESCE(SUM(te.duration_hours), 0) AS total_hours,
           COALESCE(SUM(CASE WHEN te.is_billable THEN te.duration_hours ELSE 0 END), 0) AS billable_hours
         FROM time_entries te
         JOIN projects pr ON pr.id = te.project_id AND pr.client_id = $2
         WHERE te.user_id = $1 ${teWhere}`,
        params
      ),
      db.query(
        `SELECT id, name, status, hourly_rate FROM projects WHERE client_id = $1 AND user_id = $2 ORDER BY name`,
        [client_id, uid]
      ),
    ]);

    if (clientRes.rows.length === 0) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    const client = clientRes.rows[0];
    const inv    = invRes.rows[0];
    const hrs    = hoursRes.rows[0];

    res.json({
      client: { id: client.id, name: client.name, email: client.email, company: client.company },
      period: { start_date: start_date ?? null, end_date: end_date ?? null },
      hours: {
        total: Number(hrs.total_hours),
        billable: Number(hrs.billable_hours),
      },
      invoices: {
        count: Number(inv.invoice_count),
        total_invoiced: Number(inv.total_invoiced),
        total_paid: Number(inv.total_paid),
        total_outstanding: Number(inv.total_outstanding),
        total_draft: Number(inv.total_draft),
      },
      projects: projectsRes.rows,
    });
  } catch (err: unknown) {
    handleInsightsError(res, 'getClientOverview', err);
  }
}

// ── GET /api/insights/project-overview ──────────────────────────────────────

export async function getProjectOverview(req: Request, res: Response): Promise<void> {
  const uid = userId(req);
  const { project_id, start_date, end_date } = req.query as Record<string, string | undefined>;

  if (!project_id) {
    res.status(400).json({ error: 'project_id is required' });
    return;
  }

  try {
    const db = pool();
    const params: unknown[] = [uid, project_id];
    const filters: string[] = [];

    if (start_date) { params.push(start_date); filters.push(`te.entry_date >= $${params.length}`); }
    if (end_date)   { params.push(end_date);   filters.push(`te.entry_date <= $${params.length}`); }

    const where = filters.length ? 'AND ' + filters.join(' AND ') : '';

    const invFilters: string[] = [];
    const invParams: unknown[] = [uid, project_id];
    if (start_date) { invParams.push(start_date); invFilters.push(`i.issue_date >= $${invParams.length}`); }
    if (end_date)   { invParams.push(end_date);   invFilters.push(`i.issue_date <= $${invParams.length}`); }
    const invWhere = invFilters.length ? 'AND ' + invFilters.join(' AND ') : '';

    const [projRes, hoursRes, invRes, expRes] = await Promise.all([
      db.query(
        `SELECT p.id, p.name, p.status, p.hourly_rate, p.budget, p.estimated_hours, c.name AS client_name
         FROM projects p LEFT JOIN clients c ON c.id = p.client_id
         WHERE p.id = $1 AND p.user_id = $2`,
        [project_id, uid]
      ),
      db.query(
        `SELECT
           COALESCE(SUM(te.duration_hours), 0) AS total_hours,
           COALESCE(SUM(CASE WHEN te.is_billable THEN te.duration_hours ELSE 0 END), 0) AS billable_hours,
           COALESCE(SUM(CASE WHEN te.is_billable THEN te.duration_hours * COALESCE(te.hourly_rate, 0) ELSE 0 END), 0) AS billable_value
         FROM time_entries te WHERE te.user_id = $1 AND te.project_id = $2 ${where}`,
        params
      ),
      db.query(
        `SELECT
           COUNT(*)::int AS invoice_count,
           COALESCE(SUM(i.total_amount), 0) AS total_invoiced,
           COALESCE(SUM(CASE WHEN i.status = 'paid' THEN i.total_amount ELSE 0 END), 0) AS total_paid,
           COALESCE(SUM(CASE WHEN i.status IN ('sent','overdue') THEN i.total_amount ELSE 0 END), 0) AS total_outstanding
         FROM invoices i WHERE i.user_id = $1 AND i.project_id = $2 ${invWhere}`,
        invParams
      ),
      db.query(
        `SELECT COALESCE(SUM(e.amount), 0) AS total_expenses
         FROM expenses e WHERE e.user_id = $1 AND e.project_id = $2 AND e.status != 'cancelled'`,
        [uid, project_id]
      ),
    ]);

    if (projRes.rows.length === 0) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const proj = projRes.rows[0];
    const hrs  = hoursRes.rows[0];
    const inv  = invRes.rows[0];
    const exp  = expRes.rows[0];

    const budgetUsedPct = proj.budget && Number(hrs.total_hours) > 0 && proj.hourly_rate
      ? Number(((Number(hrs.total_hours) * Number(proj.hourly_rate)) / Number(proj.budget) * 100).toFixed(1))
      : null;

    const hoursUsedPct = proj.estimated_hours && Number(hrs.total_hours) > 0
      ? Number(((Number(hrs.total_hours) / Number(proj.estimated_hours)) * 100).toFixed(1))
      : null;

    res.json({
      project: {
        id: proj.id,
        name: proj.name,
        status: proj.status,
        client_name: proj.client_name,
        hourly_rate: proj.hourly_rate ? Number(proj.hourly_rate) : null,
        budget: proj.budget ? Number(proj.budget) : null,
        estimated_hours: proj.estimated_hours ? Number(proj.estimated_hours) : null,
      },
      period: { start_date: start_date ?? null, end_date: end_date ?? null },
      hours: {
        total: Number(hrs.total_hours),
        billable: Number(hrs.billable_hours),
        billable_value: Number(hrs.billable_value),
        budget_used_pct: budgetUsedPct,
        hours_used_pct: hoursUsedPct,
      },
      invoices: {
        count: Number(inv.invoice_count),
        total_invoiced: Number(inv.total_invoiced),
        total_paid: Number(inv.total_paid),
        total_outstanding: Number(inv.total_outstanding),
      },
      expenses: {
        total: Number(exp.total_expenses),
      },
    });
  } catch (err: unknown) {
    handleInsightsError(res, 'getProjectOverview', err);
  }
}
