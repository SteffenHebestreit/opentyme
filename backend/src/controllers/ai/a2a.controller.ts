/**
 * A2A JSON-RPC endpoint (POST /api/ai/a2a) and the public agent card.
 *
 * Methods: message/send (blocking unless configuration.blocking is false),
 * message/stream (SSE), tasks/get and tasks/cancel. Push notifications and
 * resubscribing are not supported — poll tasks/get instead.
 * See services/ai/a2a.service.ts for how tasks map onto conversations.
 */

import { Request, Response } from 'express';
import { logger } from '../../utils/logger';
import {
  A2A_ERROR,
  A2ACaller,
  A2AError,
  A2AGuardrails,
  A2ATask,
  cancelTask,
  getTask,
  parseMessage,
  startTurn,
} from '../../services/ai/a2a.service';
import { buildAgentCard } from '../../services/ai/a2a-agent.service';
import { EventType } from '../../services/ai/ai-events';
import { checkRateLimit, detectPromptInjection, MAX_MESSAGE_LENGTH, tokenAccess } from './ai-assistant.controller';

type RpcId = string | number | null;

const guardrails: A2AGuardrails = {
  maxMessageLength: MAX_MESSAGE_LENGTH,
  isRateLimited: (userId) => !checkRateLimit(userId),
  looksLikeInjection: detectPromptInjection,
};

const rpcResult = (id: RpcId, result: unknown) => ({ jsonrpc: '2.0', id, result });
const rpcError = (id: RpcId, code: number, message: string) => ({ jsonrpc: '2.0', id, error: { code, message } });

function callerOf(req: Request): A2ACaller {
  return {
    userId: req.user!.id,
    userName: req.user?.fullName ?? req.user?.username ?? 'User',
    userEmail: req.user?.email ?? '',
    roles: req.user?.roles ?? [],
    bearerToken: req.headers.authorization ?? '',
    access: tokenAccess(req),
  };
}

function taskIdOf(params: Record<string, unknown>): string {
  if (typeof params.id !== 'string') throw new A2AError(A2A_ERROR.INVALID_PARAMS, 'params.id is required.');
  return params.id;
}

function historyLengthOf(value: unknown): number | undefined {
  const n = (value as { historyLength?: unknown } | undefined)?.historyLength;
  return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : undefined;
}

/**
 * POST /api/ai/a2a — A2A JSON-RPC 2.0. Protocol errors are JSON-RPC errors
 * (HTTP 200); authentication and permissions are checked like any API call.
 */
export async function handleA2ARequest(req: Request, res: Response): Promise<void> {
  const body = req.body as { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown } | undefined;
  const id: RpcId = typeof body?.id === 'string' || typeof body?.id === 'number' ? body.id : null;
  if (!body || body.jsonrpc !== '2.0' || typeof body.method !== 'string') {
    res.json(rpcError(id, A2A_ERROR.INVALID_REQUEST, 'Expected a JSON-RPC 2.0 request.'));
    return;
  }
  const params = (body.params && typeof body.params === 'object' ? body.params : {}) as Record<string, unknown>;
  const caller = callerOf(req);

  try {
    switch (body.method) {
      case 'message/send':
        res.json(rpcResult(id, await sendMessage(caller, params)));
        return;
      case 'message/stream':
        await streamMessage(caller, params, id, res);
        return;
      case 'tasks/get':
        res.json(rpcResult(id, await getTask(caller, taskIdOf(params), historyLengthOf(params))));
        return;
      case 'tasks/cancel':
        res.json(rpcResult(id, await cancelTask(caller, taskIdOf(params))));
        return;
      case 'tasks/resubscribe':
        throw new A2AError(A2A_ERROR.UNSUPPORTED_OPERATION, 'Resubscribing is not supported; poll tasks/get.');
      default:
        if (body.method.startsWith('tasks/pushNotificationConfig/')) {
          throw new A2AError(A2A_ERROR.PUSH_NOTIFICATIONS_NOT_SUPPORTED, 'Push notifications are not supported.');
        }
        throw new A2AError(A2A_ERROR.METHOD_NOT_FOUND, `Unknown method ${body.method}.`);
    }
  } catch (error: unknown) {
    if (!(error instanceof A2AError)) {
      logger.error(`[A2A] ${body.method} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (res.headersSent) {
      if (!res.writableEnded) res.end();
      return;
    }
    const { code, message } = error instanceof A2AError ? error : { code: A2A_ERROR.INTERNAL, message: 'Internal error.' };
    res.json(rpcError(id, code, message));
  }
}

async function sendMessage(caller: A2ACaller, params: Record<string, unknown>): Promise<A2ATask> {
  const message = parseMessage(params.message);
  const configuration = params.configuration as { blocking?: unknown; historyLength?: unknown } | undefined;
  const turn = await startTurn(caller, message, guardrails);
  if (configuration?.blocking !== false) await turn.finished;
  return getTask(caller, turn.taskId, historyLengthOf(configuration));
}

/**
 * message/stream: the task first, a status update per tool the assistant
 * uses, then the answer (artifact) and the final status. The run continues
 * if the client goes away — it can poll tasks/get.
 */
async function streamMessage(caller: A2ACaller, params: Record<string, unknown>, id: RpcId, res: Response): Promise<void> {
  const message = parseMessage(params.message);

  let send: ((payload: unknown) => void) | null = null;
  const queued: Array<Record<string, unknown>> = [];
  let taskId = '';
  let contextId = '';
  const forward = (event: Record<string, unknown>) => {
    if (event.type !== EventType.TOOL_CALL_START || !send) return;
    send({
      kind: 'status-update',
      taskId,
      contextId,
      final: false,
      status: {
        state: 'working',
        timestamp: new Date().toISOString(),
        message: {
          kind: 'message',
          role: 'agent',
          messageId: String(event.toolCallId),
          taskId,
          contextId,
          parts: [
            { kind: 'text', text: `Using ${String(event.toolCallName)}` },
            { kind: 'data', data: { type: 'tool_call', toolName: event.toolCallName } },
          ],
        },
      },
    });
  };

  const turn = await startTurn(caller, message, guardrails, (event) => (send ? forward(event) : queued.push(event)));
  taskId = turn.taskId;
  contextId = turn.contextId;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  const flushable = res as Response & { flush?: () => void };
  const write = (chunk: string) => {
    if (res.writableEnded || res.destroyed) return;
    res.write(chunk);
    flushable.flush?.();
  };
  const keepAlive = setInterval(() => write(': ping\n\n'), 15000);
  send = (payload) => write(`data: ${JSON.stringify(rpcResult(id, payload))}\n\n`);

  try {
    send(await getTask(caller, taskId));
    queued.splice(0).forEach(forward);
    await turn.finished;

    const final = await getTask(caller, taskId);
    for (const artifact of final.artifacts ?? []) {
      send({ kind: 'artifact-update', taskId, contextId, artifact, lastChunk: true });
    }
    send({ kind: 'status-update', taskId, contextId, status: final.status, final: true });
  } finally {
    clearInterval(keepAlive);
    if (!res.writableEnded) res.end();
  }
}

/** GET /.well-known/agent-card.json (and /.well-known/agent.json) — public. */
export function getAgentCard(req: Request, res: Response): void {
  const base = (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
  res.json(buildAgentCard(base));
}
