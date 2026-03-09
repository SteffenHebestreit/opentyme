/**
 * AI Insights Controller
 * Pre-aggregated query endpoints designed for LLM tool use.
 * All heavy lifting (sums, grouping, profit calculations) is done in SQL
 * so the LLM receives ready-to-use numbers rather than raw rows.
 */

import { Request, Response } from 'express';
import { pool } from '../../utils/database';
import { logger } from '../../utils/logger';

function userId(req: Request): string {
  return req.user!.id;
}

function dateClause(
  alias: string,
  col: string,
  start?: string,
  end?: string,
  params: unknown[] = []
): { clause: string; params: unknown[] } {
  const parts: string[] = [];
  if (start) { params.push(start); parts.push(`${alias}.${col} >= $${params.length}`); }
  if (end)   { params.push(end);   parts.push(`${alias}.${col} <= $${params.length}`); }
  return { clause: parts.length ? ' AND ' + parts.join(' AND ') : '', params };
}

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

// ── GET /api/insights/revenue-summary ───────────────────────────────────────

export async function getRevenueSummary(req: Request, res: Response): Promise<void> {
  const uid = userId(req);
  const { start_date, end_date, client_id, status, group_by } = req.query as Record<string, string | undefined>;

  try {
    const db = pool();

    // Guard: if client_id is provided, verify it's actually a client (not a user_id or typo)
    if (client_id) {
      const clientCheck = await db.query(
        `SELECT id, name FROM clients WHERE id = $1 AND user_id = $2`,
        [client_id, uid]
      );
      if (clientCheck.rows.length === 0) {
        res.status(400).json({
          error: `client_id "${client_id}" is not a valid client for this user. Use get_clients to retrieve the correct client UUIDs.`,
        });
        return;
      }
    }

    const params: unknown[] = [uid];
    const filters: string[] = [];

    if (start_date) { params.push(start_date); filters.push(`i.issue_date >= $${params.length}`); }
    if (end_date)   { params.push(end_date);   filters.push(`i.issue_date <= $${params.length}`); }
    if (client_id)  { params.push(client_id);  filters.push(`i.client_id = $${params.length}`); }
    if (status)     { params.push(status);     filters.push(`i.status = $${params.length}`); }

    const where = filters.length ? 'AND ' + filters.join(' AND ') : '';

    const summary = await db.query(
      `SELECT
         COUNT(*)::int                                                AS invoice_count,
         COALESCE(SUM(i.total_amount), 0)                            AS total_invoiced,
         COALESCE(SUM(CASE WHEN i.status = 'paid' THEN i.total_amount ELSE 0 END), 0)  AS total_paid,
         COALESCE(SUM(CASE WHEN i.status IN ('sent','overdue') THEN i.total_amount ELSE 0 END), 0) AS total_outstanding,
         COALESCE(SUM(CASE WHEN i.status = 'draft' THEN i.total_amount ELSE 0 END), 0) AS total_draft,
         COALESCE(SUM(i.sub_total), 0)  AS total_net,
         COALESCE(SUM(i.tax_amount), 0) AS total_tax
       FROM invoices i
       WHERE i.user_id = $1 ${where}`,
      params
    );

    // Grouping
    let groups: unknown[] = [];
    if (group_by === 'client') {
      const r = await db.query(
        `SELECT
           c.id AS id, c.name AS label,
           COUNT(i.id)::int AS invoice_count,
           COALESCE(SUM(i.total_amount), 0) AS total,
           COALESCE(SUM(CASE WHEN i.status = 'paid' THEN i.total_amount ELSE 0 END), 0) AS paid,
           COALESCE(SUM(CASE WHEN i.status IN ('sent','overdue') THEN i.total_amount ELSE 0 END), 0) AS outstanding
         FROM invoices i
         JOIN clients c ON c.id = i.client_id
         WHERE i.user_id = $1 ${where}
         GROUP BY c.id, c.name
         ORDER BY total DESC`,
        params
      );
      groups = r.rows.map(row => ({ ...row, total: Number(row.total), paid: Number(row.paid), outstanding: Number(row.outstanding) }));
    } else if (group_by === 'month') {
      const r = await db.query(
        `SELECT
           TO_CHAR(i.issue_date, 'YYYY-MM') AS label,
           COUNT(i.id)::int AS invoice_count,
           COALESCE(SUM(i.total_amount), 0) AS total,
           COALESCE(SUM(CASE WHEN i.status = 'paid' THEN i.total_amount ELSE 0 END), 0) AS paid,
           COALESCE(SUM(CASE WHEN i.status IN ('sent','overdue') THEN i.total_amount ELSE 0 END), 0) AS outstanding
         FROM invoices i
         WHERE i.user_id = $1 ${where}
         GROUP BY label
         ORDER BY label ASC`,
        params
      );
      groups = r.rows.map(row => ({ ...row, total: Number(row.total), paid: Number(row.paid), outstanding: Number(row.outstanding) }));
    } else if (group_by === 'status') {
      const r = await db.query(
        `SELECT
           i.status AS label,
           COUNT(i.id)::int AS invoice_count,
           COALESCE(SUM(i.total_amount), 0) AS total
         FROM invoices i
         WHERE i.user_id = $1 ${where}
         GROUP BY i.status
         ORDER BY total DESC`,
        params
      );
      groups = r.rows.map(row => ({ ...row, total: Number(row.total) }));
    }

    const row = summary.rows[0];
    res.json({
      invoice_count: Number(row.invoice_count),
      total_invoiced: Number(row.total_invoiced),
      total_paid: Number(row.total_paid),
      total_outstanding: Number(row.total_outstanding),
      total_draft: Number(row.total_draft),
      total_net: Number(row.total_net),
      total_tax: Number(row.total_tax),
      filters: { start_date, end_date, client_id, status, group_by },
      groups,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[Insights] getRevenueSummary: ${msg}`);
    res.status(500).json({ error: msg });
  }
}

// ── GET /api/insights/expense-summary ───────────────────────────────────────

export async function getExpenseSummary(req: Request, res: Response): Promise<void> {
  const uid = userId(req);
  const { start_date, end_date, category, project_id } = req.query as Record<string, string | undefined>;

  try {
    const db = pool();
    const params: unknown[] = [uid];
    const filters: string[] = [];

    if (start_date) { params.push(start_date); filters.push(`e.expense_date >= $${params.length}`); }
    if (end_date)   { params.push(end_date);   filters.push(`e.expense_date <= $${params.length}`); }
    if (category)   { params.push(category);   filters.push(`e.category = $${params.length}`); }
    if (project_id) { params.push(project_id); filters.push(`e.project_id = $${params.length}`); }

    const where = filters.length ? 'AND ' + filters.join(' AND ') : '';

    const summary = await db.query(
      `SELECT
         COUNT(*)::int                           AS entries_count,
         COALESCE(SUM(e.amount), 0)              AS total_gross,
         COALESCE(SUM(e.net_amount), 0)          AS total_net,
         COALESCE(SUM(e.tax_amount), 0)          AS total_tax
       FROM expenses e
       WHERE e.user_id = $1 AND e.status != 'cancelled' ${where}`,
      params
    );

    const byCategory = await db.query(
      `SELECT
         e.category,
         COUNT(*)::int                  AS entries_count,
         COALESCE(SUM(e.amount), 0)     AS total_gross,
         COALESCE(SUM(e.net_amount), 0) AS total_net
       FROM expenses e
       WHERE e.user_id = $1 AND e.status != 'cancelled' ${where}
       GROUP BY e.category
       ORDER BY total_gross DESC`,
      params
    );

    const row = summary.rows[0];
    res.json({
      entries_count: Number(row.entries_count),
      total_gross: Number(row.total_gross),
      total_net: Number(row.total_net),
      total_tax: Number(row.total_tax),
      filters: { start_date, end_date, category, project_id },
      by_category: byCategory.rows.map(r => ({
        category: r.category,
        entries_count: Number(r.entries_count),
        total_gross: Number(r.total_gross),
        total_net: Number(r.total_net),
      })),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[Insights] getExpenseSummary: ${msg}`);
    res.status(500).json({ error: msg });
  }
}

// ── GET /api/insights/profit-summary ────────────────────────────────────────

export async function getProfitSummary(req: Request, res: Response): Promise<void> {
  const uid = userId(req);
  const { start_date, end_date } = req.query as Record<string, string | undefined>;

  try {
    const db = pool();
    const params: unknown[] = [uid];
    const revFilters: string[] = [];
    const expFilters: string[] = [];

    if (start_date) {
      params.push(start_date);
      revFilters.push(`i.issue_date >= $${params.length}`);
      expFilters.push(`e.expense_date >= $${params.length}`);
    }
    if (end_date) {
      params.push(end_date);
      revFilters.push(`i.issue_date <= $${params.length}`);
      expFilters.push(`e.expense_date <= $${params.length}`);
    }

    const revWhere = revFilters.length ? 'AND ' + revFilters.join(' AND ') : '';
    const expWhere = expFilters.length ? 'AND ' + expFilters.join(' AND ') : '';

    const [revResult, expResult, hoursResult] = await Promise.all([
      db.query(
        `SELECT
           COALESCE(SUM(i.total_amount), 0)                                                            AS total_invoiced,
           COALESCE(SUM(CASE WHEN i.status = 'paid' THEN i.total_amount ELSE 0 END), 0)               AS revenue_paid,
           COALESCE(SUM(CASE WHEN i.status IN ('sent','overdue') THEN i.total_amount ELSE 0 END), 0)  AS revenue_outstanding,
           COALESCE(SUM(i.sub_total), 0)  AS revenue_net,
           COALESCE(SUM(i.tax_amount), 0) AS revenue_tax
         FROM invoices i WHERE i.user_id = $1 ${revWhere}`,
        params
      ),
      db.query(
        `SELECT
           COALESCE(SUM(e.amount), 0)     AS expenses_gross,
           COALESCE(SUM(e.net_amount), 0) AS expenses_net,
           COALESCE(SUM(e.tax_amount), 0) AS expenses_tax
         FROM expenses e WHERE e.user_id = $1 AND e.status != 'cancelled' ${expWhere}`,
        params
      ),
      db.query(
        `SELECT
           COALESCE(SUM(te.duration_hours), 0) AS total_hours,
           COALESCE(SUM(CASE WHEN te.is_billable THEN te.duration_hours ELSE 0 END), 0) AS billable_hours
         FROM time_entries te WHERE te.user_id = $1 ${revWhere.replace(/i\./g, 'te.entry_date >=').replace(/issue_date/g, 'entry_date')}`,
        params
      ).catch(() => ({ rows: [{ total_hours: 0, billable_hours: 0 }] })),
    ]);

    const rev = revResult.rows[0];
    const exp = expResult.rows[0];
    const hrs = hoursResult.rows[0];

    const revenuePaid = Number(rev.revenue_paid);
    const expensesNet = Number(exp.expenses_net);
    const grossProfit = revenuePaid - expensesNet;

    res.json({
      period: { start_date: start_date ?? null, end_date: end_date ?? null },
      revenue: {
        total_invoiced: Number(rev.total_invoiced),
        paid: revenuePaid,
        outstanding: Number(rev.revenue_outstanding),
        net: Number(rev.revenue_net),
        tax_collected: Number(rev.revenue_tax),
      },
      expenses: {
        total_gross: Number(exp.expenses_gross),
        total_net: expensesNet,
        tax_paid: Number(exp.expenses_tax),
      },
      profit: {
        gross_profit: grossProfit,
        gross_profit_margin_pct: revenuePaid > 0 ? Number(((grossProfit / revenuePaid) * 100).toFixed(2)) : 0,
        expense_ratio_pct: revenuePaid > 0 ? Number(((expensesNet / revenuePaid) * 100).toFixed(2)) : 0,
      },
      hours: {
        total: Number(hrs.total_hours),
        billable: Number(hrs.billable_hours),
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[Insights] getProfitSummary: ${msg}`);
    res.status(500).json({ error: msg });
  }
}

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
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[Insights] getClientOverview: ${msg}`);
    res.status(500).json({ error: msg });
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
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[Insights] getProjectOverview: ${msg}`);
    res.status(500).json({ error: msg });
  }
}
