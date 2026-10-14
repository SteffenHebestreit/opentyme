/**
 * @fileoverview A2A (Agent2Agent protocol 0.3) on top of the OpenTyme assistant.
 *
 * How A2A maps onto assistant conversations:
 *  - contextId = an assistant conversation.
 *  - task      = one user turn: the stored user message that started it (its
 *                id is the task id) plus everything the assistant did in reply,
 *                including approval rounds and follow-ups sent on that task.
 *  - The task's state is DERIVED from the stored conversation, never kept
 *    separately, so it is right wherever the conversation moved on — e.g.
 *    when a token's owner approved its actions in the web app:
 *      run in progress → working · actions awaiting a decision → input-required
 *      · final answer → completed · replaced by a newer turn → canceled
 *      · anything else → failed.
 *    Only an explicit cancel is recorded (on the task's user message).
 *  - Approvals: an input-required task carries the pending actions as a data
 *    part. Answer with a message on that task holding a data part
 *    `{ "decision": "approve" | "reject" }` (all actions) or
 *    `{ "approvals": [{ "toolCallId": "…", "decision": "approve" }] }`.
 *    A text message instead declines them and continues the task with the text.
 *
 * Runs execute in-process (no extra HTTP hop) and keep going when a streaming
 * client disconnects — poll tasks/get. Active runs live in memory, matching
 * the assistant's single-replica run lock.
 *
 * @module services/ai/a2a.service
 */

import { pool } from '../../utils/database';
import { logger } from '../../utils/logger';
import { AIAssistantService, TokenAccess, ToolApprovalDecision } from './ai-assistant.service';
import { EventType } from './ai-events';
import { isRunActive, releaseRunLock, runLockKey, tryAcquireRunLock } from './run-lock';
import { safeParseArgs } from './tool-call-utils';
import { normalizeLanguage } from './system-prompt.builder';

// ── Protocol types (A2A 0.3) ─────────────────────────────────────────────────

export type A2ATaskState =
  | 'submitted'
  | 'working'
  | 'input-required'
  | 'completed'
  | 'canceled'
  | 'failed'
  | 'rejected'
  | 'auth-required'
  | 'unknown';

export type A2APart =
  | { kind: 'text'; text: string; metadata?: Record<string, unknown> }
  | { kind: 'data'; data: Record<string, unknown>; metadata?: Record<string, unknown> }
  | { kind: 'file'; file: Record<string, unknown>; metadata?: Record<string, unknown> };

export interface A2AMessage {
  kind: 'message';
  messageId: string;
  role: 'user' | 'agent';
  parts: A2APart[];
  contextId?: string;
  taskId?: string;
  metadata?: Record<string, unknown>;
}

export interface A2ATask {
  kind: 'task';
  id: string;
  contextId: string;
  status: { state: A2ATaskState; message?: A2AMessage; timestamp: string };
  artifacts?: Array<{ artifactId: string; name?: string; parts: A2APart[] }>;
  history?: A2AMessage[];
}

/** JSON-RPC error codes: the standard ones, A2A's, and two of ours (-32010…). */
export const A2A_ERROR = {
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL: -32603,
  TASK_NOT_FOUND: -32001,
  TASK_NOT_CANCELABLE: -32002,
  PUSH_NOTIFICATIONS_NOT_SUPPORTED: -32003,
  UNSUPPORTED_OPERATION: -32004,
  RUN_IN_PROGRESS: -32010,
  RATE_LIMITED: -32011,
} as const;

export class A2AError extends Error {
  constructor(
    public readonly code: number,
    message: string
  ) {
    super(message);
    this.name = 'A2AError';
  }
}

/** Who is calling, as the assistant needs it. */
export interface A2ACaller {
  userId: string;
  userName: string;
  userEmail: string;
  roles: string[];
  /** Raw Authorization header — tools call the API with it. */
  bearerToken: string;
  access: TokenAccess | null;
}

