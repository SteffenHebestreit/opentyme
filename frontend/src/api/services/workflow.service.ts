/**
 * API service for the workflow engine: flows (definitions), runs and tasks.
 * One function per endpoint of docs/WORKFLOW_ENGINE.md; everything is under
 * `/api/workflows`.
 */
import apiClient from './client';
import type {
  StartRunRequest,
  WorkflowCatalog,
  WorkflowDefinition,
  WorkflowDefinitionStatus,
  WorkflowDefinitionSummary,
  WorkflowGraph,
  WorkflowIssue,
  WorkflowRun,
  WorkflowRunStatus,
  WorkflowRunSummary,
  WorkflowSubjectType,
  WorkflowTask,
  WorkflowTemplate,
  WorkflowValidation,
} from '../types/workflow.types';

const BASE = '/workflows';

// ── Catalog and templates ────────────────────────────────────────────────────

/** What the editor offers. What an addon registered comes named in `lang` (the app's language) where the addon ships it. */
export const getWorkflowCatalog = async (lang?: string): Promise<WorkflowCatalog> => {
  const response = await apiClient.get(`${BASE}/catalog`, lang ? { params: { lang } } : undefined);
  return response.data;
};

export interface WorkflowSubjectOption {
  id: string;
  label: string;
}

/** The user's records of one subject type — any registered one, an addon's included — for pickers (at most 200). */
export const getWorkflowSubjectOptions = async (type: WorkflowSubjectType, search?: string): Promise<WorkflowSubjectOption[]> => {
  const response = await apiClient.get(`${BASE}/subjects/${encodeURIComponent(type)}/options`, search ? { params: { search } } : undefined);
  return response.data;
};

/** Templates the server ships, named and labelled in `lang` (the app's language). */
export const getWorkflowTemplates = async (lang?: string): Promise<WorkflowTemplate[]> => {
  const response = await apiClient.get(`${BASE}/templates`, lang ? { params: { lang } } : undefined);
  return response.data;
};

// ── Definitions ──────────────────────────────────────────────────────────────

export type CreateWorkflowPayload =
  | { name: string; description?: string | null; subject_type: WorkflowSubjectType; graph?: WorkflowGraph }
  | { template: string; name?: string; /** Language the template's labels are created in */ lang?: string };

export interface UpdateWorkflowPayload {
  name?: string;
  description?: string | null;
  graph?: WorkflowGraph;
}

export const getWorkflowDefinitions = async (): Promise<WorkflowDefinitionSummary[]> => {
  const response = await apiClient.get(`${BASE}/definitions`);
  return response.data;
};

export const getWorkflowDefinition = async (id: string): Promise<WorkflowDefinition> => {
  const response = await apiClient.get(`${BASE}/definitions/${id}`);
  return response.data;
};

export const createWorkflowDefinition = async (payload: CreateWorkflowPayload): Promise<WorkflowDefinition> => {
  const response = await apiClient.post(`${BASE}/definitions`, payload);
  return response.data;
};

/** Saves the draft; published versions are never touched. */
export const updateWorkflowDefinition = async (id: string, payload: UpdateWorkflowPayload): Promise<WorkflowDefinition> => {
  const response = await apiClient.put(`${BASE}/definitions/${id}`, payload);
  return response.data;
};

export const deleteWorkflowDefinition = async (id: string): Promise<void> => {
  await apiClient.delete(`${BASE}/definitions/${id}`);
};

/** Checks a graph (default: the saved draft) and reports what its actions need. */
export const validateWorkflowDefinition = async (id: string, graph?: WorkflowGraph): Promise<WorkflowValidation> => {
  const response = await apiClient.post(`${BASE}/definitions/${id}/validate`, graph ? { graph } : {});
  return response.data;
};

/** Turns the saved draft into a new version. Fails with 422 `{ message, issues }` if it is invalid. */
export const publishWorkflowDefinition = async (id: string): Promise<WorkflowDefinition> => {
  const response = await apiClient.post(`${BASE}/definitions/${id}/publish`);
  return response.data;
};

export const setWorkflowDefinitionStatus = async (
  id: string,
  status: Exclude<WorkflowDefinitionStatus, 'draft'>
): Promise<WorkflowDefinition> => {
  const response = await apiClient.post(`${BASE}/definitions/${id}/status`, { status });
  return response.data;
};

// ── Runs ─────────────────────────────────────────────────────────────────────

export interface WorkflowRunFilters {
  definition_id?: string;
  subject_type?: WorkflowSubjectType;
  subject_id?: string;
  status?: WorkflowRunStatus;
  limit?: number;
}

