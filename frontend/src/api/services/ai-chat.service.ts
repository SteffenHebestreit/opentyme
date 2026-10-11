/**
 * AI Chat API service.
 * Handles SSE streaming via AG-UI protocol and CRUD for conversations.
 */

import { EventType } from '../../types/ag-ui-events';
import type { AgentEvent } from '../../types/ag-ui-events';
import apiClient from './client';
import { getFreshAccessToken } from '../../services/auth/freshToken';
import i18n from '../../i18n/config';

// Guardrails
const MAX_MESSAGE_LENGTH = 4000;
/**
 * Give up when the stream has been silent this long. The backend sends a
 * keep-alive comment every 15 s, so this only fires when the connection is
 * really gone — a long run with a slow local model is fine as long as it lives.
 */
const STREAM_IDLE_TIMEOUT_MS = 75_000;
/** The backend runs tools with the user's token for the whole run — start with plenty left. */
const TOKEN_MIN_VALIDITY_S = 300;

export interface Conversation {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConversationWithMessages extends Conversation {
  messages: ConversationMessage[];
}

/** Persisted tool-call record (OpenAI function-calling shape). */
export interface ToolCallRecord {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCallRecord[] | null;
  tool_call_id?: string;
  tool_name?: string;
  /** Approval state for assistant messages that proposed writes. */
  metadata?: { status?: string; pending?: ToolCallRecord[] } | null;
  created_at: string;
}

// Re-export for consumers
export type { AgentEvent };

/** Why a stream failed — lets the UI explain it and decide what can be retried. */
export type StreamErrorKind =
  | 'auth'
  | 'rate_limit'
  | 'rejected'
  | 'not_found'
  | 'busy'
  | 'network'
  | 'timeout'
  | 'server';

export interface StreamError {
  kind: StreamErrorKind;
  /** Translated, user-facing message */
  message: string;
  status?: number;
}

/** Outcome of a stream. `started` = the server accepted the run (RUN_STARTED arrived). */
export interface StreamResult {
  threadId: string | null;
  started: boolean;
  /** Ended by the caller's own signal (Stop / new conversation) — not an error */
  aborted: boolean;
  error?: StreamError;
}

export interface StreamChatOptions {
  message: string;
  threadId?: string | null;
  onEvent: (event: AgentEvent) => void;
  onDone?: () => void;
  onError?: (message: string, error: StreamError) => void;
  signal?: AbortSignal;
}

interface StreamSSEOptions {
  onEvent: (event: AgentEvent) => void;
  onDone?: () => void;
  onError?: (message: string, error: StreamError) => void;
  signal?: AbortSignal;
}

const tAi = (key: string, fallback: string, options?: Record<string, unknown>) =>
  i18n.t(`common:ai.errors.${key}`, { defaultValue: fallback, ...options }) as string;

/** Map a rejected HTTP response to a typed, translated error. */
async function responseError(response: Response): Promise<StreamError> {
  let detail = '';
  let code = '';
  try {
    const text = await response.text();
    try {
      const body = JSON.parse(text) as { error?: string; message?: string; code?: string };
      detail = body.error ?? body.message ?? '';
      code = body.code ?? '';
    } catch {
      detail = text;
    }
  } catch {
    // body unreadable — the status is enough
  }
  const status = response.status;
  if (status === 409 || code === 'RUN_IN_PROGRESS') {
    return { kind: 'busy', status, message: tAi('busy', 'The assistant is still working on the previous request in this conversation. Please wait a moment.') };
  }
  if (status === 401 || status === 403) {
    return { kind: 'auth', status, message: tAi('auth', 'Your session has expired — please reload the page and sign in again.') };
  }
  if (status === 429) {
    return { kind: 'rate_limit', status, message: tAi('rateLimited', 'Too many requests — please wait a moment and try again.') };
  }
  if (status === 404) {
    return { kind: 'not_found', status, message: tAi('notFound', 'This conversation no longer exists. Start a new one.') };
  }
  if (status === 400 || status === 409 || status === 422) {
    return {
      kind: 'rejected',
      status,
      message: detail ? tAi('rejectedWithReason', 'The request was rejected: {{reason}}', { reason: detail.slice(0, 200) }) : tAi('rejected', 'The request was rejected.'),
    };
  }
  return { kind: 'server', status, message: tAi('server', 'The assistant is not available right now (error {{status}}).', { status }) };
}

/** Lines of an SSE stream → the `data` payload of each complete event. */
function takeEvents(buffer: string): { events: string[]; rest: string } {
  const normalized = buffer.replace(/\r\n?/g, '\n');
  const blocks = normalized.split('\n\n');
  const rest = blocks.pop() ?? '';
  const events: string[] = [];
  for (const block of blocks) {
    const data = block
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).replace(/^ /, ''))
      .join('\n');
    if (data) events.push(data);
  }
  return { events, rest };
}

/**
 * POSTs a JSON body and consumes an AG-UI SSE stream.
 *
 * - The token is refreshed first (fetch bypasses the axios interceptor) and the
 *   request retried once on 401 with a forced refresh.
 * - Times out only when the stream goes silent, not after a fixed total.
 * - Stopping via the caller's signal ends quietly (no error).
 */