/** Guardrails shared with the AG-UI endpoint, injected by the controller. */
export interface A2AGuardrails {
  maxMessageLength: number;
  isRateLimited: (userId: string) => boolean;
  looksLikeInjection: (text: string) => boolean;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Task view (derived from the conversation) ────────────────────────────────

interface StoredMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls: unknown[] | null;
  metadata: Record<string, any> | null;
  created_at: Date;
}

function agentMessage(parts: A2APart[], contextId: string, taskId: string, messageId: string): A2AMessage {
  return { kind: 'message', role: 'agent', parts, contextId, taskId, messageId };
}

/** The task's user message, if the caller may see it. */
async function loadTaskStart(caller: A2ACaller, taskId: string) {
  if (!UUID_RE.test(taskId)) return null;
  const params: unknown[] = [taskId, caller.userId];
  let scope = '';
  if (caller.access) {
    params.push(caller.access.tokenId);
    scope = ' AND c.api_token_id = $3';
  }
  const { rows } = await pool().query(
    `SELECT m.id, m.conversation_id, m.content, m.metadata, m.created_at
       FROM ai_messages m
       JOIN ai_conversations c ON c.id = m.conversation_id
      WHERE m.id = $1 AND m.role = 'user' AND c.user_id = $2${scope}`,
    params
  );
  const start = rows[0];
  // A follow-up sent on a task is stored as its own user message; it is part
  // of that task, not a task of its own.
  if (!start || start.metadata?.a2a?.continues) return null;
  return start as { id: string; conversation_id: string; content: string; metadata: Record<string, any> | null; created_at: Date };
}

export async function getTask(caller: A2ACaller, taskId: string, historyLength?: number): Promise<A2ATask> {
  const start = await loadTaskStart(caller, taskId);
  if (!start) throw new A2AError(A2A_ERROR.TASK_NOT_FOUND, `Task ${taskId} not found.`);
  const contextId = start.conversation_id;

  // Everything after the task's message — compared in SQL, since JS dates
  // drop the microseconds Postgres orders by.
  const { rows: later } = await pool().query(
    `SELECT id, role, content, tool_calls, metadata, created_at
       FROM ai_messages
      WHERE conversation_id = $1
        AND (created_at, id) > (SELECT created_at, id FROM ai_messages WHERE id = $2)
      ORDER BY created_at, id`,
    [contextId, taskId]
  );

  const turn: StoredMessage[] = [];
  let superseded = false;
  for (const m of later as StoredMessage[]) {
    if (m.role === 'user' && m.metadata?.a2a?.continues !== taskId) {
      superseded = true;
      break;
    }
    turn.push(m);
  }

  const lastAssistant = [...turn].reverse().find((m) => m.role === 'assistant');
  const answer = [...turn]
    .reverse()
    .find((m) => m.role === 'assistant' && m.content && !(m.tool_calls && m.tool_calls.length));
  const timestamp = new Date((turn[turn.length - 1] ?? start).created_at).toISOString();
  const task: A2ATask = { kind: 'task', id: taskId, contextId, status: { state: 'unknown', timestamp } };

  // A run this process started for the task counts even before its follow-up
  // message is marked as belonging to the task.
  const running = activeRuns.has(taskId) || (!superseded && isRunActive(runLockKey(caller.userId, contextId)));
  if (start.metadata?.a2a?.state === 'canceled') {
    task.status.state = 'canceled';
  } else if (running) {
    task.status.state = 'working';
  } else if (!superseded && lastAssistant?.metadata?.status === 'awaiting_approval') {
    const pending = (lastAssistant.metadata.pending ?? []) as Array<{ id: string; function: { name: string; arguments: string } }>;
    task.status.state = 'input-required';
    task.status.message = agentMessage(
      [
        ...(lastAssistant.content ? [{ kind: 'text' as const, text: lastAssistant.content }] : []),
        {
          kind: 'data',
          data: {
            type: 'approval_request',
            // 'in_app': the token's owner decides in the OpenTyme app — keep polling.
            approvalMode: caller.access?.approvalMode ?? 'self',
            actions: pending.map((tc) => ({
              toolCallId: tc.id,
              toolName: tc.function.name,
              arguments: safeParseArgs(tc.function.arguments),
            })),
          },
        },
      ],
      contextId,
      taskId,
      lastAssistant.id
    );
  } else if (answer) {
    task.status.state = 'completed';
    task.artifacts = [{ artifactId: answer.id, name: 'answer', parts: [{ kind: 'text', text: answer.content! }] }];
  } else if (superseded) {
    task.status.state = 'canceled';
  } else {
    task.status.state = 'failed';
    task.status.message = agentMessage(
      [{ kind: 'text', text: start.metadata?.a2a?.error ?? 'The assistant stopped without an answer.' }],
      contextId,
      taskId,
      `${taskId}-status`
    );
  }

  if (historyLength && historyLength > 0) {
    const history: A2AMessage[] = [
      { kind: 'message', role: 'user', messageId: taskId, contextId, taskId, parts: [{ kind: 'text', text: start.content }] },
      ...turn
        .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content)
        .map(
          (m): A2AMessage => ({
            kind: 'message',
            role: m.role === 'user' ? 'user' : 'agent',
            messageId: m.id,
            contextId,
            taskId,
            parts: [{ kind: 'text', text: m.content! }],
          })
        ),
    ];
    task.history = history.slice(-historyLength);
  }
  return task;
}

