/**
 * @fileoverview Date-effective project hourly rates
 *
 * The rate a project bills at is a timeline, not a value. Each row in
 * `project_rate_history` opens a period that runs until the next row's
 * `valid_from`; {@link ProjectRateService.getEffectiveRate} answers "what did
 * this project cost on date X".
 *
 * Time entries stamp their rate at creation from this timeline, so changing a
 * rate here never re-prices work that is already logged — which is the whole
 * point of the table.
 *
 * `projects.hourly_rate` is kept in sync as a denormalised "rate as of today"
 * so every existing read path (project list, forms, budget maths) keeps working
 * unchanged. It is derived, never the source of truth.
 *
 * @module services/business/project-rate
 */

import { getDbClient } from '../../utils/database';
import { logger } from '../../utils/logger';
import {
  ProjectRate,
  ProjectRatePeriod,
  UpdateProjectRateDto,
} from '../../models/business/project-rate.model';

/**
 * Manages the rate timeline of a project.
 *
 * Every method is scoped by `user_id` through a join on `projects`. This is
 * deliberate and must stay: ProjectService.findById has no tenant filter, so
 * using it to authorise would expose another tenant's rates.
 */
export class ProjectRateService {
  private db = getDbClient();

  /**
   * Confirm the project belongs to the caller.
   *
   * @returns The project's id and current rate, or null when it does not exist
   *          or belongs to someone else — the caller cannot tell the two apart,
   *          which is intended.
   */
  private async assertOwnedProject(
    projectId: string,
    userId: string
  ): Promise<{ id: string; hourly_rate: string | null } | null> {
    const result = await this.db.query(
      `SELECT id, hourly_rate FROM projects WHERE id = $1 AND user_id = $2`,
      [projectId, userId]
    );
    return result.rows[0] ?? null;
  }

  /**
   * Re-derive `projects.hourly_rate` from the timeline.
   *
   * Runs on the caller's transaction client so it commits atomically with the
   * change that triggered it.
   */
  private async syncCurrentRate(client: any, projectId: string): Promise<void> {
    await client.query(
      `UPDATE projects p
       SET hourly_rate = COALESCE(
             -- the period covering today
             (SELECT h.hourly_rate FROM project_rate_history h
              WHERE h.project_id = p.id AND h.valid_from <= CURRENT_DATE
              ORDER BY h.valid_from DESC LIMIT 1),
             -- only future periods exist yet: show the first one rather than
             -- blanking a rate the user just entered
             (SELECT h.hourly_rate FROM project_rate_history h
              WHERE h.project_id = p.id
              ORDER BY h.valid_from ASC LIMIT 1),
             -- timeline emptied entirely: keep whatever the project had, so the
             -- column never points at a rate that no longer exists
             p.hourly_rate
           ),
           updated_at = CURRENT_TIMESTAMP
       WHERE p.id = $1`,
      [projectId]
    );
  }

  /**
   * The full rate timeline of a project, oldest first, with each period's
   * exclusive end and a flag marking the period covering today.
   */
  async listRates(projectId: string, userId: string): Promise<ProjectRatePeriod[]> {
    if (!(await this.assertOwnedProject(projectId, userId))) return [];

    const result = await this.db.query(
      `SELECT id, user_id, project_id, hourly_rate, valid_from, note, created_at, updated_at,
              LEAD(valid_from) OVER (ORDER BY valid_from) AS valid_until
       FROM project_rate_history
       WHERE project_id = $1
       ORDER BY valid_from ASC`,
      [projectId]
    );

    // The current period is the last one that has already started. Computed
    // here rather than in SQL so future-dated periods are unambiguous.
    const startedIdx = result.rows.reduce(
      (acc: number, row: any, idx: number) =>
        this.toDateString(row.valid_from) <= this.today() ? idx : acc,
      -1
    );

    // Entries inside each period that do NOT carry its rate, grouped by the rate
    // they do carry — so the history can say "13 entries at 80,00 €" and offer
    // to align them, instead of the mismatch staying invisible.
    const deviations = await this.db.query(
      `SELECT h.id AS rate_id, te.hourly_rate AS rate,
              count(*)::int AS count, SUM(te.duration_hours)::float AS hours
       FROM project_rate_history h
       JOIN time_entries te
         ON te.project_id = h.project_id
        AND te.user_id = $2
        AND te.entry_date >= h.valid_from
        AND te.entry_date < COALESCE(
              (SELECT MIN(n.valid_from) FROM project_rate_history n
               WHERE n.project_id = h.project_id AND n.valid_from > h.valid_from),
              'infinity'::date)
        AND te.hourly_rate IS DISTINCT FROM h.hourly_rate
       WHERE h.project_id = $1
       GROUP BY h.id, te.hourly_rate
       ORDER BY count(*) DESC`,
      [projectId, userId]
    );
    const deviatingByRate = new Map<string, { rate: number | null; count: number; hours: number }[]>();
    deviations.rows.forEach((row: any) => {
      const list = deviatingByRate.get(row.rate_id) ?? [];
      list.push({ rate: row.rate === null ? null : parseFloat(row.rate), count: row.count, hours: row.hours });
      deviatingByRate.set(row.rate_id, list);
    });

    return result.rows.map((row: any, idx: number) => ({
      ...row,
      hourly_rate: parseFloat(row.hourly_rate),
      valid_from: this.toDateString(row.valid_from),
      valid_until: row.valid_until ? this.toDateString(row.valid_until) : null,
      is_current: idx === startedIdx,
      deviating: deviatingByRate.get(row.id) ?? [],
    }));
  }

