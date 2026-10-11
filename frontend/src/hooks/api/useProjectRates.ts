/**
 * @fileoverview React Query hooks for date-effective project hourly rates
 *
 * Every mutation invalidates two things: the project's rate timeline and the
 * projects list. The second one matters because the backend keeps
 * `projects.hourly_rate` in sync as the rate effective today, so changing the
 * timeline changes what the project table shows.
 *
 * @module hooks/api/useProjectRates
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addProjectRate,
  alignProjectRate,
  deleteProjectRate,
  getEffectiveRate,
  getRateImpact,
  listProjectRates,
  updateProjectRate,
} from '@/api/services/project-rate.service';
import type {
  EffectiveProjectRate,
  ProjectRatePayload,
  ProjectRatePeriod,
  ProjectRateUpdatePayload,
  RateImpact,
  SavedProjectRate,
} from '@/api/services/project-rate.service';
import { queryKeys } from './queryKeys';

/**
 * React Query hook for a project's full rate timeline (oldest first).
 * Disabled while no project id is available, so it can be driven straight from
 * the "selected project" state of a list page.
 *
 * @param {string | undefined} projectId - The UUID of the project
 * @param {boolean} [enabled=true] - Additional gate, e.g. "only while the modal is open"
 * @returns {UseQueryResult<ProjectRatePeriod[]>} Query result with the rate periods
 *
 * @example
 * const { data: rates = [], isLoading } = useProjectRates(project?.id, isModalOpen);
 */
export function useProjectRates(projectId: string | undefined, enabled = true) {
  return useQuery<ProjectRatePeriod[]>({
    queryKey: queryKeys.projectRates.list(projectId ?? 'pending'),
    queryFn: () => listProjectRates(projectId as string),
    enabled: enabled && Boolean(projectId),
  });
}

/**
 * React Query hook for the rate effective on a given date — what a time entry
 * on that date would be stamped with.
 *
 * @param {string | undefined} projectId - The UUID of the project
 * @param {string} [date] - Optional `YYYY-MM-DD`; defaults to today on the backend
 * @param {boolean} [enabled=true] - Additional gate
 * @returns {UseQueryResult<EffectiveProjectRate>} Query result with the effective rate
 *
 * @example
 * const { data } = useEffectiveProjectRate(projectId, entryDate);
 * const rate = data?.hourly_rate ?? null;
 */
export function useEffectiveProjectRate(projectId: string | undefined, date?: string, enabled = true) {
  return useQuery<EffectiveProjectRate>({
    queryKey: queryKeys.projectRates.effective(projectId ?? 'pending', date),
    queryFn: () => getEffectiveRate(projectId as string, date),
    enabled: enabled && Boolean(projectId),
  });
}

/**
 * React Query mutation hook for opening a new rate period.
 * A future `valid_from` is allowed — that is how a raise is scheduled ahead of time.
 *
 * @returns {UseMutationResult} Mutation object; rejects with a 409 when a rate already starts on that date
 *
 * @example
 * const addRate = useAddProjectRate();
 * await addRate.mutateAsync({ projectId, payload: { hourly_rate: 150, valid_from: '2026-01-01' } });
 */
export function useAddProjectRate() {
  const queryClient = useQueryClient();
  return useMutation<SavedProjectRate, Error, { projectId: string; payload: ProjectRatePayload }>({
    mutationFn: ({ projectId, payload }) => addProjectRate(projectId, payload),
    onSuccess: (rate) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.projectRates.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
      // Moving logged entries onto the new rate changes them, so neither the
      // time tracking views nor the dashboard totals may keep the old amounts.
      if (rate.repriced_entries) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.timeEntries.all });
        void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.summary });
      }
    },
  });
}

/**
 * React Query mutation hook for correcting an existing rate period.
 * The project id is only carried along so the right timeline can be invalidated.
 *
 * @returns {UseMutationResult} Mutation object; rejects with a 409 on a duplicate start date
 *
 * @example
 * const updateRate = useUpdateProjectRate();
 * await updateRate.mutateAsync({ projectId, rateId, payload: { hourly_rate: 160 } });
 */
export function useUpdateProjectRate() {
  const queryClient = useQueryClient();
  return useMutation<
    SavedProjectRate,
    Error,
    { projectId: string; rateId: string; payload: ProjectRateUpdatePayload }
  >({
    mutationFn: ({ rateId, payload }) => updateProjectRate(rateId, payload),
    onSuccess: (rate) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.projectRates.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
      if (rate.repriced_entries) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.timeEntries.all });
        void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.summary });
      }
    },
  });
}

/**
 * React Query mutation hook for removing a rate period.
 * Removing the only/current period is allowed; the backend re-derives
 * `projects.hourly_rate` from whatever is left.
 *
 * @returns {UseMutationResult} Mutation object
 *
 * @example
 * const deleteRate = useDeleteProjectRate();
 * await deleteRate.mutateAsync({ projectId, rateId });
 */
export function useDeleteProjectRate() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { projectId: string; rateId: string }>({
    mutationFn: ({ rateId }) => deleteProjectRate(rateId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.projectRates.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
      // Entries of the deleted period fall back to the previous rate.
      void queryClient.invalidateQueries({ queryKey: queryKeys.timeEntries.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.summary });
    },
  });
}

/**
 * Previews what a rate starting on `validFrom` would touch — the previous rate,
 * entries already logged in the new period, invoices issued since — so the
 * form can say what will happen BEFORE the user saves.
 *
 * @param {string | undefined} projectId - The project
 * @param {string | undefined} validFrom - Proposed start, YYYY-MM-DD
 * @param {boolean} [enabled=true] - Additional gate
 * @returns {UseQueryResult<RateImpact>} The preview
 */
export function useRateImpact(projectId: string | undefined, validFrom: string | undefined, enabled = true) {
  const isValidDate = Boolean(validFrom && /^\d{4}-\d{2}-\d{2}$/.test(validFrom));
  return useQuery<RateImpact>({
    queryKey: queryKeys.projectRates.impact(projectId ?? 'pending', validFrom ?? 'pending'),
    queryFn: () => getRateImpact(projectId as string, validFrom as string),
    enabled: Boolean(projectId) && isValidDate && enabled,
    staleTime: 10_000,
    placeholderData: (previous) => previous,
  });
}

/**
 * Moves a period's entries onto its rate ("13 entries at 80,00 € — align").
 *
 * @example
 * const align = useAlignProjectRate();
 * await align.mutateAsync({ projectId, rateId, fromRate: 80 });
 */
export function useAlignProjectRate() {
  const queryClient = useQueryClient();
  return useMutation<number, Error, { projectId: string; rateId: string; fromRate?: number | null }>({
    mutationFn: ({ rateId, fromRate }) => alignProjectRate(rateId, fromRate),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.projectRates.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.timeEntries.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.summary });
    },
  });
}
