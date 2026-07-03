/**
 * Financial insights endpoints (LLM tool use): revenue, expense and profit
 * summaries. All aggregation happens in SQL so the model receives ready-to-use
 * numbers rather than raw rows.
 */

import { Request, Response } from 'express';
import { pool } from '../../../utils/database';
import { userId, handleInsightsError } from './insights-shared';

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
    handleInsightsError(res, 'getRevenueSummary', err);
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
    handleInsightsError(res, 'getExpenseSummary', err);
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
    handleInsightsError(res, 'getProfitSummary', err);
  }
}
