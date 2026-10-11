import { getDbClient } from '../../utils/database';
import {
  CreateProjectDto,
  UpdateProjectDto,
  Project as IProject,
  ProjectStatus  // Import the type if needed directly
} from '../../models/business/project.model';
import { BaseClient } from '../../models/business/client.model'; // Explicitly import BaseClient
import { logger } from '../../utils/logger';
import { isUuid, ownsRow } from '../ownership.service';

const db = getDbClient();

/**
 * Normalises a date to the YYYY-MM-DD form Postgres' date type expects.
 *
 * Joi turns an ISO date in the request body into a Date object, and
 * String(new Date(...)) yields "Wed Jan 01 2026 ..." — slicing that gives
 * "Wed Jan 01", which Postgres rejects with a DateTimeParseError.
 *
 * @param value - Date, 'YYYY-MM-DD' string, or nullish
 * @returns The date-only string, or null
 */
export function toDateOnly(value: any): string | null {
  if (!value) return null;
  // pg returns a DATE column as a Date at LOCAL midnight. toISOString() would
  // convert that to UTC and land on the previous day for any server timezone
  // east of UTC, so read the local calendar parts instead.
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const text = String(value);
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : null;
}

/**
 * Service for managing project-related business logic and database operations.
 * Handles CRUD operations for projects in a multi-tenant environment.
 * Projects are associated with clients and can include billing rates, timelines, and status tracking.
 * 
 * @class ProjectService
 */
export class ProjectService {

  /**
   * Creates a new project in the database.
   * Associates the project with a client and sets default values for optional fields.
   * 
   * @async
   * @param {CreateProjectDto} projectData - The project data to create
   * @returns {Promise<IProject>} The created project with generated ID, timestamps, and client details
   * @throws {Error} If client_id is invalid (foreign key violation)
   * @throws {Error} If the database operation fails
   * 
   * @example
   * const newProject = await projectService.create({
   *   user_id: '123e4567-e89b-12d3-a456-426614174000',
   *   name: 'Website Redesign',
   *   client_id: 'client-uuid',
   *   status: 'active',
   *   hourly_rate: 150,
   *   currency: 'USD'
   * });
   */
  async create(projectData: CreateProjectDto): Promise<IProject> {
    const db = getDbClient();
    // The client must be the project owner's own. The foreign key alone would
    // accept another tenant's client, whose details every read of the project
    // then returns.
    if (projectData.client_id && !(await ownsRow('clients', projectData.client_id, projectData.user_id))) {
      throw new Error('Invalid client ID specified.');
    }
    const queryText = `
      INSERT INTO projects (user_id, name, description, client_id, status, start_date, end_date, hourly_rate, currency, budget, rate_type, estimated_hours, recurring_payment, tags)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) 
      RETURNING id, user_id, name, description, client_id, status, start_date, end_date, hourly_rate, currency, budget, rate_type, estimated_hours, recurring_payment, tags, created_at, updated_at
    `;
    const values = [
      projectData.user_id, // Multi-tenant: user who owns the project
      projectData.name,
      projectData.description || null,
      projectData.client_id, // Must be a valid UUID from the clients table
      projectData.status || 'active',
      projectData.start_date || null,
      projectData.end_date || null,
      projectData.hourly_rate || null,
      projectData.currency || 'USD',
      projectData.budget || null,
      projectData.rate_type || null,
      projectData.estimated_hours || null,
      projectData.recurring_payment || false,
      projectData.tags || null,
    ];

    try {
      const result = await db.query(queryText, values);

      // Open the project's rate timeline straight away. Without this the rate
      // would live only on projects.hourly_rate, and the first edit made
      // through the rate timeline would silently disagree with it.
      if (result.rows[0]?.hourly_rate !== null && result.rows[0]?.hourly_rate !== undefined) {
        await this.recordRatePeriod(
          db,
          result.rows[0].id,
          result.rows[0].user_id,
          result.rows[0].hourly_rate,
          toDateOnly(projectData.start_date),
          'Initial rate'
        );
      }

      // Fetch associated client details
      return await this.getProjectWithClient(result.rows[0]);
    } catch (error) {
        logger.error('Error creating project:', error);
        if ((error as any).code === '23503') { // foreign_key_violation for client_id
            throw new Error('Invalid client ID specified.');
        }
        // Handle other specific errors like unique constraint violations if necessary
        throw new Error(`Failed to create project: ${(error as any).message}`);
    }
  }