// ── Running turns ─────────────────────────────────────────────────────────────

/** Runs of this process, by task id — for cancel. */
const activeRuns = new Map<string, AbortController>();

function textOf(message: A2AMessage): string {
  return message.parts
    .filter((p): p is Extract<A2APart, { kind: 'text' }> => p.kind === 'text' && typeof p.text === 'string')
    .map((p) => p.text)
    .join('\n')
    .trim();
}

/** Approval decisions carried by a data part, if any. */
function decisionsOf(message: A2AMessage, pendingIds: string[]): ToolApprovalDecision[] | null {
  for (const part of message.parts) {
    if (part.kind !== 'data' || !part.data || typeof part.data !== 'object') continue;
    const { decision, approvals } = part.data as { decision?: unknown; approvals?: unknown };
    if (decision === 'approve' || decision === 'reject') {
      return pendingIds.map((toolCallId) => ({ toolCallId, decision }));
    }
    if (Array.isArray(approvals)) {
      return approvals
        .filter(
          (a): a is { toolCallId: string; decision: 'approve' | 'reject' } =>
            !!a && typeof a.toolCallId === 'string' && (a.decision === 'approve' || a.decision === 'reject')
        )
        .map((a) => ({ toolCallId: a.toolCallId, decision: a.decision }));
    }
  }
  return null;
}

export function parseMessage(value: unknown): A2AMessage {
  const m = value as Partial<A2AMessage> | undefined;
  if (!m || typeof m !== 'object' || !Array.isArray(m.parts) || m.parts.length === 0) {
    throw new A2AError(A2A_ERROR.INVALID_PARAMS, 'params.message with at least one part is required.');
  }
  if (m.role !== undefined && m.role !== 'user') {
    throw new A2AError(A2A_ERROR.INVALID_PARAMS, 'Only messages with role "user" can be sent.');
  }
  for (const id of [m.contextId, m.taskId]) {
    if (id !== undefined && (typeof id !== 'string' || !UUID_RE.test(id))) {
      throw new A2AError(A2A_ERROR.INVALID_PARAMS, 'contextId and taskId must be ids returned by this agent.');
    }
  }
  return { kind: 'message', role: 'user', messageId: String(m.messageId ?? ''), ...m } as A2AMessage;
}

