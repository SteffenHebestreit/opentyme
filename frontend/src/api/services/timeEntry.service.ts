/**
 * Time Entry Service
 * Handles all HTTP requests related to time entry management.
 * Provides functions for CRUD operations and timer control (start/stop/pause).
 */

import apiClient from './client';
import {
  TimeEntry,
  TimeEntryListParams,
  TimeEntryPayload,
  TimeEntryResponse,
} from '../types';

/**
 * Fetches all time entries with optional filtering.
 * Supports filtering by user_id, project_id, and date range.
 * 
 * @async
 * @param {TimeEntryListParams} [params] - Optional query parameters for filtering
 * @returns {Promise<TimeEntry[]>} Array of time entries matching the filters
 * @throws {Error} If the API request fails
 * 
 * @example
 * // Get all time entries
 * const entries = await fetchTimeEntries();
 * 
 * @example
 * // Get time entries for specific project and date range
 * const entries = await fetchTimeEntries({ 
 *   project_id: 'uuid', 
 *   start_date: '2024-01-01', 
 *   end_date: '2024-01-31' 
 * });
 */
export async function fetchTimeEntries(params?: TimeEntryListParams): Promise<TimeEntry[]> {
  const { data } = await apiClient.get<TimeEntry[]>('/time-entries', { params });
  return data;
}

/**
 * Fetches a single time entry by ID.
 * 
 * @async
 * @param {string} id - UUID of the time entry
 * @returns {Promise<TimeEntry>} The requested time entry
 * @throws {Error} If time entry not found or request fails
 * 
 * @example
 * const entry = await fetchTimeEntry('123e4567-e89b-12d3-a456-426614174000');
 * console.log(entry.description, entry.duration_hours);
 */
export async function fetchTimeEntry(id: string): Promise<TimeEntry> {
  const { data } = await apiClient.get<TimeEntry>(`/time-entries/${id}`);
  return data;
}

/**
 * Creates a new time entry.
 * Duration is auto-calculated from date_start and date_end if not provided.
 * 
 * @async
 * @param {TimeEntryPayload} payload - Time entry data (project_id, description, dates, etc.)
 * @returns {Promise<TimeEntry>} The newly created time entry
 * @throws {Error} If validation fails or project doesn't exist
 * 
 * @example
 * const newEntry = await createTimeEntry({
 *   project_id: 'uuid',
 *   description: 'Development work',
 *   date_start: new Date('2024-01-15T09:00:00Z'),
 *   date_end: new Date('2024-01-15T17:00:00Z'),
 *   is_billable: true
 * });
 */
export async function createTimeEntry(payload: TimeEntryPayload): Promise<TimeEntry> {
  const { data } = await apiClient.post<{ message: string; time_entry: TimeEntry }>(
    '/time-entries',
    payload
  );
  return data.time_entry;
}

/**
 * Updates an existing time entry with partial data.
 * Only provided fields will be updated.
 * 
 * @async
 * @param {string} id - UUID of the time entry to update
 * @param {Partial<TimeEntryPayload>} payload - Partial time entry data to update
 * @returns {Promise<TimeEntry>} The updated time entry
 * @throws {Error} If time entry not found or validation fails
 * 
 * @example
 * const updated = await updateTimeEntry('uuid', { 
 *   description: 'Updated description',
 *   is_billable: false 
 * });
 */
export async function updateTimeEntry(id: string, payload: Partial<TimeEntryPayload>): Promise<TimeEntry> {
  const { data } = await apiClient.put<{ message: string; time_entry: TimeEntry }>(
    `/time-entries/${id}`,
    payload
  );
  return data.time_entry;
}

/**
 * Deletes a time entry.
 * This action cannot be undone.
 * 
 * @async
 * @param {string} id - UUID of the time entry to delete
 * @returns {Promise<void>}
 * @throws {Error} If time entry not found or deletion fails
 * 
 * @example
 * await deleteTimeEntry('123e4567-e89b-12d3-a456-426614174000');
 * console.log('Time entry deleted successfully');
 */
export async function deleteTimeEntry(id: string): Promise<void> {
  await apiClient.delete(`/time-entries/${id}`);
}

/**
 * Starts a new timer for a specific project.
 * Creates a time entry with status 'active' and date_start set to current time.
 * 
 * @async
 * @param {string} projectId - UUID of the project to track time for
 * @param {Partial<TimeEntryPayload>} [payload] - Optional additional data (description, category, etc.)
 * @returns {Promise<TimeEntryResponse>} Response containing the started time entry
 * @throws {Error} If project not found or timer start fails
 * 
 * @example
 * const response = await startTimer('project-uuid', { 
 *   description: 'Working on feature X' 
 * });
 * console.log('Timer started:', response.time_entry);
 */
export async function startTimer(projectId: string, payload: Partial<TimeEntryPayload> = {}): Promise<TimeEntryResponse> {
  const { data } = await apiClient.post<TimeEntryResponse>('/time-entries/start', {
    project_id: projectId,
    ...payload,
  });
  return data;
}

/**
 * Stops the currently active timer.
 * Sets date_end to current time and calculates final duration_hours.
 * Changes status to 'completed'.
 * 
 * @async
 * @returns {Promise<TimeEntryResponse>} Response containing the stopped time entry
 * @throws {Error} If no active timer found or stop fails
 * 
 * @example
 * const response = await stopTimer();
 * console.log('Timer stopped. Duration:', response.time_entry.duration_hours, 'hours');
 */
export async function stopTimer(): Promise<TimeEntryResponse> {
  const { data } = await apiClient.put<TimeEntryResponse>('/time-entries/stop');
  return data;
}

/**
 * Pauses the currently active timer.
 * Changes status to 'paused' while keeping date_start and date_end.
 * 
 * @async
 * @returns {Promise<TimeEntryResponse>} Response containing the paused time entry
 * @throws {Error} If no active timer found or pause fails
 * 
 * @example
 * const response = await pauseTimer();
 * console.log('Timer paused:', response.time_entry);
 */
export async function pauseTimer(): Promise<TimeEntryResponse> {
  const { data } = await apiClient.put<TimeEntryResponse>('/time-entries/pause');
  return data;
}

