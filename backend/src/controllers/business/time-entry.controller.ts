import { Request, Response } from 'express';
import { TimeEntryService } from '../../services/business/time-entry.service';
import { ProjectService } from '../../services/business/project.service';
import { 
  CreateTimeEntryDto,
  UpdateTimeEntryDto,
  TimeEntry as ITimeEntry
} from '../../models/business/time-entry.model';
import Joi from 'joi';
import { 
  getCurrentTime, 
  getCurrentDate, 
  getCurrentTimeString, 
  formatTimeString, 
  formatDateString,
  calculateDurationHours,
  roundTimerToQuarters 
} from '../../utils/timezone.util';

const timeEntryService = new TimeEntryService();
const projectService = new ProjectService();

/**
 * Joi validation schema for creating a new time entry.
 * Simplified model: single date + time + duration hours.
 * Users must create separate entries if work spans midnight.
 * Frontend sends: entry_date, entry_time, duration_hours, billable, task_name
 * 
 * @constant {Joi.ObjectSchema}
 */
const createTimeEntrySchema = Joi.object({
  user_id: Joi.string().guid({ version: 'uuidv4' }).optional(), // Will be injected from auth
  project_id: Joi.string().guid({ version: 'uuidv4' }).required(),
  task_name: Joi.string().max(255).optional().allow(''),
  description: Joi.string().max(1000).optional().allow(''),
  category: Joi.string().max(100).optional().allow(''),
  entry_date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(), // Single date string (YYYY-MM-DD)
  entry_time: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/).required(), // Start time (HH:MM or HH:MM:SS)
  entry_end_time: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/).optional(), // End time (HH:MM or HH:MM:SS)
  duration_hours: Joi.number().min(0).max(24).required(), // Duration in hours (decimal, e.g., 2.5)
  billable: Joi.boolean().default(true),
  hourly_rate: Joi.number().min(0).optional(),
  tags: Joi.array().items(Joi.string()).optional(),
  
  // Legacy fields for backward compatibility (will be ignored)
  start_time: Joi.date().iso().optional(),
  end_time: Joi.date().iso().optional(),
  duration_minutes: Joi.number().optional(),
});

/**
 * Joi validation schema for updating an existing time entry.
 * All fields are optional, but at least one field must be provided.
 * 
 * @constant {Joi.ObjectSchema}
 */
const updateTimeEntrySchema = Joi.object({
  user_id: Joi.string().guid({ version: 'uuidv4' }).optional(),
  project_id: Joi.string().guid({ version: 'uuidv4' }).optional(),
  task_name: Joi.string().max(255).optional().allow(''),
  description: Joi.string().max(1000).optional().allow(''),
  category: Joi.string().max(100).optional().allow(''),
  entry_date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).optional(), // Single date string (YYYY-MM-DD)
  entry_time: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/).optional(),
  entry_end_time: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/).optional(), // End time
  duration_hours: Joi.number().min(0).max(24).optional(),
  billable: Joi.boolean().optional(),
  hourly_rate: Joi.number().min(0).optional(),
  tags: Joi.array().items(Joi.string()).optional(),
  
  // Legacy fields for backward compatibility (will be ignored)
  start_time: Joi.date().iso().optional(),
  end_time: Joi.date().iso().optional(),
  duration_minutes: Joi.number().optional(),
}).min(1); // At least one field must be provided for an update

/**
 * Controller for handling HTTP requests related to time entry management.
 * Provides CRUD operations for time entries with comprehensive validation and filtering.
 * Automatically calculates duration when both start and end dates are provided.
 * 
 * @class TimeEntryController
 */
export class TimeEntryController {