export interface TurnHandle {
  taskId: string;
  contextId: string;
  /** Settles when the run has ended (it never rejects). */
  finished: Promise<void>;
}

/**
 * Starts the turn a message asks for — a new task, a follow-up on a task
 * waiting for input, or the decision on its pending actions — and resolves
 * as soon as the task id is known. `listener` receives the assistant's
 * AG-UI events (for streaming).
 */
export async function startTurn(
  caller: A2ACaller,
  message: A2AMessage,
  guardrails: A2AGuardrails,
  listener?: (event: Record<string, unknown>) => void
): Promise<TurnHandle> {
  if (guardrails.isRateLimited(caller.userId)) {
    throw new A2AError(A2A_ERROR.RATE_LIMITED, 'Too many requests — wait a moment.');
  }
  const text = textOf(message).slice(0, guardrails.maxMessageLength);
  if (text && guardrails.looksLikeInjection(text)) {
    throw new A2AError(A2A_ERROR.INVALID_PARAMS, 'Message contains disallowed content.');
  }
  const language = normalizeLanguage(message.metadata?.language);

  let contextId = message.contextId ?? null;
  let approvals: ToolApprovalDecision[] | null = null;
  let batchId: string | undefined;
  const followsTask = message.taskId ?? null;

  if (followsTask) {
    const task = await getTask(caller, followsTask);
    if (contextId && contextId !== task.contextId) {
      throw new A2AError(A2A_ERROR.INVALID_PARAMS, 'taskId does not belong to contextId.');
    }
    contextId = task.contextId;
    if (task.status.state === 'working') {
      throw new A2AError(A2A_ERROR.RUN_IN_PROGRESS, 'The assistant is still working on this task.');
    }
    if (task.status.state !== 'input-required') {
      throw new A2AError(
        A2A_ERROR.INVALID_PARAMS,
        `Task ${followsTask} is ${task.status.state}. Send a new message with only the contextId to continue the conversation.`
      );
    }
    const request = task.status.message?.parts.find((p) => p.kind === 'data') as
      | Extract<A2APart, { kind: 'data' }>
      | undefined;
    const pendingIds = ((request?.data.actions ?? []) as Array<{ toolCallId: string }>).map((a) => a.toolCallId);
    approvals = decisionsOf(message, pendingIds);
    batchId = task.status.message?.messageId;
    if (approvals && caller.access?.approvalMode === 'in_app') {
      throw new A2AError(
        A2A_ERROR.UNSUPPORTED_OPERATION,
        "This token's actions are approved by its owner in the OpenTyme app. Poll tasks/get for the outcome."
      );
    }
    if (approvals && approvals.length === 0) {
      throw new A2AError(A2A_ERROR.INVALID_PARAMS, 'No valid decision in the data part.');
    }
  } else if (decisionsOf(message, [])) {
    throw new A2AError(A2A_ERROR.INVALID_PARAMS, 'Send decisions on the task that is waiting for them (taskId).');
  }
  if (!approvals && !text) {
    throw new A2AError(A2A_ERROR.INVALID_PARAMS, 'The message has no text.');
  }

  // One run per conversation; a brand-new conversation is locked by the service.
  const lockKey = contextId ? runLockKey(caller.userId, contextId) : null;
  if (lockKey && !tryAcquireRunLock(lockKey)) {
    throw new A2AError(A2A_ERROR.RUN_IN_PROGRESS, 'The assistant is still working on this conversation.');
  }

  const abort = new AbortController();
  const svc = new AIAssistantService();
  let taskId: string | null = followsTask;
  let markContinuation: Promise<unknown> = Promise.resolve();
  let startError: A2AError | null = null;
  let lastError: string | null = null;
  let announceStart: () => void = () => undefined;
  const startedSignal = new Promise<void>((resolve) => {
    announceStart = resolve;
  });

  const emit = (event: Record<string, unknown>) => {
    if (event.type === EventType.RUN_STARTED) {
      contextId = String(event.threadId);
      const userMessageId = event.userMessageId as string | undefined;
      if (!followsTask && userMessageId) {
        taskId = userMessageId;
        activeRuns.set(taskId, abort);
      } else if (followsTask && !approvals && userMessageId) {
        markContinuation = pool().query(
          `UPDATE ai_messages SET metadata = jsonb_build_object('a2a', jsonb_build_object('continues', $2::text)) WHERE id = $1`,
          [userMessageId, followsTask]
        );
      }
      announceStart();
    } else if (event.type === EventType.RUN_ERROR) {
      lastError = typeof event.message === 'string' ? event.message : 'The assistant failed.';
      if (!taskId) startError = new A2AError(A2A_ERROR.INVALID_PARAMS, lastError);
      announceStart();
    }
    listener?.(event);
  };

  if (followsTask) activeRuns.set(followsTask, abort);

  const finished = (async () => {
    try {
      await svc.initialize(caller.userId);
      if (approvals) {
        await svc.resumeRun(
          caller.userId,
          contextId!,
          approvals,
          caller.userName,
          caller.userEmail,
          language,
          caller.bearerToken,
          caller.roles,
          emit,
          abort.signal,
          batchId,
          caller.access
        );
      } else {
        await svc.runStream(
          caller.userId,
          contextId,
          text,
          caller.userName,
          caller.userEmail,
          language,
          caller.bearerToken,
          caller.roles,
          emit,
          abort.signal,
          caller.access
        );
      }
    } catch (error: unknown) {
      lastError = 'The assistant failed.';
      logger.error(`[A2A] Run failed: ${error instanceof Error ? error.message : String(error)}`);
      if (!taskId) startError = new A2AError(A2A_ERROR.INTERNAL, lastError);
    } finally {
      if (lockKey) releaseRunLock(lockKey);
      if (taskId) activeRuns.delete(taskId);
      announceStart();
      await markContinuation.catch(() => undefined);
      if (taskId && lastError && !abort.signal.aborted) {
        await pool()
          .query(
            `UPDATE ai_messages SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('a2a', jsonb_build_object('error', $2::text)) WHERE id = $1`,
            [taskId, lastError]
          )
          .catch(() => undefined);
      }
    }
  })();

  await startedSignal;
  if (startError || !taskId) {
    await finished;
    throw startError ?? new A2AError(A2A_ERROR.INTERNAL, 'The assistant could not start.');
  }
  return { taskId, contextId: contextId!, finished };
}

