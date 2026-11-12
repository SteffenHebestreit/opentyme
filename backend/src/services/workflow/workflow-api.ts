/**
 * @fileoverview A workflow run's client for OpenTyme's own REST API.
 *
 * Actions do their work through the API rather than through services: the
 * routes carry the validation, the ownership checks and the side effects
 * (several live in controllers), and the run's credential keeps every call
 * within the permissions its flow was published with — the same way the
 * assistant's tools stay within the user's.
 *
 * @module services/workflow/workflow-api
 */

import type { ApiTokenPermissions } from '../auth/api-token-permissions';
import { TOOL_CALL_HEADER } from '../auth/internal-call';
import { mintWorkflowCredential } from './workflow-credential';

/** Read per call, not at load: the address is only known once the server listens (tests use a free port). */
const internalBaseUrl = (): string => process.env.INTERNAL_API_URL ?? 'http://localhost:8000';
const REQUEST_TIMEOUT_MS = 120_000;

/** A refused or failed API call; `message` is what the run's step shows. */
export class WorkflowApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'WorkflowApiError';
  }
}

export type QueryParams = Record<string, string | number | boolean | null | undefined>;

export interface WorkflowUploadFile {
  /** Multipart field name the route expects */
  field: string;
  buffer: Buffer;
  filename: string;
  contentType: string;
}

export interface WorkflowApi {
  get<T = unknown>(path: string, query?: QueryParams): Promise<T>;
  getBinary(path: string, query?: QueryParams): Promise<Buffer>;
  post<T = unknown>(path: string, body?: unknown): Promise<T>;
  put<T = unknown>(path: string, body?: unknown): Promise<T>;
  upload<T = unknown>(path: string, fields: Record<string, string | null | undefined>, file: WorkflowUploadFile): Promise<T>;
}

export interface WorkflowApiIdentity {
  userId: string;
  runId: string;
  permissions: ApiTokenPermissions;
}

function buildUrl(path: string, query?: QueryParams): string {
  const url = new URL(path, internalBaseUrl());
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function failure(response: Response): Promise<WorkflowApiError> {
  let detail = '';
  try {
    const text = await response.text();
    try {
      const body = JSON.parse(text) as { message?: string; error?: string; details?: unknown };
      detail = body.message ?? body.error ?? '';
      if (typeof body.details === 'string') detail = `${detail} ${body.details}`.trim();
    } catch {
      detail = text.slice(0, 300);
    }
  } catch {
    // body unreadable — the status is enough
  }
  return new WorkflowApiError(detail || `The request failed (HTTP ${response.status}).`, response.status);
}

export function createWorkflowApi(identity: WorkflowApiIdentity): WorkflowApi {
  const send = async (method: string, path: string, init: { query?: QueryParams; body?: unknown; form?: FormData }) => {
    const headers: Record<string, string> = {
      // Minted per call, so a long action never runs into an expired credential.
      Authorization: `Bearer ${mintWorkflowCredential(identity)}`,
      [TOOL_CALL_HEADER]: '1',
    };
    let body: string | FormData | undefined;
    if (init.form) {
      body = init.form;
    } else if (init.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(init.body);
    }
    let response: Response;
    try {
      response = await fetch(buildUrl(path, init.query), {
        method,
        headers,
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new WorkflowApiError(`OpenTyme's API could not be reached: ${reason}`, 0);
    }
    if (!response.ok) throw await failure(response);
    return response;
  };

  const json = async <T>(response: Response): Promise<T> => {
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  };

  return {
    get: async <T>(path: string, query?: QueryParams) => json<T>(await send('GET', path, { query })),
    getBinary: async (path: string, query?: QueryParams) =>
      Buffer.from(await (await send('GET', path, { query })).arrayBuffer()),
    post: async <T>(path: string, body?: unknown) => json<T>(await send('POST', path, { body: body ?? {} })),
    put: async <T>(path: string, body?: unknown) => json<T>(await send('PUT', path, { body: body ?? {} })),
    upload: async <T>(path: string, fields: Record<string, string | null | undefined>, file: WorkflowUploadFile) => {
      const form = new FormData();
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined && value !== null && value !== '') form.append(key, value);
      }
      form.append(file.field, new Blob([new Uint8Array(file.buffer)], { type: file.contentType }), file.filename);
      return json<T>(await send('POST', path, { form }));
    },
  };
}