async function streamSSE(url: string, body: unknown, options: StreamSSEOptions): Promise<StreamResult> {
  const { onEvent, onDone, onError, signal } = options;
  const result: StreamResult = { threadId: null, started: false, aborted: false };

  const fail = (error: StreamError): StreamResult => {
    result.error = error;
    onError?.(error.message, error);
    return result;
  };

  const idle = new AbortController();
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const armIdleTimer = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => idle.abort(), STREAM_IDLE_TIMEOUT_MS);
  };
  const combinedSignal = signal ? createCombinedSignal(signal, idle.signal) : idle.signal;

  try {
    let response: Response | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await getFreshAccessToken(TOKEN_MIN_VALIDITY_S, attempt > 0);
      if (!token) {
        return fail({ kind: 'auth', message: tAi('auth', 'Your session has expired — please reload the page and sign in again.') });
      }
      armIdleTimer();
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          Accept: 'text/event-stream',
        },
        body: JSON.stringify(body),
        signal: combinedSignal,
      });
      if (response.status !== 401) break;
    }

    if (!response || !response.ok) {
      return fail(response ? await responseError(response) : { kind: 'network', message: tAi('network', 'Connection to the server failed.') });
    }
    if (!response.body) {
      return fail({ kind: 'network', message: tAi('network', 'Connection to the server failed.') });
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const handle = (data: string): boolean => {
      if (data === '[DONE]') return true;
      try {
        const event = JSON.parse(data) as AgentEvent;
        if (event.type === EventType.RUN_STARTED) {
          result.started = true;
          if (event.threadId) result.threadId = event.threadId as string;
        }
        onEvent(event);
      } catch {
        // Ignore a malformed event
      }
      return false;
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        // A last event without its trailing blank line
        const { events } = takeEvents(`${buffer}\n\n`);
        for (const data of events) if (handle(data)) break;
        break;
      }
      armIdleTimer();
      buffer += decoder.decode(value, { stream: true });
      const { events, rest } = takeEvents(buffer);
      buffer = rest;
      for (const data of events) {
        if (handle(data)) {
          void reader.cancel().catch(() => undefined);
          onDone?.();
          return result;
        }
      }
    }

    onDone?.();
    return result;
  } catch (error: unknown) {
    if (signal?.aborted) {
      // Stopped by the user (or a new conversation) — not an error
      result.aborted = true;
      return result;
    }
    if ((error as Error)?.name === 'AbortError') {
      return fail({ kind: 'timeout', message: tAi('timeout', 'The assistant stopped responding. Please try again.') });
    }
    return fail({ kind: 'network', message: tAi('network', 'Connection to the server failed.') });
  } finally {
    if (idleTimer) clearTimeout(idleTimer);
  }
}

/**
 * Stream a chat message using AG-UI SSE protocol.
 */
export async function streamChat(options: StreamChatOptions): Promise<StreamResult> {
  const { message, threadId, onEvent, onDone, onError, signal } = options;

  if (!message || message.trim().length === 0) {
    const error: StreamError = { kind: 'rejected', message: tAi('empty', 'Message cannot be empty') };
    onError?.(error.message, error);
    return { threadId: threadId ?? null, started: false, aborted: false, error };
  }
  const trimmedMessage = message.trim().slice(0, MAX_MESSAGE_LENGTH);

  return streamSSE(
    '/api/ai/run',
    { message: trimmedMessage, threadId: threadId ?? undefined, language: i18n.language },
    { onEvent, onDone, onError, signal }
  );
}

// ── Write-approval (human-in-the-loop) ──────────────────────────────────────

export interface ApprovalAction {
  toolCallId: string;
  toolName: string;
  arguments: Record<string, unknown>;
}

export interface ApprovalDecision {
  toolCallId: string;
  decision: 'approve' | 'reject';
  /** Approve-with-edit: corrected arguments to execute instead of the proposed ones. */
  editedArguments?: Record<string, unknown>;
}

export interface ApproveActionsOptions {
  conversationId: string;
  approvals: ApprovalDecision[];
  /** The batch the decisions are for — the server refuses them if a newer batch replaced it */
  batchId?: string | null;
  onEvent: (event: AgentEvent) => void;
  onDone?: () => void;
  onError?: (message: string, error: StreamError) => void;
  signal?: AbortSignal;
}

/**
 * Resume a run that paused for write approval, streaming the continuation.
 */
export async function approveActions(options: ApproveActionsOptions): Promise<StreamResult> {
  const { conversationId, approvals, batchId, onEvent, onDone, onError, signal } = options;
  return streamSSE(
    `/api/ai/run/${conversationId}/approve`,
    { approvals, language: i18n.language, ...(batchId ? { batchId } : {}) },
    { onEvent, onDone, onError, signal }
  );
}

function createCombinedSignal(...signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort();
      break;
    }
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  return controller.signal;
}

export async function getConversations(): Promise<Conversation[]> {
  const { data } = await apiClient.get<Conversation[]>('/ai/conversations');
  return data;
}

export async function getConversation(id: string): Promise<ConversationWithMessages> {
  const { data } = await apiClient.get<ConversationWithMessages>(`/ai/conversations/${id}`);
  return data;
}

export async function deleteConversation(id: string): Promise<void> {
  await apiClient.delete(`/ai/conversations/${id}`);
}