  /**
   * Creates a new time entry in the database.
   * Validates request body against createTimeEntrySchema.
   * Duration is automatically calculated if both date_start and date_end are provided.
   * 
   * @async
   * @param {Request} req - Express request object with time entry data in body
   * @param {Response} res - Express response object
   * @returns {Promise<void>} Sends 201 with created time entry or error response
   * 
   * @example
   * POST /api/time-entries
   * Body: {
   *   "user_id": "user-uuid",
   *   "project_id": "project-uuid",
   *   "description": "Working on homepage",
   *   "date_start": "2024-01-15T09:00:00Z",
   *   "date_end": "2024-01-15T12:30:00Z",
   *   "is_billable": true
   * }
   * Response: 201 { message: "Time entry created successfully", time_entry: {...} }
   */
  async create(req: Request, res: Response): Promise<void> {
    const { error, value } = createTimeEntrySchema.validate(req.body);
    if (error) {
      res.status(400).json({ message: 'Validation error', details: error.details });
      return;
    }

    try {
      // New simplified model: entry_date + entry_time + entry_end_time + duration_hours
      const transformedData: any = {
        project_id: value.project_id,
        user_id: (req as any).user?.id, // Inject user_id from authenticated user
        task_name: value.task_name,
        description: value.description || '', // Default to empty string (NOT NULL constraint)
        category: value.category,
        entry_date: value.entry_date, // Single date string (YYYY-MM-DD)
        entry_time: value.entry_time, // Start time string (HH:mm or HH:mm:ss)
        entry_end_time: value.entry_end_time || null, // End time string (HH:mm or HH:mm:ss), optional
        duration_hours: value.duration_hours, // Duration in hours (decimal)
        is_billable: value.billable ?? true,
        hourly_rate: value.hourly_rate,
        tags: value.tags,
        
        // Keep legacy date_start field for backward compatibility during transition
        // Construct proper ISO timestamp from date and time strings
        date_start: value.entry_date && value.entry_time 
          ? new Date(`${value.entry_date}T${value.entry_time}:00.000Z`) 
          : undefined,
      };

      console.log('[DEBUG] Creating time entry with user_id:', transformedData.user_id);
      console.log('[DEBUG] transformedData before service call:', JSON.stringify(transformedData, null, 2));
      
      const timeEntry = await timeEntryService.create(transformedData);
      res.status(201).json({
        message: 'Time entry created successfully',
        time_entry: timeEntry,
      });
    } catch (err: any) {
      console.error('Create time entry error:', err);
      // Handle specific errors like foreign key violation for project_id or user_id
      if(err.message.includes("Invalid 'project_id' specified.") || err.message.includes("Invalid 'user_id' specified.")) {
          res.status(400).json({ message: `Validation failed: Invalid ID provided.` });
      } else {
          res.status(500).json({ message: err.message || 'Internal server error' });
      }
    }
  }

  /**
   * Retrieves time entries from the database with optional filtering.
   * Supports filtering by user_id, project_id, and date range via query parameters.
   * Returns time entries with associated project details, ordered by start date (newest first).
   * 
   * @async
   * @param {Request} req - Express request object with optional query params
   * @param {Response} res - Express response object
   * @returns {Promise<void>} Sends 200 with array of time entries or error response
   * 
   * @example
   * GET /api/time-entries?project_id=uuid&start_date=2024-01-01&end_date=2024-01-31
   * Response: 200 [{ id: "uuid", description: "Work done", duration_hours: 3.5, ... }, ...]
   */
  async findAll(req: Request, res: Response): Promise<void> {
    const userId = (req as any).user?.id;
    if (!userId) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    // Extract query parameters for filtering
    // ALWAYS use authenticated user's ID for multi-tenant isolation
    const options: { user_id: string; project_id?: string; start_date?: Date; end_date?: Date } = {
      user_id: userId  // Force user_id to authenticated user
    };
    if (req.query.project_id) options.project_id = req.query.project_id as string;
    
    // For date filtering, expect YYYY-MM-DD format
    if (req.query.start_date) {
      const startDateStr = req.query.start_date as string;
      options.start_date = new Date(startDateStr);
      if (isNaN(options.start_date.getTime())) { 
        res.status(400).json({ message: "Invalid 'start_date' format. Use YYYY-MM-DD." });
        return;
      }
    }
    if (req.query.end_date) {
      const endDateStr = req.query.end_date as string;
      options.end_date = new Date(endDateStr);
       if (isNaN(options.end_date.getTime())) { 
        res.status(400).json({ message: "Invalid 'end_date' format. Use YYYY-MM-DD." });
        return;
      }
    }

    try {
      const timeEntries = await timeEntryService.findAll(options);
      
      // Transform backend field names to frontend field names
      const transformedEntries = timeEntries.map((entry: any) => {
        // Calculate end_time for legacy compatibility
        let endTime = null;
        if (entry.entry_date && entry.entry_time && entry.duration_hours) {
          // Entry is complete - calculate end_time from start + duration
          const startDate = new Date(entry.entry_date);
          const [hours, minutes] = entry.entry_time.split(':').map(Number);
          startDate.setHours(hours, minutes, 0, 0);
          endTime = new Date(startDate.getTime() + entry.duration_hours * 60 * 60 * 1000);
        }
        
        return {
          id: entry.id,
          user_id: entry.user_id,
          project_id: entry.project_id,
          description: entry.description,
          task_name: entry.task_name,
          category: entry.category,
          entry_date: entry.entry_date, // New: single date field
          entry_time: entry.entry_time, // New: single time field
          entry_end_time: entry.entry_end_time, // New: end time field for active timer detection
          duration_hours: entry.duration_hours, // New: duration in hours
          date_start: entry.date_start, // New: start timestamp for active timer detection
          start_time: entry.date_start, // Legacy: start timestamp
          end_time: endTime, // Legacy: calculated end time (null for active timers)
          duration_minutes: entry.duration_hours ? Math.round(entry.duration_hours * 60) : null,
          billable: entry.is_billable,
          hourly_rate: entry.hourly_rate,
          created_at: entry.created_at,
          updated_at: entry.updated_at,
          project_name: entry.project?.name || entry.project_name || null,
          client_name: entry.client_name || null,
        };
      });
      
      res.status(200).json(transformedEntries);
    } catch (err: any) {
      console.error('Find all time entries error:', err);
      res.status(500).json({ message: err.message || 'Internal server error' });
    }
  }

