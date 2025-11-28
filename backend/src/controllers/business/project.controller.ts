import { Request, Response } from 'express';
import { ProjectService } from '../../services/business/project.service';
// Joi is already imported in client.controller if we want to keep it central, or import here
import Joi from 'joi'; 

const projectService = new ProjectService();

/**
 * Joi validation schema for creating a new project.
 * Validates required fields (name, client_id) and optional billing/timeline fields.
 * Includes custom validation for date consistency and status-dependent requirements.
 * 
 * @constant {Joi.ObjectSchema}
 */
const createProjectSchema = Joi.object({
  name: Joi.string().min(1).max(255).required(),
  description: Joi.string().max(1000).optional().allow(''),
  client_id: Joi.string().guid({ version: 'uuidv4' }).required(), // Must be a valid UUID
  status: Joi.string().valid('not_started', 'active', 'on_hold', 'completed').default('not_started'),
  start_date: Joi.alternatives().try(
    Joi.date().iso(),
    Joi.string().allow(''),
    Joi.allow(null)
  ).optional(),
  end_date: Joi.alternatives().try(
    Joi.date().iso().greater(Joi.ref('start_date')),
    Joi.string().allow(''),
    Joi.allow(null)
  ).optional(),
  budget: Joi.alternatives().try(
    Joi.number().positive(),
    Joi.allow(null)
  ).optional(),
  currency: Joi.string().length(3).uppercase().optional().default('USD'), // ISO 4217 currency code
  rate_type: Joi.alternatives().try(
    Joi.string().valid('hourly', 'fixed_fee'),
    Joi.allow(null)
  ).optional(),
  hourly_rate: Joi.when('rate_type', {
    is: 'hourly',
    then: Joi.number().positive().required(), 
    otherwise: Joi.alternatives().try(
      Joi.number().positive(),
      Joi.allow(null)
    ).optional()
  }),
  estimated_hours: Joi.alternatives().try(
    Joi.number().integer().min(0),
    Joi.allow(null)
  ).optional(),
  recurring_payment: Joi.boolean().optional().default(false),
}).custom((value, helpers) => {
  // Custom validation for dates
  // Note: end_date is only required for 'completed' status (not for 'on_hold')
  // Projects can be put on hold without specifying an end date
  if (value.status === 'completed' && !value.end_date) {
    return helpers.error('any.invalid', { message: `End date is required for completed projects` });
  }
  
  // Accept ISO date strings (from frontend) and convert them to date-only format
  // The backend will handle the conversion when storing in the database
  if (value.start_date && value.end_date) {
    const startDate = new Date(value.start_date);
    const endDate = new Date(value.end_date);
    if (endDate < startDate) {
      return helpers.error('any.invalid', { message: 'End date must be after start date' });
    }
  }
  
  return value;
}, 'Additional project validation');


/**
 * Joi validation schema for updating an existing project.
 * All fields are optional, but at least one field must be provided.
 * Includes conditional validation for status-dependent fields (e.g., end_date required if status is 'completed').
 * 
 * @constant {Joi.ObjectSchema}
 */
const updateProjectSchema = Joi.object({
  name: Joi.string().min(1).max(255).optional(),
  description: Joi.string().max(1000).optional().allow(''),
  client_id: Joi.string().guid({ version: 'uuidv4' }).optional(), // Can change associated client
  status: Joi.string().valid('not_started', 'active', 'on_hold', 'completed').optional(),
  start_date: Joi.alternatives().try(
    Joi.date().iso(),
    Joi.string().allow(''),
    Joi.allow(null)
  ).optional(),
  end_date: Joi.when('status', {
    is: 'completed',
    then: Joi.date().iso().required(), // Required only if status is completed (not on_hold)
    otherwise: Joi.alternatives().try(
      Joi.date().iso(),
      Joi.string().allow(''),
      Joi.allow(null)
    ).optional()
  }),
  budget: Joi.alternatives().try(
    Joi.number().positive(),
    Joi.allow(null)
  ).optional(),
  currency: Joi.string().length(3).uppercase().optional(), // ISO 4217 currency code
  rate_type: Joi.alternatives().try(
    Joi.string().valid('hourly', 'fixed_fee'),
    Joi.allow(null)
  ).optional(),
  hourly_rate: Joi.when('rate_type', {
    is: 'hourly',
    then: Joi.number().positive().required(), 
    otherwise: Joi.alternatives().try(
      Joi.number().positive(),
      Joi.allow(null)
    ).optional()
  }),
  estimated_hours: Joi.alternatives().try(
    Joi.number().integer().min(0),
    Joi.allow(null)
  ).optional(),
  recurring_payment: Joi.boolean().optional(),
}).min(1); // At least one field must be provided for an update
// Add similar custom validation for start/end date consistency on updates if needed

/**
 * Controller for handling HTTP requests related to project management.
 * Provides CRUD operations for projects with comprehensive validation and error handling.
 * Includes business logic validation for dates, billing rates, and project status.
 * 
 * @class ProjectController
 */
export class ProjectController {