  /**
   * Retrieves all projects from the database with optional filtering.
   * Returns projects ordered by creation date (newest first).
   * Each project includes full client details if associated with a client.
   * 
   * @async
   * @param {Object} filters - Optional filters for projects
   * @param {string} filters.status - Filter by project status (not_started, active, on_hold, completed)
   * @param {string} filters.client_id - Filter by client UUID
   * @param {string} filters.search - Search in project name or description (case-insensitive)
   * @returns {Promise<IProject[]>} Array of filtered projects with client details
   * @throws {Error} If the query fails
   * 
   * @example
   * const projects = await projectService.findAll();
   * const activeProjects = await projectService.findAll({ status: 'active' });
   * const searchResults = await projectService.findAll({ search: 'website' });
   */
  async findAll(user_id: string, filters?: {
    status?: string;
    client_id?: string;
    search?: string;
  }): Promise<IProject[]> {
    const db = getDbClient();
    
    // Build WHERE clause based on filters
    // ALWAYS filter by user_id for multi-tenant isolation
    const conditions: string[] = [`p.user_id = $1`];
    const values: any[] = [user_id];
    let paramIndex = 2;

    if (filters?.status) {
      conditions.push(`p.status = $${paramIndex++}`);
      values.push(filters.status);
    }
    
    if (filters?.client_id) {
      conditions.push(`p.client_id = $${paramIndex++}`);
      values.push(filters.client_id);
    }
    
    if (filters?.search) {
      conditions.push(`(p.name ILIKE $${paramIndex} OR p.description ILIKE $${paramIndex})`);
      values.push(`%${filters.search}%`);
      paramIndex++;
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // next_rate / next_rate_from: the earliest SCHEDULED rate period, so the
    // project list can show "95,00 € ab 01.01.2027" next to today's rate. A
    // scheduled raise that nobody can see is one nobody can double-check.
    const queryText = `
      SELECT p.id, p.user_id, p.name, p.description, p.client_id, p.status, p.start_date, p.end_date, 
             p.hourly_rate, p.budget, p.rate_type, p.estimated_hours, p.currency, p.tags, p.recurring_payment, p.created_at, p.updated_at,
             nr.hourly_rate AS next_rate, to_char(nr.valid_from, 'YYYY-MM-DD') AS next_rate_from
      FROM projects p
      LEFT JOIN LATERAL (
        SELECT h.hourly_rate, h.valid_from
        FROM project_rate_history h
        WHERE h.project_id = p.id AND h.valid_from > CURRENT_DATE
        ORDER BY h.valid_from ASC
        LIMIT 1
      ) nr ON true
      ${whereClause}
      ORDER BY p.created_at DESC
    `;
    
    try {
      const result = await db.query(queryText, values);
      
      // Process each project to include full client details
      const projectPromises = result.rows.map(async (row: any) => {
        return await this.getProjectWithClient(row);
      });

      // Wait for all projects to be processed with their client details
      const projects: IProject[] = await Promise.all(projectPromises);
      return projects;
    } catch (error) {
        logger.error('Error fetching all projects:', error);
        throw new Error(`Failed to fetch projects: ${(error as any).message}`);
    }
  }

  /**
   * Retrieves a single project by its ID, scoped to its owner.
   * Returns the project with full client details if found. A project of
   * another user (or a malformed id) reads as "not found".
   * 
   * @async
   * @param {string} id - The UUID of the project to retrieve
   * @param {string} userId - The UUID of the user who must own the project
   * @returns {Promise<IProject | null>} The project with client details, or null if not found
   * @throws {Error} If the query fails
   * 
   * @example
   * const project = await projectService.findById('project-uuid', userId);
   * if (project) {
   *   console.log(`Project: ${project.name}, Client: ${project.client?.name}`);
   * }
   */
  async findById(id: string, userId: string): Promise<IProject | null> {
    if (!isUuid(id)) return null;
    const db = getDbClient();
    const queryText = `
      SELECT p.id, p.user_id, p.name, p.description, p.client_id, p.status, p.start_date, p.end_date, 
             p.hourly_rate, p.budget, p.rate_type, p.estimated_hours, p.currency, p.tags, p.recurring_payment, p.created_at, p.updated_at
      FROM projects p WHERE p.id = $1 AND p.user_id = $2
    `;
    try {
      const result = await db.query(queryText, [id, userId]);
      if (result.rows.length === 0) return null;
      return this.getProjectWithClient(result.rows[0]);
    } catch (error) {
        logger.error('Error fetching project by ID:', error);
        throw new Error(`Failed to fetch project: ${(error as any).message}`);
    }
  }

  /**
   * Records a rate period on the project's timeline.
   *
   * Keeps `projects.hourly_rate` and `project_rate_history` from drifting apart:
   * whichever surface changes the rate, the timeline is what time entries are
   * stamped from, so it has to learn about the change too.
   *
   * Upserts on (project_id, valid_from) — the unique key — so correcting the
   * rate twice on the same day replaces that day's period instead of failing.
   * Periods that already started earlier are untouched, which is what keeps
   * previously logged work at its original rate.
   *
   * @param db - Pool or transaction client to run on
   * @param projectId - The project whose timeline to extend
   * @param userId - Owner, copied onto the rate row
   * @param hourlyRate - The new rate
   * @param validFrom - YYYY-MM-DD, or null for today
   * @param note - Provenance note shown in the rate timeline UI
   */
  private async recordRatePeriod(
    db: any,
    projectId: string,
    userId: string,
    hourlyRate: number | string,
    validFrom: string | null,
    note: string
  ): Promise<void> {
    try {
      await db.query(
        `INSERT INTO project_rate_history (user_id, project_id, hourly_rate, valid_from, note)
         VALUES ($1, $2, $3, COALESCE($4::date, CURRENT_DATE), $5)
         ON CONFLICT (project_id, valid_from)
         DO UPDATE SET hourly_rate = EXCLUDED.hourly_rate, updated_at = CURRENT_TIMESTAMP`,
        [userId, projectId, hourlyRate, validFrom, note]
      );
    } catch (error) {
      // Never fail the project write over the timeline copy — a database that
      // has not run the migration yet must still be able to save a project.
      logger.error('Error recording project rate period:', error);
    }
  }

  /**
   * Fetches a project only if it belongs to the given user.
   *
   * Kept for existing callers; {@link findById} is owner-scoped as well now
   * and this simply delegates to it.
   *
   * @async
   * @param {string} id - The UUID of the project
   * @param {string} userId - The Keycloak user ID that must own it
   * @returns {Promise<IProject | null>} The project, or null if it does not
   *          exist OR belongs to someone else (indistinguishable by design)
   *
   * @example
   * const project = await projectService.findByIdForUser(projectId, req.user.id);
   * if (!project) return res.status(404).json({ error: 'Not found' });
   */
  async findByIdForUser(id: string, userId: string): Promise<IProject | null> {
    return this.findById(id, userId);
  }

  /**
   * Updates an existing project with partial data, scoped to its owner.
   * Only provided fields will be updated; undefined fields are ignored.
   * Returns null if the project is not found or belongs to another user.
   * 
   * @async
   * @param {string} id - The UUID of the project to update
   * @param {string} userId - The UUID of the user who must own the project
   * @param {UpdateProjectDto} projectData - The partial project data to update
   * @returns {Promise<IProject | null>} The updated project with client details, or null if not found
   * @throws {Error} 'Invalid client ID specified.' if client_id is not one of the user's clients
   * @throws {Error} If the update operation fails
   * 
   * @example
   * const updated = await projectService.update('project-uuid', userId, {
   *   status: 'completed',
   *   end_date: '2024-12-31'
   * });
   */
  async update(id: string, userId: string, projectData: UpdateProjectDto): Promise<IProject | null> {
    if (!isUuid(id)) return null;
    const db = getDbClient();
    if (
      projectData.client_id !== undefined &&
      projectData.client_id !== null &&
      !(await ownsRow('clients', projectData.client_id as string, userId))
    ) {
      throw new Error('Invalid client ID specified.');
    }
    const setParts = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (projectData.name !== undefined) { setParts.push(`name = $${paramIndex++}`); values.push(projectData.name); }
    if (projectData.description !== undefined) { setParts.push(`description = $${paramIndex++}`); values.push(projectData.description || null); }
    if (projectData.client_id !== undefined) { 
      setParts.push(`client_id = $${paramIndex++}`); 
      values.push(projectData.client_id);
    }
    if (projectData.status !== undefined) { setParts.push(`status = $${paramIndex++}`); values.push(projectData.status as ProjectStatus); }
    if (projectData.start_date !== undefined) { setParts.push(`start_date = $${paramIndex++}`); values.push(projectData.start_date || null); }
    if (projectData.end_date !== undefined) { setParts.push(`end_date = $${paramIndex++}`); values.push(projectData.end_date || null); }
    if (projectData.hourly_rate !== undefined) { setParts.push(`hourly_rate = $${paramIndex++}`); values.push(projectData.hourly_rate || null); }
    if (projectData.budget !== undefined) { setParts.push(`budget = $${paramIndex++}`); values.push(projectData.budget || null); }
    if (projectData.rate_type !== undefined) { setParts.push(`rate_type = $${paramIndex++}`); values.push(projectData.rate_type || null); }
    if (projectData.estimated_hours !== undefined) { setParts.push(`estimated_hours = $${paramIndex++}`); values.push(projectData.estimated_hours || null); }
    if (projectData.currency !== undefined) { setParts.push(`currency = $${paramIndex++}`); values.push(projectData.currency || 'USD'); }
    if (projectData.tags !== undefined) { setParts.push(`tags = $${paramIndex++}`); values.push(projectData.tags || null); }
    if (projectData.recurring_payment !== undefined) { setParts.push(`recurring_payment = $${paramIndex++}`); values.push(projectData.recurring_payment); }

    if (setParts.length === 0) {
      return this.findById(id, userId);
    }

    const previousRateRow = projectData.hourly_rate !== undefined
      ? await db.query(`SELECT hourly_rate FROM projects WHERE id = $1 AND user_id = $2`, [id, userId])
      : null;
    const previousRate =
      previousRateRow?.rows[0]?.hourly_rate === null || previousRateRow?.rows[0]?.hourly_rate === undefined
        ? null
        : Number(previousRateRow.rows[0].hourly_rate);

    const queryText = `
      UPDATE projects 
      SET ${setParts.join(', ')}, updated_at = CURRENT_TIMESTAMP 
      WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1} RETURNING id, user_id, name, description, client_id, status, start_date, end_date, hourly_rate, budget, rate_type, estimated_hours, currency, tags, recurring_payment, created_at, updated_at
    `;
    values.push(id, userId);

    try {
        const result = await db.query(queryText, values);
        if (result.rows.length === 0) return null;

        // Direct service callers (the HTTP path routes rate changes through the
        // rate timeline with an explicit start date instead) still keep the
        // timeline in step — but only for an actual CHANGE. Recording on every
        // call turned a mere rename, which re-sends the unchanged rate, into a
        // new period starting today.
        if (
          projectData.hourly_rate !== undefined &&
          projectData.hourly_rate !== null &&
          (previousRate === null || Number(projectData.hourly_rate) !== previousRate)
        ) {
          await this.recordRatePeriod(
            db,
            result.rows[0].id,
            result.rows[0].user_id,
            projectData.hourly_rate,
            null,
            'Rate changed on project'
          );
        }

        return this.getProjectWithClient(result.rows[0]);
    } catch (error) {
        logger.error('Error updating project:', error);
         if ((error as any).code === '23503') { // foreign_key_violation for client_id
            throw new Error('Invalid client ID specified.');
        }
        throw new Error(`Failed to update project: ${(error as any).message}`);
    }
  }

  /**
   * Deletes a project from the database, scoped to its owner.
   * Warning: time entries of the project are removed with it (ON DELETE CASCADE).
   * 
   * @async
   * @param {string} id - The UUID of the project to delete
   * @param {string} userId - The UUID of the user who must own the project
   * @returns {Promise<boolean>} True if the project was deleted, false if not found or not the user's
   * @throws {Error} If the deletion fails
   * 
   * @example
   * const deleted = await projectService.delete('project-uuid', userId);
   * if (deleted) console.log('Project deleted');
   */
  async delete(id: string, userId: string): Promise<boolean> {
    if (!isUuid(id)) return false;
    const db = getDbClient();
    const queryText = `DELETE FROM projects WHERE id = $1 AND user_id = $2`;
    try {
      const result = await db.query(queryText, [id, userId]);
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
        logger.error('Error deleting project:', error);
        throw new Error(`Failed to delete project: ${(error as any).message}`);
    }
  }

  /**
   * Private helper method to enrich a project row with full client details.
   * Fetches the associated client from the database and attaches it to the project.
   * 
   * @private
   * @async
   * @param {any} projectRow - The raw project row from the database
   * @returns {Promise<IProject>} The project with client details attached
   * 
   * @example
   * // Internal use only
   * const enrichedProject = await this.getProjectWithClient(rawProjectRow);
   */
  private async getProjectWithClient(projectRow: any): Promise<IProject> {
    const db = getDbClient();
    // Fetch client details separately
    if (!projectRow.client_id) {
      return {
        ...projectRow,
        client: undefined
      };
    }
    
    // Owner-scoped: only the project owner's own client is ever attached.
    const clientQueryText = `SELECT id, name, email, phone, address, notes, status, created_at, updated_at FROM clients WHERE id = $1 AND user_id = $2`;
    const clientResult = await db.query(clientQueryText, [projectRow.client_id, projectRow.user_id]);
    
    let clientDetails;
    if (clientResult.rows.length > 0) {
        clientDetails = clientResult.rows[0] as BaseClient;
    }

    return {
      ...projectRow,
      client: clientDetails
    };
  }
}
