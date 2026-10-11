/**
 * Streaming chat-completions client for OpenAI-compatible endpoints (LM Studio).
 * Emits AG-UI TEXT_MESSAGE_* events for text chunks while accumulating the full
 * content and any tool calls.
 */

import { AxiosInstance } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../utils/logger';
import { EventType, EventEmitter } from './ai-events';
import { ConversationMessage, LLMToolCall, applyToolContextBudget } from './conversation-history.service';
import { LLMTool } from './openapi-tool-builder.service';

// ---- Error classification ------------------------------------------------------

/** Stable RUN_ERROR codes for model-server failures (the frontend translates by code). */
export type LLMErrorCode =
  | 'LLM_UNREACHABLE'
  | 'LLM_TIMEOUT'
  | 'LLM_AUTH'
  | 'LLM_MODEL'
  | 'LLM_CONTEXT'
  | 'INTERNAL';

/** Generic client-facing messages — never upstream text, hostnames or stack traces. */
export const LLM_ERROR_MESSAGES: Record<LLMErrorCode, string> = {
  LLM_UNREACHABLE: 'The AI model server could not be reached.',
  LLM_TIMEOUT: 'The AI model server did not respond in time.',
  LLM_AUTH: 'The AI model server rejected the configured credentials.',
  LLM_MODEL: 'The configured AI model is not available on the model server.',
  LLM_CONTEXT: 'The conversation is too long for the model\'s context window.',
  INTERNAL: 'The AI assistant ran into an internal error.',
};

/**
 * A classified model-server failure. `message` is the generic client-facing
 * text; `detail` holds the (truncated) upstream reason for server-side logs only.
 */
export class LLMError extends Error {
  readonly code: LLMErrorCode;
  readonly status?: number;
  readonly detail?: string;

  constructor(code: LLMErrorCode, detail?: string, status?: number) {
    super(LLM_ERROR_MESSAGES[code]);
    this.name = 'LLMError';
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

/** True for cancellations caused by the run's AbortSignal (client went away). */
export function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; code?: string };
  return e.name === 'AbortError' || e.name === 'CanceledError' || e.code === 'ERR_CANCELED';
}

const UNREACHABLE_CODES = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ECONNRESET',
  'EPIPE',
  'ERR_INVALID_URL',
  'UND_ERR_SOCKET',
]);
const TIMEOUT_CODES = new Set([
  'ECONNABORTED',
  'ETIMEDOUT',
  'ESOCKETTIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
]);

// Context overflow wording of OpenAI, vLLM, llama.cpp, LM Studio and friends.
// Checked BEFORE the model pattern: "This model's maximum context length…" mentions both.
const CONTEXT_RE =
  /context[ _-]?(length|window|size)|maximum context|context_length_exceeded|exceeds? the (available )?context|n_ctx|too many tokens|prompt is too long|input is too long|reduce the length of the (messages|prompt)/i;
const MODEL_RE =
  /model_not_found|no models? (are )?loaded|(unknown|invalid) model|failed to load model|model\b[^.\n]{0,80}\b(not found|does not exist|not loaded|is not available|not available|unavailable)/i;

/** Classifies an upstream error text (HTTP body or streamed error chunk) without a status. */
export function classifyLLMErrorText(text: string): LLMErrorCode {
  if (CONTEXT_RE.test(text)) return 'LLM_CONTEXT';
  if (MODEL_RE.test(text)) return 'LLM_MODEL';
  if (/unauthori[sz]ed|invalid api key|incorrect api key|authentication/i.test(text)) return 'LLM_AUTH';
  if (/unexpected endpoint/i.test(text)) return 'LLM_UNREACHABLE';
  return 'INTERNAL';
}

/** Classifies an HTTP error response of the chat-completions endpoint. */
export function classifyLLMHttpError(status: number, body: string): LLMErrorCode {
  if (status === 413 || CONTEXT_RE.test(body)) return 'LLM_CONTEXT';
  if (status === 401 || status === 403) return 'LLM_AUTH';
  if (MODEL_RE.test(body)) return 'LLM_MODEL';
  // Endpoint missing at the configured URL (wrong base path): whatever answers
  // there is not a usable chat-completions endpoint.
  if (status === 404 || status === 405 || /unexpected endpoint/i.test(body)) return 'LLM_UNREACHABLE';
  if (status === 502 || status === 503) return 'LLM_UNREACHABLE';
  if (status === 408 || status === 504) return 'LLM_TIMEOUT';
  return 'INTERNAL';
}

const MAX_ERROR_BODY = 16 * 1024;