  /**
   * Creates a new project in the database.
   * Validates request body against createProjectSchema, including custom date and status validations.
   * 
   * @async
   * @param {Request} req - Express request object with project data in body
   * @param {Response} res - Express response object
   * @returns {Promise<void>} Sends 201 with created project or error response
   * 
   * @example
   * POST /api/projects
   * Body: {
   *   "name": "Website Redesign",
   *   "client_id": "uuid",
   *   "status": "active",
   *   "hourly_rate": 150,
   *   "start_date": "2024-01-01"
   * }
   * Response: 201 { message: "Project created successfully", project: {...} }
   */
  async create(req: Request, res: Response): Promise<void> {
    const { error, value } = createProjectSchema.validate(req.body);
    if (error) {
      res.status(400).json({ message: 'Validation error', details: error.details });
      return;
    }

    try {
      // Inject user_id from authenticated user
      const projectData = {
        ...value,
        user_id: (req as any).user?.id
      };
      console.log('[DEBUG] Creating project with user_id:', projectData.user_id);
      
      const project = await projectService.create(projectData);
      res.status(201).json({
        message: 'Project created successfully',
        project,
      });
    } catch (err: any) {
      console.error('Create project error:', err);
      // Handle specific errors like foreign key violation for client_id
      if(err.message.includes("Invalid client ID specified.")) {
          res.status(400).json({ message: "Validation failed: Invalid 'client_id' provided." });
      } else {
          res.status(500).json({ message: err.message || 'Internal server error' });
      }
    }
  }

  /**
   * Retrieves all projects from the database with optional filtering.
   * Supports filtering by status, client_id, and search text.
   * Returns projects with full client details, ordered by creation date (newest first).
   * 
   * @async
   * @param {Request} req - Express request object (supports query params: status, client_id, search)
   * @param {Response} res - Express response object
   * @returns {Promise<void>} Sends 200 with array of projects or error response
   * 
   * @example
   * GET /api/projects
   * GET /api/projects?status=active
   * GET /api/projects?client_id=uuid&status=completed
   * GET /api/projects?search=website
   * Response: 200 [{ id: "uuid", name: "Website Redesign", client: {...}, ... }, ...]
   */
  async findAll(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({ message: 'Authentication required' });
        return;
      }

      const { status, client_id, search } = req.query;
      
      // Build filters object from query parameters
      const filters: {
        status?: string;
        client_id?: string;
        search?: string;
      } = {};
      
      if (status && typeof status === 'string') {
        filters.status = status;
      }
      if (client_id && typeof client_id === 'string') {
        filters.client_id = client_id;
      }
      if (search && typeof search === 'string') {
        filters.search = search;
      }
      
      const projects = await projectService.findAll(userId, filters);
      res.status(200).json(projects);
    } catch (err: any) {
      console.error('Find all projects error:', err);
      res.status(500).json({ message: err.message || 'Internal server error' });
    }
  }

  /**
   * Retrieves a single project by ID.
   * Returns the project with full client details if found.
   * 
   * @async
   * @param {Request} req - Express request object with project ID in params
   * @param {Response} res - Express response object
   * @returns {Promise<void>} Sends 200 with project, 404 if not found, or error response
   * 
   * @example
   * GET /api/projects/:id
   * Response: 200 { id: "uuid", name: "Website Redesign", client: {...}, ... }
   * Response: 404 { message: "Project not found" }
   */
  async findById(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    if (!id) {
        res.status(400).json({ message: 'Project ID is required.' });
        return;
    }

    try {
      const project = await projectService.findById(id);
      if (project) {
        res.status(200).json(project);
      } else {
        res.status(404).json({ message: 'Project not found' });
      }
    } catch (err: any) {
      console.error('Find project by ID error:', err);
      res.status(500).json({ message: err.message || 'Internal server error' });
    }
  }

  /**
   * Updates an existing project with partial data.
   * Validates request body against updateProjectSchema.
   * Includes conditional validation (e.g., end_date required if status is 'completed').
   * 
   * @async
   * @param {Request} req - Express request object with project ID in params and update data in body
   * @param {Response} res - Express response object
   * @returns {Promise<void>} Sends 200 with updated project, 404 if not found, or error response
   * 
   * @example
   * PUT /api/projects/:id
   * Body: { "status": "completed", "end_date": "2024-12-31" }
   * Response: 200 { message: "Project updated successfully", project: {...} }
   */
  async update(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    if (!id) {
        res.status(400).json({ message: 'Project ID is required.' });
        return;
    }

    // Joi validation for updates
    // Note: The custom date logic might need refinement based on how partial updates are handled.
    // If start_date is being cleared, should end_date also be cleared? etc.
    const { error, value } = updateProjectSchema.validate(req.body);
    if (error) {
      res.status(400).json({ message: 'Validation error', details: error.details });
      return;
    }

    try {
      const updatedProject = await projectService.update(id, value);
      if (updatedProject) {
        res.status(200).json({
          message: 'Project updated successfully',
          project: updatedProject,
        });
      } else {
        res.status(404).json({ message: 'Project not found' });
      }
    } catch (err: any) {
      console.error('Update project error:', err);
       if(err.message.includes("Invalid client ID specified.")) {
           res.status(400).json({ message: "Validation failed: Invalid 'client_id' provided for update." });
        } else {
            res.status(500).json({ message: err.message || 'Internal server error' });
        }
    }
  }

  /**
   * Deletes a project from the database.
   * May fail if there are associated time entries or invoices due to foreign key constraints.
   * 
   * @async
   * @param {Request} req - Express request object with project ID in params
   * @param {Response} res - Express response object
   * @returns {Promise<void>} Sends 200 on success, 404 if not found, or error response
   * 
   * @example
   * DELETE /api/projects/:id
   * Response: 200 { message: "Project deleted successfully" }
   * Response: 500 { message: "Failed to delete project..." } (if has time entries)
   */
  async delete(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    if (!id) {
        res.status(400).json({ message: 'Project ID is required.' });
        return;
    }

    try {
      const deleted = await projectService.delete(id);
      if (deleted) {
        res.status(200).json({ message: 'Project deleted successfully' });
      } else {
        res.status(404).json({ message: 'Project not found or already deleted' });
      }
    } catch (err: any) {
      console.error('Delete project error:', err);
      res.status(500).json({ message: err.message || 'Internal server error' });
    }
  }
}