/**
 * Cancels a task: stops it while it runs, or declines the actions it waits
 * for. Finished tasks can't be cancelled.
 */
export async function cancelTask(caller: A2ACaller, taskId: string): Promise<A2ATask> {
  const task = await getTask(caller, taskId);
  const markCanceled = () =>
    pool().query(
      `UPDATE ai_messages SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"a2a": {"state": "canceled"}}'::jsonb WHERE id = $1`,
      [taskId]
    );

  if (task.status.state === 'working') {
    const run = activeRuns.get(taskId);
    if (!run) {
      throw new A2AError(A2A_ERROR.TASK_NOT_CANCELABLE, 'This task is running in the OpenTyme app and cannot be stopped here.');
    }
    run.abort();
    await markCanceled();
  } else if (task.status.state === 'input-required') {
    const lockKey = runLockKey(caller.userId, task.contextId);
    if (!tryAcquireRunLock(lockKey)) {
      throw new A2AError(A2A_ERROR.RUN_IN_PROGRESS, 'The assistant is working on this conversation.');
    }
    try {
      await new AIAssistantService().declinePendingApprovals(task.contextId);
      await markCanceled();
    } finally {
      releaseRunLock(lockKey);
    }
  } else {
    throw new A2AError(A2A_ERROR.TASK_NOT_CANCELABLE, `Task ${taskId} is already ${task.status.state}.`);
  }
  return getTask(caller, taskId);
}
