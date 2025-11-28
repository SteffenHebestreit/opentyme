// Time entry model aligned with migration 001 schema
import { BaseUser } from '../auth/user.model';

/**
 * Valid status values for a time entry.
 * Used for tracking time entry state in the application.
 * 
 * @typedef {'active' | 'completed' | 'paused'} TimeEntryStatus
 */
export type TimeEntryStatus = 'active' | 'completed' | 'paused';

/**
 * Data transfer object for creating a new time entry.
 * Simplified model: single date + time + duration hours.
 * Users must create separate entries if work spans midnight.
 * 
 * @interface CreateTimeEntryDto
 * @property {string} user_id - The UUID of the user who owns this time entry (required, multi-tenant)
 * @property {string} project_id - The UUID of the associated project (required, foreign key)
 * @property {string} [description] - Description of work performed (optional)
 * @property {string} [task_name] - Task name/title for organization, max 255 chars (optional)
 * @property {Date} entry_date - Date of work performed (YYYY-MM-DD)
 * @property {string} entry_time - Time when work started (HH:MM:SS or HH:MM)
 * @property {number} duration_hours - Duration in hours, DECIMAL(10, 2), max 24 hours per entry
 * @property {boolean} [is_billable] - Whether this time is billable (defaults to true)
 * @property {string} [category] - Category for grouping time entries, max 100 chars (optional)
 * @property {string[]} [tags] - Array of tags for categorization (optional)
 * @property {number} [hourly_rate] - Hourly rate for billing calculations (optional)
 * @property {Date} [date_start] - Legacy field for backward compatibility (optional)
 * 
 * @example
 * const newEntry: CreateTimeEntryDto = {
 *   user_id: 'user-uuid',
 *   project_id: 'project-uuid',
 *   description: 'Working on homepage redesign',
 *   task_name: 'Homepage Design',
 *   entry_date: new Date('2024-01-15'),
 *   entry_time: '09:00',
 *   duration_hours: 3.5,
 *   is_billable: true,
 *   category: 'Development',
 *   tags: ['frontend', 'ui']
 * };
 */
export interface CreateTimeEntryDto {
  user_id: string; // Multi-tenant: required
  project_id: string;
  description?: string | null;
  task_name?: string | null;
  entry_date: Date; // Single date field
  entry_time: string; // Start time field (HH:MM or HH:MM:SS)
  entry_end_time?: string | null; // End time field (HH:MM or HH:MM:SS), optional
  duration_hours: number; // Required in new model
  is_billable?: boolean;
  category?: string | null;
  tags?: string[] | null;
  hourly_rate?: number | null;
  date_start?: Date | null; // Legacy field for backward compatibility
}

/**
 * Data transfer object for updating an existing time entry.
 * All fields are optional to support partial updates.
 * 
 * @interface UpdateTimeEntryDto
 * @extends {Partial<CreateTimeEntryDto>}
 * 
 * @example
 * const updateData: UpdateTimeEntryDto = {
 *   date_end: new Date(),
 *   duration_hours: 3.5,
 *   description: 'Updated description'
 * };
 */
export interface UpdateTimeEntryDto extends Partial<CreateTimeEntryDto> {}

/**
 * Base time entry structure representing a time entry entity from the database.
 * Contains all fields returned by the database including timestamps.
 * 
 * @interface BaseTimeEntry
 * @property {string} id - The unique identifier (UUID) for the time entry
 * @property {string} user_id - The UUID of the user who owns this time entry
 * @property {string} project_id - The UUID of the associated project
 * @property {string | null} description - Description of work performed
 * @property {string | null} task_name - Task name/title for organization
 * @property {Date} entry_date - Date of work performed (YYYY-MM-DD)
 * @property {string} entry_time - Time when work started (HH:MM:SS)
 * @property {number | null} duration_hours - Duration in hours with 2 decimal precision
 * @property {boolean} is_billable - Whether this time is billable to the client
 * @property {string | null} category - Category for grouping (e.g., 'Development', 'Meeting')
 * @property {string[] | null} tags - Array of tags for categorization
 * @property {number | null} hourly_rate - Hourly rate for billing calculations
 * @property {Date} created_at - Timestamp when the time entry was created
 * @property {Date} updated_at - Timestamp when the time entry was last updated
 * @property {Date | null} [date_start] - Legacy field for backward compatibility
 */
export interface BaseTimeEntry {
  id: string;
  user_id: string;
  project_id: string;
  description: string | null;
  task_name: string | null;
  entry_date: Date;
  entry_time: string;
  entry_end_time?: string | null;
  duration_hours: number | null;
  is_billable: boolean;
  category: string | null;
  tags: string[] | null;
  hourly_rate: number | null;
  created_at: Date;
  updated_at: Date;
  date_start?: Date | null; // Legacy field
}

/**
 * Full time entry structure returned by API endpoints.
 * Extends BaseTimeEntry with associated project and user details.
 * 
 * @interface TimeEntry
 * @extends {BaseTimeEntry}
 * @property {Object} [project] - Basic project information
 * @property {string} project.id - Project UUID
 * @property {string} project.name - Project name
 * @property {BaseUser} [user] - Full user information
 * 
 * @example
 * const entry: TimeEntry = {
 *   id: 'entry-uuid',
 *   description: 'Homepage redesign',
 *   date_start: new Date('2024-01-15T09:00:00Z'),
 *   duration_hours: 3.5,
 *   project: { id: 'project-uuid', name: 'Website Redesign' },
 *   // ... other fields
 * };
 */
export interface TimeEntry extends BaseTimeEntry {
  project?: { id: string; name: string };
  user?: BaseUser;
}

/**
 * Extended time entry structure with additional client information.
 * Used when displaying time entries with full context including client details.
 * 
 * @interface TimeEntryWithDetails
 * @extends {TimeEntry}
 * @property {string} [client_name] - Name of the client associated with the project
 * 
 * @example
 * const entry: TimeEntryWithDetails = {
 *   id: 'entry-uuid',
 *   description: 'Homepage redesign',
 *   project: { id: 'project-uuid', name: 'Website Redesign' },
 *   client_name: 'Acme Corporation',
 *   // ... other fields
 * };
 */
export interface TimeEntryWithDetails extends TimeEntry {
  client_name?: string;
}