  /**
   * The rate effective on a given date — what a time entry on that date is
   * stamped with.
   *
   * Falls back to `projects.hourly_rate` only when the project has no timeline
   * at all, which after the startup backfill means a project whose rate was
   * never set.
   *
   * @param date - YYYY-MM-DD; defaults to today.
   * @returns The rate, or null when none applies (e.g. the entry predates the
   *          first agreed rate).
   */
  async getEffectiveRate(
    projectId: string,
    userId: string,
    date?: string
  ): Promise<number | null> {
    const project = await this.assertOwnedProject(projectId, userId);
    if (!project) return null;

    const onDate = date || this.today();
    const result = await this.db.query(
      `SELECT
         (SELECT h.hourly_rate
          FROM project_rate_history h
          WHERE h.project_id = $1 AND h.valid_from <= $2
          ORDER BY h.valid_from DESC
          LIMIT 1) AS effective_rate,
         (SELECT h.hourly_rate
          FROM project_rate_history h
          WHERE h.project_id = $1
          ORDER BY h.valid_from ASC
          LIMIT 1) AS earliest_rate`,
      [projectId, onDate]
    );

    const { effective_rate: effectiveRate, earliest_rate: earliestRate } = result.rows[0];
    if (effectiveRate !== null && effectiveRate !== undefined) return parseFloat(effectiveRate);

    // Work dated before the first agreed rate: price it at the EARLIEST rate on
    // the timeline, not at today's. Returning null here would leave the entry
    // unstamped, and invoicing COALESCEs an unstamped entry to the project's
    // current rate — reintroducing exactly the retroactive pricing this feature
    // removes, one layer up where it is invisible. The earliest rate is stable:
    // it never changes when a later rate is agreed.
    if (earliestRate !== null && earliestRate !== undefined) return parseFloat(earliestRate);

    // No timeline at all — fall back to the project's own rate.
    return project.hourly_rate !== null ? parseFloat(project.hourly_rate) : null;
  }