  /**
   * Retrieves a single time entry by ID.
   * Returns the time entry with associated project details if found.
   * 
   * @async
   * @param {Request} req - Express request object with time entry ID in params
   * @param {Response} res - Express response object
   * @returns {Promise<void>} Sends 200 with time entry, 404 if not found, or error response
   * 
   * @example
   * GET /api/time-entries/:id
   * Response: 200 { id: "uuid", description: "Work done", project: {...}, ... }
   * Response: 404 { message: "Time entry not found" }
   */
  async findById(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    if (!id) {
        res.status(400).json({ message: 'Time entry ID is required.' });
        return;
    }

    try {
      const timeEntry = await timeEntryService.findById(id);
      if (timeEntry) {
        // Calculate end_time for legacy compatibility
        let endTime = null;
        if (timeEntry.entry_date && timeEntry.entry_time && timeEntry.duration_hours) {
          // Entry is complete - calculate end_time from start + duration
          const startDate = new Date(timeEntry.entry_date);
          const [hours, minutes] = (timeEntry.entry_time as string).split(':').map(Number);
          startDate.setHours(hours, minutes, 0, 0);
          endTime = new Date(startDate.getTime() + timeEntry.duration_hours * 60 * 60 * 1000);
        }
        
        // Transform backend field names to frontend field names
        const transformedEntry = {
          id: timeEntry.id,
          user_id: timeEntry.user_id,
          project_id: timeEntry.project_id,
          description: timeEntry.description,
          task_name: timeEntry.task_name,
          category: timeEntry.category,
          entry_date: timeEntry.entry_date, // New: single date field
          entry_time: timeEntry.entry_time, // New: single time field
          duration_hours: timeEntry.duration_hours, // Now primary field (not calculated)
          billable: timeEntry.is_billable,
          hourly_rate: timeEntry.hourly_rate,
          created_at: timeEntry.created_at,
          updated_at: timeEntry.updated_at,
          project_name: (timeEntry as any).project?.name || null,
          client_name: null,
          // Legacy fields for backward compatibility
          start_time: timeEntry.date_start,
          end_time: endTime, // Set only if entry is complete (has entry_date)
          duration_minutes: timeEntry.duration_hours ? Math.round(timeEntry.duration_hours * 60) : null,
        };
        
        res.status(200).json(transformedEntry);
      } else {
        res.status(404).json({ message: 'Time entry not found' });
      }
    } catch (err: any) {
      console.error('Find time entry by ID error:', err);
      res.status(500).json({ message: err.message || 'Internal server error' });
    }
  }