/** Reads (a bounded prefix of) an error response body — stream, buffer, string or object. */
async function readErrorBody(data: unknown): Promise<string> {
  if (data == null) return '';
  if (typeof data === 'string') return data.slice(0, MAX_ERROR_BODY);
  if (Buffer.isBuffer(data)) return data.toString('utf8', 0, MAX_ERROR_BODY);
  const maybeStream = data as NodeJS.ReadableStream & { destroy?: () => void };
  if (typeof maybeStream.on === 'function' && typeof maybeStream.pipe === 'function') {
    return new Promise<string>((resolve) => {
      let text = '';
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try {
          maybeStream.destroy?.();
        } catch {
          /* ignore */
        }
        resolve(text.slice(0, MAX_ERROR_BODY));
      };
      const timer = setTimeout(finish, 3000);
      maybeStream.on('data', (chunk: Buffer | string) => {
        text += chunk.toString();
        if (text.length >= MAX_ERROR_BODY) finish();
      });
      maybeStream.on('end', finish);
      maybeStream.on('error', finish);
      maybeStream.on('close', finish);
    });
  }
  try {
    return JSON.stringify(data).slice(0, MAX_ERROR_BODY);
  } catch {
    return '';
  }
}

/**
 * Converts any failure of the chat-completions call into an LLMError. Abort
 * errors (client disconnected) pass through unchanged so callers can stop
 * quietly. The upstream body is logged (truncated), never returned to clients.
 */
export async function toLLMError(err: unknown): Promise<unknown> {
  if (err instanceof LLMError || isAbortError(err)) return err;

  const e = err as {
    code?: string;
    message?: string;
    cause?: { code?: string };
    response?: { status?: number; data?: unknown };
  };

  let classified: LLMError;
  if (e?.response && typeof e.response.status === 'number') {
    const status = e.response.status;
    const body = await readErrorBody(e.response.data);
    classified = new LLMError(classifyLLMHttpError(status, body), body.slice(0, 500), status);
  } else {
    const code = e?.code ?? e?.cause?.code ?? '';
    if (TIMEOUT_CODES.has(code)) classified = new LLMError('LLM_TIMEOUT', `${code}`);
    else if (UNREACHABLE_CODES.has(code)) classified = new LLMError('LLM_UNREACHABLE', `${code}`);
    else classified = new LLMError('INTERNAL', String(e?.message ?? err).slice(0, 500));
  }

  logger.warn(
    `[AI] Chat completion failed: ${classified.code}` +
      (classified.status ? ` (HTTP ${classified.status})` : '') +
      (classified.detail ? ` — ${classified.detail.replace(/\s+/g, ' ').slice(0, 300)}` : '')
  );
  return classified;
}

/** The error used when the run's AbortSignal fires (see isAbortError). */
export function abortError(): Error {
  const err = new Error('The run was cancelled');
  err.name = 'AbortError';
  return err;
}