/** Starts a run. A duplicate fails with 409 `{ code: 'RUN_EXISTS', run_id }`. */
export const startWorkflowRun = async (definitionId: string, request: StartRunRequest): Promise<WorkflowRun> => {
  const response = await apiClient.post(`${BASE}/definitions/${definitionId}/runs`, request);
  return response.data;
};

export const getWorkflowRuns = async (filters: WorkflowRunFilters = {}): Promise<WorkflowRunSummary[]> => {
  const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== undefined && value !== ''));
  const response = await apiClient.get(`${BASE}/runs`, { params });
  return response.data;
};

export const getWorkflowRun = async (id: string): Promise<WorkflowRun> => {
  const response = await apiClient.get(`${BASE}/runs/${id}`);
  return response.data;
};

export const cancelWorkflowRun = async (id: string): Promise<WorkflowRun> => {
  const response = await apiClient.post(`${BASE}/runs/${id}/cancel`);
  return response.data;
};

export const retryWorkflowStep = async (runId: string, stepId: string): Promise<WorkflowRun> => {
  const response = await apiClient.post(`${BASE}/runs/${runId}/steps/${stepId}/retry`);
  return response.data;
};

export const skipWorkflowStep = async (runId: string, stepId: string): Promise<WorkflowRun> => {
  const response = await apiClient.post(`${BASE}/runs/${runId}/steps/${stepId}/skip`);
  return response.data;
};

// ── Tasks ────────────────────────────────────────────────────────────────────

export type WorkflowTaskFilter = 'open' | 'closed' | 'all';

export const getWorkflowTasks = async (status: WorkflowTaskFilter = 'open', runId?: string): Promise<WorkflowTask[]> => {
  const response = await apiClient.get(`${BASE}/tasks`, { params: runId ? { status, run_id: runId } : { status } });
  return response.data;
};

export const getWorkflowTaskCount = async (): Promise<{ open: number }> => {
  const response = await apiClient.get(`${BASE}/tasks/count`);
  return response.data;
};

/** What settling a task sends, by kind. */
export interface CompleteTaskPayload {
  /** `confirm` */
  comment?: string;
  /** `form` */
  values?: Record<string, unknown>;
  /** `upload` — sent as multipart `file` */
  file?: File;
  /** `upload` — optional title of the stored document */
  title?: string;
}

export const completeWorkflowTask = async (id: string, payload: CompleteTaskPayload = {}): Promise<WorkflowTask> => {
  if (payload.file) {
    const formData = new FormData();
    formData.append('file', payload.file);
    if (payload.title?.trim()) formData.append('title', payload.title.trim());
    const response = await apiClient.post(`${BASE}/tasks/${id}/complete`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  }
  const body: Record<string, unknown> = {};
  if (payload.comment?.trim()) body.comment = payload.comment.trim();
  if (payload.values) body.values = payload.values;
  const response = await apiClient.post(`${BASE}/tasks/${id}/complete`, body);
  return response.data;
};

export const rejectWorkflowTask = async (id: string, comment?: string): Promise<WorkflowTask> => {
  const response = await apiClient.post(`${BASE}/tasks/${id}/reject`, comment?.trim() ? { comment: comment.trim() } : {});
  return response.data;
};

/** Approval tasks: run the prepared action. */
export const approveWorkflowTask = async (id: string): Promise<WorkflowTask> => {
  const response = await apiClient.post(`${BASE}/tasks/${id}/approve`);
  return response.data;
};

/** Approval tasks: skip the action and continue. */
export const skipWorkflowTask = async (id: string): Promise<WorkflowTask> => {
  const response = await apiClient.post(`${BASE}/tasks/${id}/skip`);
  return response.data;
};

/** Notices: mark as read. */
export const dismissWorkflowTask = async (id: string): Promise<WorkflowTask> => {
  const response = await apiClient.post(`${BASE}/tasks/${id}/dismiss`);
  return response.data;
};

// ── Errors ───────────────────────────────────────────────────────────────────

export interface WorkflowApiError {
  status?: number;
  message?: string;
  code?: string;
  /** 422 on publish: why the draft is invalid */
  issues?: WorkflowIssue[];
  /** 409 RUN_EXISTS: the run that already covers this subject and period */
  runId?: string;
}

/** The API's error body for a failed workflow request (empty when there is none). */
export function workflowApiError(error: unknown): WorkflowApiError {
  const response = (error as { response?: { status?: number; data?: unknown } } | null)?.response;
  const data = response?.data && typeof response.data === 'object' ? (response.data as Record<string, unknown>) : {};
  return {
    status: response?.status,
    message: typeof data.message === 'string' ? data.message : undefined,
    code: typeof data.code === 'string' ? data.code : undefined,
    issues: Array.isArray(data.issues) ? (data.issues as WorkflowIssue[]) : undefined,
    runId: typeof data.run_id === 'string' ? data.run_id : undefined,
  };
}