  /**
   * Updates an existing time entry with partial data.
   * Validates request body against updateTimeEntrySchema.
   * At least one field must be provided for update.
   * 
   * @async
   * @param {Request} req - Express request object with time entry ID in params and update data in body
   * @param {Response} res - Express response object
   * @returns {Promise<void>} Sends 200 with updated time entry, 404 if not found, or error response
   * 
   * @example
   * PUT /api/time-entries/:id
   * Body: { "date_end": "2024-01-15T17:30:00Z", "duration_hours": 8.5 }
   * Response: 200 { message: "Time entry updated successfully", time_entry: {...} }
   */
  async update(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    if (!id) {
        res.status(400).json({ message: 'Time entry ID is required.' });
        return;
    }

    // Joi validation for updates
    const { error, value } = updateTimeEntrySchema.validate(req.body);
    if (error) {
      res.status(400).json({ message: 'Validation error', details: error.details });
      return;
    }
    
    try {
      // Transform frontend field names to backend field names
      const transformedData: any = {};
      
      if (value.project_id) transformedData.project_id = value.project_id;
      if (value.user_id) transformedData.user_id = value.user_id;
      if (value.task_name !== undefined) transformedData.task_name = value.task_name;
      if (value.description !== undefined) transformedData.description = value.description;
      if (value.category !== undefined) transformedData.category = value.category;
      
      // New format: entry_date and entry_time
      if (value.entry_date !== undefined) transformedData.entry_date = value.entry_date;
      if (value.entry_time !== undefined) transformedData.entry_time = value.entry_time;
      if (value.entry_end_time !== undefined) transformedData.entry_end_time = value.entry_end_time;
      if (value.duration_hours !== undefined) transformedData.duration_hours = value.duration_hours;
      
      // Legacy field transformation for backward compatibility
      if (value.start_time) transformedData.date_start = value.start_time;
      if (value.end_time !== undefined) transformedData.date_end = value.end_time;
      if (value.duration_minutes !== undefined && value.duration_minutes !== null) {
        transformedData.duration_hours = value.duration_minutes / 60;
      }
      
      if (value.billable !== undefined) transformedData.is_billable = value.billable;
      if (value.hourly_rate !== undefined) transformedData.hourly_rate = value.hourly_rate;
      if (value.tags !== undefined) transformedData.tags = value.tags;
      
      const updatedTimeEntry = await timeEntryService.update(id, transformedData);
      if (updatedTimeEntry) {
        res.status(200).json({
          message: 'Time entry updated successfully',
          time_entry: updatedTimeEntry,
        });
      } else {
        res.status(404).json({ message: 'Time entry not found' });
      }
    } catch (err: any) {
      console.error('Update time entry error:', err);
       if(err.message.includes("Invalid 'project_id' specified.") || err.message.includes("Invalid 'user_id' specified.")) {
           res.status(400).json({ message: "Validation failed: Invalid ID provided for update." });
        } else {
            res.status(500).json({ message: err.message || 'Internal server error' });
        }
    }
  }

  /**
   * Deletes a time entry from the database.
   * 
   * @async
   * @param {Request} req - Express request object with time entry ID in params
   * @param {Response} res - Express response object
   * @returns {Promise<void>} Sends 200 on success, 404 if not found, or error response
   * 
   * @example
   * DELETE /api/time-entries/:id
   * Response: 200 { message: "Time entry deleted successfully" }
   * Response: 404 { message: "Time entry not found or already deleted" }
   */
  async delete(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    if (!id) {
        res.status(400).json({ message: 'Time entry ID is required.' });
        return;
    }

    try {
      const deleted = await timeEntryService.delete(id);
      if (deleted) {
        res.status(200).json({ message: 'Time entry deleted successfully' });
      } else {
        res.status(404).json({ message: 'Time entry not found or already deleted' });
      }
    } catch (err: any) {
      console.error('Delete time entry error:', err);
      res.status(500).json({ message: err.message || 'Internal server error' });
    }
  }

  async startTimer(req: Request, res: Response): Promise<void> {
    // This endpoint will typically create a new active TimeEntry or resume an existing paused one.
    const { project_id } = req.body; // Project ID is essential to associate the timer
    if (!project_id) {
        res.status(400).json({ message: 'Project ID is required to start a timer.' });
        return;
    }
    
    // In a real app, user_id would come from req.user.id via authentication middleware.
    const userId = (req as any).user?.id; 
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized. User ID not found.' });
      return;
    }

