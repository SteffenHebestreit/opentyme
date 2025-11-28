import { BaseClient } from './client.model';

/**
 * Valid status values for a project.
 * Matches the database schema from migration 001.
 * 
 * @typedef {'active' | 'completed' | 'on_hold' | 'cancelled' | 'not_started'} ProjectStatus
 */
export type ProjectStatus = 'not_started' | 'active' | 'on_hold' | 'completed' | 'cancelled';

/**
 * Valid billing rate types for a project.
 * Determines how the project is billed to the client.
 * 
 * @typedef {'hourly' | 'fixed_fee'} RateType
 */
export type RateType = 'hourly' | 'fixed_fee';

/**
 * Data transfer object for creating a new project.
 * Used when receiving project creation requests from API endpoints.
 * 
 * @interface CreateProjectDto
 * @property {string} user_id - The UUID of the authenticated user who owns this project (required)
 * @property {string} name - The project name (required)
 * @property {string} [description] - Detailed project description (optional)
 * @property {string} client_id - The UUID of the associated client (required, foreign key)
 * @property {ProjectStatus} [status] - The project status (defaults to 'active')
 * @property {Date} [start_date] - Project start date (optional)
 * @property {Date} [end_date] - Project target or actual completion date (optional)
 * @property {number} [hourly_rate] - Hourly billing rate for this project (optional, used when rate_type is 'hourly')
 * @property {number} [budget] - Total budget for fixed-fee projects (optional, used when rate_type is 'fixed_fee')
 * @property {RateType} [rate_type] - Billing type: 'hourly' or 'fixed_fee' (optional)
 * @property {number} [estimated_hours] - Estimated hours to complete the project (optional)
 * @property {string} [currency] - Currency code for billing (e.g., 'USD', 'EUR', defaults to 'USD')
 * @property {string[]} [tags] - Array of tags for project categorization (optional)
 * @property {boolean} [recurring_payment] - Whether this project has recurring monthly payments without invoices (defaults to false)
 * 
 * @example
 * const newProject: CreateProjectDto = {
 *   user_id: '123e4567-e89b-12d3-a456-426614174000',
 *   name: 'Website Redesign',
 *   client_id: 'client-uuid',
 *   status: 'active',
 *   hourly_rate: 150,
 *   currency: 'USD',
 *   start_date: new Date('2024-01-01')
 * };
 */
export interface CreateProjectDto {
  user_id: string; // Multi-tenant: the authenticated user who owns this project
  name: string;
  description?: string | null;
  client_id: string; // Foreign key to the clients table
  status?: ProjectStatus;
  start_date?: Date | null;
  end_date?: Date | null; // Target or actual completion date
  hourly_rate?: number | null; // Hourly rate for this project (used when rate_type is 'hourly')
  budget?: number | null; // Total budget for fixed-fee projects
  rate_type?: RateType | null; // Billing type: 'hourly' or 'fixed_fee'
  estimated_hours?: number | null; // Estimated hours to complete
  currency?: string; // Currency code (e.g., 'USD', 'EUR')
  tags?: string[]; // Array of tags for categorization
  recurring_payment?: boolean; // Whether this project has recurring monthly payments without invoices
}

/**
 * Data transfer object for updating an existing project.
 * All fields are optional to support partial updates.
 * 
 * @interface UpdateProjectDto
 * @extends {Partial<CreateProjectDto>}
 * 
 * @example
 * const updateData: UpdateProjectDto = {
 *   status: 'completed',
 *   end_date: new Date('2024-12-31'),
 *   tags: ['website', 'redesign', 'completed']
 * };
 */
export interface UpdateProjectDto extends Partial<CreateProjectDto> {}

/**
 * Base project structure representing a project entity from the database.
 * Contains all fields returned by the database including timestamps.
 * 
 * @interface BaseProject
 * @property {string} id - The unique identifier (UUID) for the project
 * @property {string} user_id - The UUID of the user who owns this project
 * @property {string} name - The project name
 * @property {string | null} description - Detailed project description
 * @property {string} client_id - The UUID of the associated client
 * @property {ProjectStatus} status - The project's current status
 * @property {Date | null} start_date - Project start date
 * @property {Date | null} end_date - Project completion date (target or actual)
 * @property {number | null} hourly_rate - Hourly billing rate for this project
 * @property {number | null} budget - Total budget for fixed-fee projects
 * @property {RateType | null} rate_type - Billing type: 'hourly' or 'fixed_fee'
 * @property {number | null} estimated_hours - Estimated hours to complete
 * @property {string} currency - Currency code for billing
 * @property {string[] | null} tags - Array of tags for categorization
 * @property {boolean} recurring_payment - Whether this project has recurring monthly payments without invoices
 * @property {Date} created_at - Timestamp when the project was created
 * @property {Date} updated_at - Timestamp when the project was last updated
 */
export interface BaseProject {
  id: string;
  user_id: string; // Multi-tenant: owner of the project
  name: string;
  description: string | null;
  client_id: string;
  status: ProjectStatus;
  start_date: Date | null;
  end_date: Date | null;
  hourly_rate: number | null;
  budget: number | null;
  rate_type: RateType | null;
  estimated_hours: number | null;
  currency: string;
  tags: string[] | null;
  recurring_payment: boolean;
  created_at: Date;
  updated_at: Date;
}

/**
 * Full project structure returned by API endpoints.
 * Extends BaseProject with associated client details.
 * 
 * @interface Project
 * @extends {BaseProject}
 * @property {BaseClient} [client] - Full details of the associated client
 * 
 * @example
 * const project: Project = {
 *   id: 'project-uuid',
 *   name: 'Website Redesign',
 *   client: {
 *     id: 'client-uuid',
 *     name: 'Acme Corporation',
 *     email: 'contact@acme.com'
 *   },
 *   // ... other project fields
 * };
 */
export interface Project extends BaseProject {
  client?: BaseClient; // Basic client info, can be expanded
}

/**
 * Extended project structure that includes related aggregated data.
 * Used when fetching projects with calculated metrics and related counts.
 * 
 * @interface ProjectWithDetails
 * @extends {Project}
 * @property {number} [tasks_count] - The number of tasks associated with this project
 * @property {number} [total_tracked_hours] - Total hours tracked from time entries
 * 
 * @example
 * const project: ProjectWithDetails = {
 *   id: 'uuid',
 *   name: 'Website Redesign',
 *   tasks_count: 15,
 *   total_tracked_hours: 120.5,
 *   // ... other project fields
 * };
 */
export interface ProjectWithDetails extends Project {
  tasks_count?: number;
  total_tracked_hours?: number; // Calculated from time_entries table
}
