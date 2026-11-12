/**
 * React Query hooks for the workflow engine: flows, runs and tasks.
 *
 * Every write refreshes all workflow queries — a settled task moves its run,
 * a started run changes a flow's counters, and so on. (The app-wide refresh in
 * lib/dataSync covers the business data an action may have changed.)
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  approveWorkflowTask,
  cancelWorkflowRun,
  completeWorkflowTask,
  createWorkflowDefinition,
  deleteWorkflowDefinition,
  dismissWorkflowTask,
  getWorkflowCatalog,
  getWorkflowDefinition,
  getWorkflowDefinitions,
  getWorkflowRun,
  getWorkflowRuns,
  getWorkflowTaskCount,
  getWorkflowTasks,
  getWorkflowTemplates,
  publishWorkflowDefinition,
  rejectWorkflowTask,
  retryWorkflowStep,
  setWorkflowDefinitionStatus,
  skipWorkflowStep,
  skipWorkflowTask,
  startWorkflowRun,
  updateWorkflowDefinition,
  validateWorkflowDefinition,
} from '../../api/services/workflow.service';
import type {
  CompleteTaskPayload,
  CreateWorkflowPayload,
  UpdateWorkflowPayload,
  WorkflowRunFilters,
  WorkflowTaskFilter,
} from '../../api/services/workflow.service';
import type {
  StartRunRequest,
  WorkflowDefinition,
  WorkflowDefinitionStatus,
  WorkflowGraph,
} from '../../api/types/workflow.types';
import { queryKeys } from './queryKeys';

/** How often a run on screen is re-read while it can still move on its own. */
const RUN_POLL_MS = { running: 3_000, waiting: 15_000 } as const;
/** How often the open-task badge looks for new tasks (scheduled runs, expired waits). */
const TASK_POLL_MS = 60_000;

// ── Queries ──────────────────────────────────────────────────────────────────

/** Actions, run-data variables and document types the editor offers. Static per server version. */
export const useWorkflowCatalog = () =>
  useQuery({ queryKey: queryKeys.workflows.catalog, queryFn: getWorkflowCatalog, staleTime: Infinity });

/** Templates to start a flow from, in the given language. */
export const useWorkflowTemplates = (enabled = true, lang?: string) =>
  useQuery({
    queryKey: [...queryKeys.workflows.templates, lang],
    queryFn: () => getWorkflowTemplates(lang),
    staleTime: Infinity,
    enabled,
  });

export const useWorkflowDefinitions = (enabled = true) =>
  useQuery({ queryKey: queryKeys.workflows.definitions, queryFn: getWorkflowDefinitions, enabled });

export const useWorkflowDefinition = (id: string | undefined) =>
  useQuery({
    queryKey: queryKeys.workflows.definition(id ?? ''),
    queryFn: () => getWorkflowDefinition(id as string),
    enabled: !!id,
  });

export const useWorkflowRuns = (filters: WorkflowRunFilters = {}, enabled = true) =>
  useQuery({
    queryKey: queryKeys.workflows.runs(filters),
    queryFn: () => getWorkflowRuns(filters),
    enabled,
  });

/** One run with its steps and tasks; re-read while it is running or waiting. */
export const useWorkflowRun = (id: string | undefined) =>
  useQuery({
    queryKey: queryKeys.workflows.run(id ?? ''),
    queryFn: () => getWorkflowRun(id as string),
    enabled: !!id,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'running' || status === 'waiting' ? RUN_POLL_MS[status] : false;
    },
  });

export const useWorkflowTasks = (status: WorkflowTaskFilter = 'open', runId?: string, enabled = true) =>
  useQuery({
    queryKey: queryKeys.workflows.tasks(status, runId),
    queryFn: () => getWorkflowTasks(status, runId),
    enabled,
    refetchInterval: status === 'open' ? TASK_POLL_MS : false,
  });

/** Number of open tasks, for the navigation badge. */
export const useWorkflowTaskCount = (enabled = true) =>
  useQuery({
    queryKey: queryKeys.workflows.taskCount,
    queryFn: getWorkflowTaskCount,
    enabled,
    refetchInterval: TASK_POLL_MS,
    retry: false,
  });

// ── Mutations ────────────────────────────────────────────────────────────────

function useWorkflowWrite<TVariables, TData>(mutationFn: (variables: TVariables) => Promise<TData>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.workflows.all }),
  });
}

export const useCreateWorkflow = () => useWorkflowWrite((payload: CreateWorkflowPayload) => createWorkflowDefinition(payload));

/** Saves the draft. The editor keeps its own state, so the answer only replaces the cached copy. */
export const useUpdateWorkflow = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateWorkflowPayload }) => updateWorkflowDefinition(id, data),
    onSuccess: (definition: WorkflowDefinition) => {
      queryClient.setQueryData(queryKeys.workflows.definition(definition.id), definition);
      return queryClient.invalidateQueries({ queryKey: queryKeys.workflows.definitions });
    },
  });
};

export const useDeleteWorkflow = () => useWorkflowWrite((id: string) => deleteWorkflowDefinition(id));

/** Checks a graph without changing anything. */
export const useValidateWorkflow = () =>
  useMutation({
    mutationFn: ({ id, graph }: { id: string; graph?: WorkflowGraph }) => validateWorkflowDefinition(id, graph),
  });

export const usePublishWorkflow = () => useWorkflowWrite((id: string) => publishWorkflowDefinition(id));

export const useSetWorkflowStatus = () =>
  useWorkflowWrite(({ id, status }: { id: string; status: Exclude<WorkflowDefinitionStatus, 'draft'> }) =>
    setWorkflowDefinitionStatus(id, status)
  );

export const useStartWorkflowRun = () =>
  useWorkflowWrite(({ definitionId, request }: { definitionId: string; request: StartRunRequest }) =>
    startWorkflowRun(definitionId, request)
  );

export const useCancelWorkflowRun = () => useWorkflowWrite((id: string) => cancelWorkflowRun(id));

export const useRetryWorkflowStep = () =>
  useWorkflowWrite(({ runId, stepId }: { runId: string; stepId: string }) => retryWorkflowStep(runId, stepId));

export const useSkipWorkflowStep = () =>
  useWorkflowWrite(({ runId, stepId }: { runId: string; stepId: string }) => skipWorkflowStep(runId, stepId));

export const useCompleteWorkflowTask = () =>
  useWorkflowWrite(({ id, payload }: { id: string; payload?: CompleteTaskPayload }) => completeWorkflowTask(id, payload));

export const useRejectWorkflowTask = () =>
  useWorkflowWrite(({ id, comment }: { id: string; comment?: string }) => rejectWorkflowTask(id, comment));

export const useApproveWorkflowTask = () => useWorkflowWrite((id: string) => approveWorkflowTask(id));

export const useSkipWorkflowTask = () => useWorkflowWrite((id: string) => skipWorkflowTask(id));

export const useDismissWorkflowTask = () => useWorkflowWrite((id: string) => dismissWorkflowTask(id));