    try {
        // Check for an existing active timer for this user to prevent multiple timers
        const options = { user_id: userId };
        const currentEntries = await timeEntryService.findAll(options);
        
        // Check if there's an active timer (entry with start_time but no entry_date)
        const activeTimer = currentEntries.find((entry: any) => entry.start_time && !entry.entry_date);
        if (activeTimer) {
          res.status(400).json({ 
            message: 'You already have an active timer running. Please stop it before starting a new one.' 
          });
          return;
        }

      // Fetch project to get hourly_rate
      const project = await projectService.findById(project_id);
      if (!project) {
        res.status(400).json({ message: 'Invalid project_id specified.' });
        return;
      }

      // Create a new time entry with start_time = now, no entry_date yet (indicates running timer)
      const now = getCurrentTime();
      const newTimeEntryData: Partial<CreateTimeEntryDto> & { user_id: string; project_id: string } = {
        user_id: userId,
        project_id,
        task_name: req.body.task_name || 'Untitled Task',
        description: req.body.description || '',
        category: req.body.category || undefined,
        is_billable: req.body.is_billable ?? true,
        hourly_rate: project.hourly_rate || undefined,
        // Set entry_date, entry_time, and duration_hours for active timers (satisfies NOT NULL constraints)
        entry_date: now,
        entry_time: formatTimeString(now), // HH:MM:SS format in Europe/Berlin timezone
        duration_hours: 0, // Will be calculated when timer stops
        // Keep date_start for active timers - will be converted to entry_date/time/duration on stop
        date_start: now,
      };
      
      const activeTimeEntry = await timeEntryService.create(newTimeEntryData as CreateTimeEntryDto);

      res.status(201).json({
          message: 'Timer started successfully',
          time_entry: activeTimeEntry
      });
    } catch (err: any) {
        console.error('Start timer error:', err);
        if(err.message.includes("Invalid 'project_id' specified.")) {
            res.status(400).json({ message: "Validation failed: Invalid project ID provided for timer start." });
        } else {
             res.status(500).json({ message: err.message || 'Internal server error' });
        }
    }
  }

  async stopTimer(req: Request, res: Response): Promise<void> {
      const userId = (req as any).user?.id;
       if (!userId) {
         res.status(401).json({ message: 'Unauthorized. User ID not found.' });
         return;
       }

      try {
        // Find the user's active timer (entry with date_start but no entry_end_time)
        const options = { user_id: userId };
        const activeEntries = await timeEntryService.findAll(options);
        
        const activeTimer = activeEntries.find((entry: any) => entry.date_start && !entry.entry_end_time);

        if (!activeTimer) {
            res.status(404).json({ message: 'No active timer found to stop.' });
            return;
        }

        // Get actual start and end times
        const now = getCurrentTime();
        const actualStartTime = activeTimer.date_start ? new Date(activeTimer.date_start) : now;
        
        // Round times according to billing rules
        const { startTime, endTime, durationHours } = roundTimerToQuarters(actualStartTime, now);

        // Update entry with rounded times and duration
        // Note: hourly_rate should already be set from startTimer, so we don't override it
        const updateData: UpdateTimeEntryDto = {
          entry_date: startTime,
          entry_time: formatTimeString(startTime), // Rounded start time in Europe/Berlin timezone
          entry_end_time: formatTimeString(endTime), // Rounded end time in Europe/Berlin timezone
          duration_hours: durationHours, // Calculated from rounded times with 15min minimum
          date_start: startTime, // Update date_start with rounded time for consistency
        };

        const updatedEntry = await timeEntryService.update(activeTimer.id, updateData);

        if (!updatedEntry) {
             res.status(500).json({ message: 'Failed to stop timer.' });
            return;
        }

        res.status(200).json({
            message: 'Timer stopped successfully',
            time_entry: updatedEntry
        });

      } catch (err: any) {
          console.error('Stop timer error:', err);
          res.status(500).json({ message: err.message || 'Internal server error' });
      }
  }

  async pauseTimer(req: Request, res: Response): Promise<void> {
    // Pausing is similar to stopping but might imply the timer can be resumed.
    // Timer pause functionality is deprecated with the new single date/time model
    const userId = (req as any).user?.id;
     if (!userId) {
       res.status(401).json({ message: 'Unauthorized. User ID not found.' });
       return;
     }

      try {
         // Timer functionality is deprecated with the new single date/time model
        res.status(501).json({ 
          message: 'Timer pause functionality is not supported in the new time entry model. Time entries are created with a specific duration.' 
        });
        return;

        // Legacy timer code disabled - kept for reference
        /*
         // Find the user's most recent active timer
        const options = { user_id: userId };
        const activeEntries = await timeEntryService.findAll(options);

        let currentActiveEntry: ITimeEntry | null = null;
        if (activeEntries && activeEntries.length > 0) {
            const filteredActive = activeEntries.filter(entry => entry.date_start !== null);
            if (filteredActive.length > 0) {
                currentActiveEntry = filteredActive[0];
            }
        }

        if (!currentActiveEntry) {
            res.status(404).json({ message: 'No active timer found to pause.' });
            return;
        }

        const updateData: UpdateTimeEntryDto = {};
        // Calculate and set duration

        const pausedEntry = await timeEntryService.update(currentActiveEntry.id, updateData);
        
         if (!pausedEntry) {
             res.status(500).json({ message: 'Failed to pause timer.' });
            return;
        }

        res.status(200).json({
            message: 'Timer paused successfully',
            time_entry: pausedEntry
        });
        */
      } catch (err: any) {
          console.error('Pause timer error:', err);
          res.status(500).json({ message: err.message || 'Internal server error' });
      }
  }

}