  /**
   * Open a new rate period.
   *
   * The insert and the `projects.hourly_rate` resync share one transaction, so
   * the timeline and the denormalised current rate can never disagree. Note
   * `getDbClient()` hands back a Pool — issuing BEGIN on it would not be a
   * transaction at all, hence the explicit connect().
   *
   * @throws If a period already starts on that date (one rate per project per day).
   */
  async addRate(
    projectId: string,
    userId: string,
    data: { hourly_rate: number; valid_from: string; note?: string | null },
    options: { applyToExisting?: boolean } = {}
  ): Promise<(ProjectRate & { repriced_entries?: number }) | null> {
    if (!(await this.assertOwnedProject(projectId, userId))) return null;

    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      const following = await this.snapshotFollowingEntries(client, projectId, userId, options);

      const inserted = await client.query(
        `INSERT INTO project_rate_history (user_id, project_id, hourly_rate, valid_from, note)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [userId, projectId, data.hourly_rate, data.valid_from, data.note || null]
      );

      const repriced = await this.restampEntries(client, following);

      await this.syncCurrentRate(client, projectId);
      await client.query('COMMIT');

      return { ...this.parseRow(inserted.rows[0]), repriced_entries: repriced };
    } catch (error: any) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (error?.code === '23505') {
        throw new Error('A rate already starts on that date for this project.');
      }
      logger.error('Error adding project rate:', error);
      throw new Error(`Failed to add project rate: ${error.message}`);
    } finally {
      client.release();
    }
  }

  /**
   * Correct an existing rate period (a typo in the agreed rate or its start).
   *
   * Entries that followed the timeline follow the correction too; entries
   * priced individually keep their rate (see {@link snapshotFollowingEntries}).
   */
  async updateRate(
    rateId: string,
    userId: string,
    data: UpdateProjectRateDto,
    options: { applyToExisting?: boolean } = {}
  ): Promise<(ProjectRate & { repriced_entries?: number }) | null> {
    const setParts: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.hourly_rate !== undefined) {
      setParts.push(`hourly_rate = $${paramIndex++}`);
      values.push(data.hourly_rate);
    }
    if (data.valid_from !== undefined) {
      setParts.push(`valid_from = $${paramIndex++}`);
      values.push(data.valid_from);
    }
    if (data.note !== undefined) {
      setParts.push(`note = $${paramIndex++}`);
      values.push(data.note || null);
    }
    if (setParts.length === 0) return this.findRateById(rateId, userId);

    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      const owner = await client.query(
        `SELECT h.project_id FROM project_rate_history h
         JOIN projects p ON p.id = h.project_id
         WHERE h.id = $1 AND p.user_id = $2`,
        [rateId, userId]
      );
      if (owner.rows.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }
      const following = await this.snapshotFollowingEntries(client, owner.rows[0].project_id, userId, options);

      // No updated_at trigger exists on this table (only the original
      // pg_dump-era tables have one), so it is set explicitly.
      const result = await client.query(
        `UPDATE project_rate_history h
         SET ${setParts.join(', ')}, updated_at = CURRENT_TIMESTAMP
         FROM projects p
         WHERE h.id = $${paramIndex} AND h.project_id = p.id AND p.user_id = $${paramIndex + 1}
         RETURNING h.*`,
        [...values, rateId, userId]
      );

      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }

      const updated = this.parseRow(result.rows[0]);
      const repriced = await this.restampEntries(client, following);

      await this.syncCurrentRate(client, result.rows[0].project_id);
      await client.query('COMMIT');

      return { ...updated, repriced_entries: repriced };
    } catch (error: any) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (error?.code === '23505') {
        throw new Error('A rate already starts on that date for this project.');
      }
      logger.error('Error updating project rate:', error);
      throw new Error(`Failed to update project rate: ${error.message}`);
    } finally {
      client.release();
    }
  }

  /**
   * Remove a rate period. Entries that followed it fall back to the rate the
   * timeline now gives their date (usually the period before); individually
   * priced entries keep their rate.
   */
  async deleteRate(
    rateId: string,
    userId: string,
    options: { applyToExisting?: boolean } = {}
  ): Promise<boolean> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      const owner = await client.query(
        `SELECT h.project_id FROM project_rate_history h
         JOIN projects p ON p.id = h.project_id
         WHERE h.id = $1 AND p.user_id = $2`,
        [rateId, userId]
      );
      const following = owner.rows.length
        ? await this.snapshotFollowingEntries(client, owner.rows[0].project_id, userId, options)
        : [];

      const result = await client.query(
        `DELETE FROM project_rate_history h
         USING projects p
         WHERE h.id = $1 AND h.project_id = p.id AND p.user_id = $2
         RETURNING h.project_id`,
        [rateId, userId]
      );

      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return false;
      }

      await this.restampEntries(client, following);
      await this.syncCurrentRate(client, result.rows[0].project_id);
      await client.query('COMMIT');
      return true;
    } catch (error: any) {
      await client.query('ROLLBACK').catch(() => undefined);
      logger.error('Error deleting project rate:', error);
      throw new Error(`Failed to delete project rate: ${error.message}`);
    } finally {
      client.release();
    }
  }

  /**
   * SQL for the rate the timeline gives a date: the period covering it, else
   * the earliest period (work dated before the first agreed rate). Mirrors
   * {@link getEffectiveRate}.
   */
  private timelineRateSql(dateExpr: string, projectExpr: string): string {
    return `COALESCE(
      (SELECT h.hourly_rate FROM project_rate_history h
       WHERE h.project_id = ${projectExpr} AND h.valid_from <= ${dateExpr}
       ORDER BY h.valid_from DESC LIMIT 1),
      (SELECT h.hourly_rate FROM project_rate_history h
       WHERE h.project_id = ${projectExpr}
       ORDER BY h.valid_from ASC LIMIT 1)
    )`;
  }

  /**
   * The entries that currently FOLLOW the rate timeline — priced exactly at the
   * rate the timeline gives their date.
   *
   * This is what makes a rate "valid from" a date actually mean it: every entry
   * dated on or after that day moves to the new rate, including entries logged
   * before the change was made (an extension signed on the 10th, valid from the
   * 1st). Entries dated before the start are untouched, because the timeline
   * rate for their date does not change.
   *
   * Entries priced individually — a goodwill hour at 0 €, a special rate set by
   * hand — do not equal their timeline rate, so they are not in this list and
   * keep their price.
   *
   * Taken BEFORE the timeline changes; {@link restampEntries} applies it after.
   * Empty when the caller opted out (`applyToExisting: false`).
   */
  private async snapshotFollowingEntries(
    client: any,
    projectId: string,
    userId: string,
    options: { applyToExisting?: boolean }
  ): Promise<string[]> {
    if (options.applyToExisting === false) return [];
    const result = await client.query(
      `SELECT te.id
       FROM time_entries te
       WHERE te.project_id = $1
         AND te.user_id = $2
         AND te.hourly_rate IS NOT DISTINCT FROM ${this.timelineRateSql('te.entry_date', 'te.project_id')}`,
      [projectId, userId]
    );
    return result.rows.map((row: any) => row.id);
  }

  /**
   * Moves the given (previously following) entries onto the rate the CHANGED
   * timeline now gives their date. Only entries whose rate actually changes are
   * written, so entries outside the changed range keep their updated_at.
   *
   * @returns How many entries were re-priced.
   */
  private async restampEntries(client: any, entryIds: string[]): Promise<number> {
    if (entryIds.length === 0) return 0;
    const timelineRate = this.timelineRateSql('te.entry_date', 'te.project_id');
    const result = await client.query(
      `UPDATE time_entries te
       SET hourly_rate = ${timelineRate}
       WHERE te.id = ANY($1::uuid[])
         AND te.hourly_rate IS DISTINCT FROM ${timelineRate}`,
      [entryIds]
    );
    return result.rowCount ?? 0;
  }

  /**
   * Brings the entries of one period in line with its rate, on explicit request
   * from the rate history ("13 entries at 80,00 € — align to 85,00 €").
   *
   * For entries that did not follow a change — e.g. left behind by an earlier
   * version that did not re-price on its own. `fromRate` limits it to entries at
   * that one rate, so an individually priced goodwill entry is not swept along.
   *
   * @returns How many entries were changed, or null if the period is not the caller's.
   */
  async alignPeriodEntries(rateId: string, userId: string, fromRate?: number): Promise<number | null> {
    const period = await this.db.query(
      `SELECT h.project_id, h.hourly_rate, h.valid_from,
              (SELECT MIN(n.valid_from) FROM project_rate_history n
               WHERE n.project_id = h.project_id AND n.valid_from > h.valid_from) AS next_from
       FROM project_rate_history h
       JOIN projects p ON p.id = h.project_id
       WHERE h.id = $1 AND p.user_id = $2`,
      [rateId, userId]
    );
    if (period.rows.length === 0) return null;
    const { project_id: projectId, hourly_rate: rate, valid_from: validFrom, next_from: nextFrom } = period.rows[0];

    const result = await this.db.query(
      `UPDATE time_entries te
       SET hourly_rate = $3
       WHERE te.project_id = $1
         AND te.user_id = $2
         AND te.entry_date >= $4::date
         AND ($5::date IS NULL OR te.entry_date < $5::date)
         AND te.hourly_rate IS DISTINCT FROM $3
         AND ($6::numeric IS NULL OR te.hourly_rate = $6::numeric)`,
      [projectId, userId, rate, validFrom, nextFrom, fromRate ?? null]
    );
    return result.rowCount ?? 0;
  }

  /**
   * What a new rate starting on `validFrom` would touch — shown BEFORE saving.
   *
   * - `previous_rate`: what that date costs today, so the UI can show 85 → 95 (+11,8 %)
   * - `period_end`: where the new period would stop (the next agreed rate), if anywhere
   * - `existing_period`: a period already starting that very day, which the
   *   change would replace rather than conflict with
   * - `logged`: entries already inside the new period — those following the
   *   timeline move to the new rate on save, individually priced ones stay
   * - `invoices_since`: sent/paid invoices for this client issued on or after
   *   the date. Entries are not linked to invoices, so this is the honest
   *   signal: "some of these may already be billed — check before moving them".
   *
   * @returns null when the project does not exist or belongs to someone else.
   */
  async getImpact(projectId: string, userId: string, validFrom: string) {
    if (!(await this.assertOwnedProject(projectId, userId))) return null;

    const [previousRate, bounds, logged, invoices] = await Promise.all([
      this.getEffectiveRate(projectId, userId, validFrom),
      this.db.query(
        `SELECT
           (SELECT to_char(MIN(h.valid_from), 'YYYY-MM-DD') FROM project_rate_history h
            WHERE h.project_id = $1 AND h.valid_from > $2::date) AS period_end,
           (SELECT json_build_object('id', h.id, 'hourly_rate', h.hourly_rate)
            FROM project_rate_history h
            WHERE h.project_id = $1 AND h.valid_from = $2::date) AS existing_period`,
        [projectId, validFrom]
      ),
      this.db.query(
        `SELECT count(*)::int AS count,
                COALESCE(SUM(te.duration_hours), 0)::float AS hours,
                count(*) FILTER (
                  WHERE te.hourly_rate IS NOT DISTINCT FROM ${this.timelineRateSql('te.entry_date', 'te.project_id')}
                )::int AS following
         FROM time_entries te
         WHERE te.project_id = $1 AND te.user_id = $2
           AND te.entry_date >= $3::date
           AND te.entry_date < COALESCE(
             (SELECT MIN(h.valid_from) FROM project_rate_history h
              WHERE h.project_id = $1 AND h.valid_from > $3::date),
             'infinity'::date
           )`,
        [projectId, userId, validFrom]
      ),
      this.db.query(
        `SELECT count(*)::int AS count
         FROM invoices i
         JOIN projects p ON p.id = $1
         WHERE i.user_id = $2
           AND i.client_id = p.client_id
           AND (i.project_id IS NULL OR i.project_id = $1)
           AND i.issue_date >= $3::date
           AND i.status NOT IN ('draft', 'cancelled')`,
        [projectId, userId, validFrom]
      ),
    ]);

    const existing = bounds.rows[0]?.existing_period;
    return {
      valid_from: validFrom,
      previous_rate: previousRate,
      period_end: bounds.rows[0]?.period_end ?? null,
      existing_period: existing
        ? { id: existing.id, hourly_rate: parseFloat(existing.hourly_rate) }
        : null,
      logged: {
        count: logged.rows[0].count,
        hours: logged.rows[0].hours,
        // Moved onto the new rate on save (they follow the timeline) …
        following: logged.rows[0].following,
        // … and kept, because they were priced individually.
        deviating: logged.rows[0].count - logged.rows[0].following,
      },
      invoices_since: invoices.rows[0].count,
    };
  }

  /**
   * A single rate period, scoped to its owner.
   */
  async findRateById(rateId: string, userId: string): Promise<ProjectRate | null> {
    const result = await this.db.query(
      `SELECT h.*
       FROM project_rate_history h
       JOIN projects p ON p.id = h.project_id
       WHERE h.id = $1 AND p.user_id = $2`,
      [rateId, userId]
    );
    return result.rows.length > 0 ? this.parseRow(result.rows[0]) : null;
  }

  /** pg returns numeric as a string and date as a Date; normalise both. */
  private parseRow(row: any): ProjectRate {
    return {
      ...row,
      hourly_rate: parseFloat(row.hourly_rate),
      valid_from: this.toDateString(row.valid_from),
    };
  }

  private toDateString(value: Date | string): string {
    if (typeof value === 'string') return value.slice(0, 10);
    return value.toISOString().slice(0, 10);
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }
}

export const projectRateService = new ProjectRateService();