interface LLMStreamChunk {
  error?: unknown;
  choices?: Array<{
    delta?: {
      content?: string;
      tool_calls?: Array<{
        index?: number;
        id?: string;
        type?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason?: string;
  }>;
}

export interface LLMStreamResult {
  content: string;
  toolCalls: LLMToolCall[];
  /** finish_reason of the final chunk — 'length' means the output was truncated. */
  finishReason: string | null;
}

/**
 * Removes Qwen3-style <think>…</think> reasoning from the final content —
 * including a dangling unclosed block when generation was cut off mid-thought.
 * Depending on LM Studio's chat-template config the reasoning may arrive inside
 * delta.content; it must not be persisted, replayed as history, or shown as the
 * answer. (Same pattern as expense-extraction.service.ts.)
 */
function stripThinking(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*$/i, '')
    .trim();
}

export interface StreamChatOptions {
  client: AxiosInstance;
  model: string;
  messages: ConversationMessage[];
  tools: LLMTool[];
  emit: EventEmitter;
  toolChoice?: 'auto' | 'none';
  signal?: AbortSignal;
}

/**
 * Calls the LLM with streaming. Applies the tool-context budget to the outgoing
 * messages, emits TEXT_MESSAGE_* events for streamed text, and returns the
 * accumulated content plus any tool_calls assembled from the delta stream.
 */
export async function streamChatCompletion(options: StreamChatOptions): Promise<LLMStreamResult> {
  const { client, model, messages, tools, emit, toolChoice = 'auto', signal } = options;

  const messageId = uuidv4();
  let accumulatedContent = '';
  let hasEmittedTextStart = false;

  // Stream-time <think> suppression. Stripping only the final content is not
  // enough: raw deltas reach the chat UI and external A2A consumers, and the
  // live stream would diverge from the persisted message. This stateful filter
  // removes think spans as they stream, holding back a possible partial tag at
  // each chunk boundary.
  let inThink = false;
  let tagCarry = '';
  const partialSuffix = (s: string, tag: string): number => {
    for (let k = Math.min(tag.length - 1, s.length); k > 0; k--) {
      if (tag.startsWith(s.slice(-k))) return k;
    }
    return 0;
  };
  const filterThink = (text: string): string => {
    let s = tagCarry + text;
    tagCarry = '';
    let out = '';
    // Case-INSENSITIVE matching (search a lowercased copy, slice the original)
    // so <THINK>/<Think> variants are stripped from the live stream too — the
    // final stripThinking pass is /gi, and the two must agree.
    while (s.length > 0) {
      const lower = s.toLowerCase();
      if (inThink) {
        const end = lower.indexOf('</think>');
        if (end === -1) {
          const p = partialSuffix(lower, '</think>');
          if (p > 0) tagCarry = s.slice(-p);
          s = '';
        } else {
          inThink = false;
          s = s.slice(end + '</think>'.length);
        }
      } else {
        const start = lower.indexOf('<think>');
        if (start === -1) {
          const p = partialSuffix(lower, '<think>');
          out += p > 0 ? s.slice(0, -p) : s;
          if (p > 0) tagCarry = s.slice(-p);
          s = '';
        } else {
          out += s.slice(0, start);
          inThink = true;
          s = s.slice(start + '<think>'.length);
        }
      }
    }
    return out;
  };

  // Sampling: Qwen's function-calling guidance recommends temperature 0.7 /
  // top_p 0.8 for Qwen3-class models and explicitly warns that near-greedy
  // decoding CAUSES repetition and endless tool-call loops on these models
  // (qwen.readthedocs.io function_call docs; model card discussions). Safety
  // against runaway behavior comes from the loop guards + HITL, not low temp.
  const requestBody: Record<string, unknown> = {
    model,
    messages: applyToolContextBudget(messages),
    stream: true,
    temperature: Number(process.env.AI_TEMPERATURE ?? '0.7'),
    top_p: Number(process.env.AI_TOP_P ?? '0.8'),
  };
  if (process.env.AI_PRESENCE_PENALTY) {
    requestBody.presence_penalty = Number(process.env.AI_PRESENCE_PENALTY);
  }
  // Cap output so a runaway generation can't hang the turn; finish_reason
  // 'length' is handled by the caller (truncated tool calls are discarded).
  requestBody.max_tokens = Number(process.env.AI_MAX_OUTPUT_TOKENS ?? '4096');
  if (tools.length > 0 && toolChoice !== 'none') {
    requestBody.tools = tools;
    requestBody.tool_choice = toolChoice;
  }

  let response: { data: unknown };
  try {
    response = await client.post('/chat/completions', requestBody, {
      responseType: 'stream',
      signal,
    });
  } catch (err: unknown) {
    throw await toLLMError(err);
  }
  const stream = response.data as NodeJS.ReadableStream & { destroy: (err?: Error) => void };

  let finishReason: string | null = null;

  // Idle watchdog: the axios timeout only covers time-to-first-response; a
  // server that stalls MID-stream would otherwise hang this promise forever.
  const idleMs = Number(process.env.AI_STREAM_IDLE_TIMEOUT_MS ?? '120000');

  // Tool calls in arrival order. Deltas are routed by `index`, but some
  // servers send parallel calls that all share index 0 with distinct ids —
  // a delta that starts a call (carries a name) with a NEW id begins a new
  // call instead of being merged into the previous one.
  const toolCallList: LLMToolCall[] = [];
  const currentByIndex = new Map<number, { tc: LLMToolCall; serverId: boolean }>();

  try {
    await new Promise<void>((resolve, reject) => {
      let buffer = '';
      let sawData = false;
      let nonSseText = '';
      let settled = false;
      let idleTimer: NodeJS.Timeout | undefined;

      const cleanup = () => {
        if (idleTimer) clearTimeout(idleTimer);
        signal?.removeEventListener('abort', onAbort);
      };
      const succeed = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };
      const fail = (err: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        try {
          stream.destroy();
        } catch {
          /* already destroyed */
        }
        reject(err);
      };
      function onAbort() {
        fail(abortError());
      }
      if (signal?.aborted) {
        fail(abortError());
        return;
      }
      signal?.addEventListener('abort', onAbort, { once: true });

      const armIdle = () => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          fail(new LLMError('LLM_TIMEOUT', `stream stalled — no data for ${idleMs}ms`));
        }, idleMs);
      };
      armIdle();

