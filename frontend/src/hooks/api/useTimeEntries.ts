/**
 * Time Entry React Query Hooks
 * Provides hooks for managing time entries using React Query.
 * Handles data fetching, caching, mutations, and automatic cache invalidation.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createTimeEntry,
  deleteTimeEntry,
  fetchTimeEntries,
  fetchTimeEntry,
  pauseTimer,
  startTimer,
  stopTimer,
  updateTimeEntry,
} from '../../api/services/timeEntry.service';
import {
  TimeEntry,
  TimeEntryListParams,
  TimeEntryPayload,
  TimeEntryResponse,
} from '../../api/types';
import { queryKeys } from './queryKeys';

/**
 * Hook for fetching time entries with optional filtering.
 * Supports filtering by user_id, project_id, and date range.
 * Results are cached by React Query based on the filter parameters.
 * 
 * @param {TimeEntryListParams} [params] - Optional query parameters for filtering
 * @returns {UseQueryResult<TimeEntry[]>} React Query result containing time entries array
 * 
 * @example
 * // Get all time entries
 * const { data: entries, isLoading } = useTimeEntries();
 * 
 * @example
 * // Get time entries for specific project
 * const { data: projectEntries } = useTimeEntries({ project_id: 'uuid' });
 * 
 * @example
 * // Get time entries for date range
 * const { data: monthEntries } = useTimeEntries({ 
 *   start_date: '2024-01-01', 
 *   end_date: '2024-01-31' 
 * });
 */
export function useTimeEntries(params?: TimeEntryListParams) {
  return useQuery<TimeEntry[]>({
    queryKey: queryKeys.timeEntries.list(params),
    queryFn: () => fetchTimeEntries(params),
  });
}

/**
 * Hook for fetching a single time entry by ID.
 * Query is automatically disabled if ID is undefined.
 * 
 * @param {string | undefined} id - UUID of the time entry
 * @returns {UseQueryResult<TimeEntry>} React Query result containing the time entry
 * 
 * @example
 * const { data: entry, isLoading, error } = useTimeEntry(timeEntryId);
 * if (entry) {
 *   console.log(entry.description, entry.duration_hours);
 * }
 */
export function useTimeEntry(id: string | undefined) {
  return useQuery<TimeEntry>({
    queryKey: queryKeys.timeEntries.detail(id ?? 'pending'),
    queryFn: () => fetchTimeEntry(id as string),
    enabled: Boolean(id),
  });
}

/**
 * Hook for creating a new time entry.
 * Automatically invalidates the time entries list cache on success.
 * 
 * @returns {UseMutationResult} React Query mutation result
 * 
 * @example
 * const createMutation = useCreateTimeEntry();
 * 
 * const handleCreate = () => {
 *   createMutation.mutate({
 *     project_id: 'uuid',
 *     description: 'Development work',
 *     date_start: new Date(),
 *     date_end: new Date(),
 *     is_billable: true
 *   });
 * };
 */
export function useCreateTimeEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: TimeEntryPayload) => createTimeEntry(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.timeEntries.all });
      void queryClient.invalidateQueries({ queryKey: ['time-entries-day'] });
    },
  });
}

/**
 * Hook for updating an existing time entry.
 * Automatically invalidates the time entries list and detail caches on success.
 * 
 * @returns {UseMutationResult} React Query mutation result
 * 
 * @example
 * const updateMutation = useUpdateTimeEntry();
 * 
 * const handleUpdate = (id: string) => {
 *   updateMutation.mutate({ 
 *     id, 
 *     payload: { 
 *       description: 'Updated description',
 *       is_billable: false 
 *     } 
 *   });
 * };
 */
export function useUpdateTimeEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<TimeEntryPayload> }) =>
      updateTimeEntry(id, payload),
    onSuccess: (_entry: TimeEntry, variables: { id: string; payload: Partial<TimeEntryPayload> }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.timeEntries.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.timeEntries.detail(variables.id) });
      void queryClient.invalidateQueries({ queryKey: ['time-entries-day'] });
    },
  });
}

/**
 * Hook for deleting a time entry.
 * Automatically invalidates the time entries list cache on success.
 * 
 * @returns {UseMutationResult} React Query mutation result
 * 
 * @example
 * const deleteMutation = useDeleteTimeEntry();
 * 
 * const handleDelete = (id: string) => {
 *   if (confirm('Delete this time entry?')) {
 *     deleteMutation.mutate(id);
 *   }
 * };
 */
export function useDeleteTimeEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteTimeEntry(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.timeEntries.all });
      void queryClient.invalidateQueries({ queryKey: ['time-entries-day'] });
    },
  });
}

/**
 * Hook for starting a timer for a specific project.
 * Creates a new time entry with status 'active' and date_start set to current time.
 * Automatically invalidates the time entries list cache on success.
 * 
 * @returns {UseMutationResult} React Query mutation result
 * 
 * @example
 * const startTimerMutation = useStartTimer();
 * 
 * const handleStartTimer = (projectId: string) => {
 *   startTimerMutation.mutate({ 
 *     projectId, 
 *     payload: { description: 'Working on feature X' } 
 *   });
 * };
 */
export function useStartTimer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, payload }: { projectId: string; payload?: Partial<TimeEntryPayload> }) =>
      startTimer(projectId, payload),
    onSuccess: (_response: TimeEntryResponse) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.timeEntries.all });
    },
  });
}

/**
 * Hook for stopping the currently active timer.
 * Sets date_end to current time and calculates final duration_hours.
 * Changes status to 'completed'.
 * Automatically invalidates the time entries list cache on success.
 * 
 * @returns {UseMutationResult} React Query mutation result
 * 
 * @example
 * const stopTimerMutation = useStopTimer();
 * 
 * const handleStopTimer = () => {
 *   stopTimerMutation.mutate();
 * };
 */
export function useStopTimer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => stopTimer(),
    onSuccess: (_response: TimeEntryResponse) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.timeEntries.all });
    },
  });
}

/**
 * Hook for pausing the currently active timer.
 * Changes status to 'paused' while keeping date_start and date_end.
 * Automatically invalidates the time entries list cache on success.
 * 
 * @returns {UseMutationResult} React Query mutation result
 * 
 * @example
 * const pauseTimerMutation = usePauseTimer();
 * 
 * const handlePauseTimer = () => {
 *   pauseTimerMutation.mutate();
 * };
 */
export function usePauseTimer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => pauseTimer(),
    onSuccess: (_response: TimeEntryResponse) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.timeEntries.all });
    },
  });
}