      stream.on('data', (chunk: Buffer) => {
        if (settled) return;
        armIdle();
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (settled) return;
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (!trimmed.startsWith('data: ')) {
            // Not SSE — keep a bounded copy: a server may answer with a plain
            // JSON error body (e.g. a wrong endpoint) under HTTP 200.
            if (!sawData && nonSseText.length < MAX_ERROR_BODY) nonSseText += `${trimmed}\n`;
            continue;
          }
          sawData = true;

          let parsed: LLMStreamChunk;
          try {
            parsed = JSON.parse(trimmed.slice(6));
          } catch {
            continue; // ignore malformed SSE lines
          }

          // Mid-stream failure reported in-band ({"error": …} instead of choices).
          if (parsed && parsed.error !== undefined && parsed.error !== null && !parsed.choices) {
            const text = typeof parsed.error === 'string' ? parsed.error : JSON.stringify(parsed.error);
            const classified = new LLMError(classifyLLMErrorText(text), text.slice(0, 500));
            logger.warn(
              `[AI] Chat completion stream reported an error: ${classified.code} — ${text.replace(/\s+/g, ' ').slice(0, 300)}`
            );
            fail(classified);
            return;
          }

          const choice = parsed.choices?.[0];
          // Capture finish_reason BEFORE the delta guard — the terminal chunk
          // often carries finish_reason with an empty/absent delta.
          if (choice?.finish_reason) finishReason = choice.finish_reason;
          const delta = choice?.delta;
          if (!delta) continue;

          // Text content (think spans removed before anything sees them)
          if (delta.content) {
            const cleaned = filterThink(delta.content);
            if (cleaned) {
              if (!hasEmittedTextStart) {
                emit({ type: EventType.TEXT_MESSAGE_START, messageId, role: 'assistant' });
                hasEmittedTextStart = true;
              }
              emit({ type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: cleaned });
              accumulatedContent += cleaned;
            }
          }

          // Tool calls
          if (delta.tool_calls) {
            for (const tcDelta of delta.tool_calls) {
              const idx = tcDelta.index ?? 0;
              let cur = currentByIndex.get(idx);
              const startsNewCall =
                !!cur && !!tcDelta.id && cur.serverId && tcDelta.id !== cur.tc.id && !!tcDelta.function?.name;
              if (!cur || startsNewCall) {
                cur = {
                  tc: { id: tcDelta.id || uuidv4(), type: 'function', function: { name: '', arguments: '' } },
                  serverId: !!tcDelta.id,
                };
                currentByIndex.set(idx, cur);
                toolCallList.push(cur.tc);
              } else if (tcDelta.id && !cur.serverId) {
                cur.tc.id = tcDelta.id;
                cur.serverId = true;
              }
              if (tcDelta.function?.name) cur.tc.function.name += tcDelta.function.name;
              if (tcDelta.function?.arguments) cur.tc.function.arguments += tcDelta.function.arguments;
            }
          }
        }
      });

      stream.on('end', () => {
        if (!sawData) {
          // A plain JSON body with an `error` field (no SSE at all) is a failure,
          // not an empty answer.
          const raw = (nonSseText + buffer).trim();
          if (raw) {
            try {
              const body = JSON.parse(raw) as { error?: unknown };
              if (body && body.error !== undefined && body.error !== null) {
                const text = typeof body.error === 'string' ? body.error : JSON.stringify(body.error);
                const classified = new LLMError(classifyLLMErrorText(text), text.slice(0, 500));
                logger.warn(`[AI] Chat completion returned an error body: ${classified.code}`);
                fail(classified);
                return;
              }
            } catch {
              /* not JSON — treat as an (empty) stream */
            }
          }
        }
        succeed();
      });
      stream.on('error', (err: Error) => fail(err));
      // Safety net: a stream destroyed without 'end'/'error' must not leave
      // this promise pending forever.
      stream.on('close', () => {
        if (settled) return;
        fail(
          signal?.aborted
            ? abortError()
            : new LLMError('LLM_UNREACHABLE', 'stream closed before completion')
        );
      });
    });
  } catch (err: unknown) {
    throw await toLLMError(err);
  }

  // A held-back partial that never became a tag is real content after all —
  // emit it as a final delta too so the live stream matches the persisted text.
  if (!inThink && tagCarry) {
    if (!hasEmittedTextStart) {
      emit({ type: EventType.TEXT_MESSAGE_START, messageId, role: 'assistant' });
      hasEmittedTextStart = true;
    }
    emit({ type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: tagCarry });
    accumulatedContent += tagCarry;
  }

  if (hasEmittedTextStart) {
    emit({ type: EventType.TEXT_MESSAGE_END, messageId });
  }

  return {
    // stripThinking stays as a belt-and-braces pass (case variants, missed spans)
    content: stripThinking(accumulatedContent),
    toolCalls: toolCallList,
    finishReason,
  };
}
