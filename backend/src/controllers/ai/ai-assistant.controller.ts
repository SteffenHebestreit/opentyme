import { Request, Response } from 'express';
import { logger } from '../../utils/logger';
import { pool } from '../../utils/database';
import {
  AIAssistantService,
  TokenAccess,
  ToolApprovalDecision,
  toRunErrorEvent,
} from '../../services/ai/ai-assistant.service';
import { transcriptionService, TranscriptionError } from '../../services/ai/transcription.service';
import { normalizeLanguage } from '../../services/ai/system-prompt.builder';
import { runLockKey, tryAcquireRunLock, releaseRunLock } from '../../services/ai/run-lock';

// ── Guardrails ────────────────────────────────────────────────────────────────

export const MAX_MESSAGE_LENGTH = 4000;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Basic prompt-injection detection: patterns that attempt to override the system role
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /you\s+are\s+now\s+(?:a\s+)?(?:different|new|another)\s+(?:ai|assistant|model)/i,
  /disregard\s+(?:all\s+)?(?:previous\s+)?(?:instructions|rules|guidelines)/i,
  /system\s*:\s*you\s+are/i,
  /\[SYSTEM\]/i,
];

export function detectPromptInjection(text: string): boolean {
  return INJECTION_PATTERNS.some((re) => re.test(text));
}

// Simple per-user in-memory rate limiter (requests per minute)
const userRequestCounts = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_RPM = 20;

export function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = userRequestCounts.get(userId);
  if (!entry || now > entry.resetAt) {
    userRequestCounts.set(userId, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= RATE_LIMIT_RPM) return false;
  entry.count++;
  return true;
}

/** The API token behind this request, or null for the signed-in web app. */
export function tokenAccess(req: Request): TokenAccess | null {
  return req.authContext?.method === 'pat'
    ? { tokenId: req.authContext.tokenId, permissions: req.authContext.permissions, approvalMode: req.authContext.approvalMode }
    : null;
}

/**
 * Conversations a request may see: the web app sees all of the user's, a
 * token only those it started — never the owner's other chats.
 */
function conversationScope(req: Request, firstParam: number): { sql: string; params: string[] } {
  const access = tokenAccess(req);
  return access ? { sql: ` AND c.api_token_id = $${firstParam}`, params: [access.tokenId] } : { sql: '', params: [] };
}

// ── SSE plumbing ──────────────────────────────────────────────────────────────

const RUN_IN_PROGRESS_BODY = {
  error: 'The assistant is still working on this conversation. Wait for it to finish.',
  code: 'RUN_IN_PROGRESS',
};

/**
 * Starts an SSE response and returns the event emitter plus the run's
 * AbortSignal and a finish() for the finally block.
 *
 * - `Cache-Control: no-transform` makes the global compression() middleware
 *   skip this response (it would otherwise gzip/brotli-buffer the stream, so
 *   neither events nor keep-alive pings reached the client live); `flush()` is
 *   still called after each write in case a compressor is ever in front.
 * - The run is cancelled when the CLIENT goes away: `res` 'close' before the
 *   response finished. (`req` 'close' cannot be used — on Node ≥ 22 it has
 *   already fired once the request body was consumed, so the old listener
 *   never cancelled anything.)
 */
export function openSseStream(res: Response): {
  emit: (event: Record<string, unknown>) => void;
  signal: AbortSignal;
  finish: () => void;
} {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const flushable = res as Response & { flush?: () => void };
  const write = (chunk: string): void => {
    if (res.writableEnded || res.destroyed) return; // client gone — drop silently
    try {
      res.write(chunk);
      flushable.flush?.();
    } catch {
      /* connection already closed */
    }
  };

  const abort = new AbortController();
  res.on('close', () => {
    if (!res.writableFinished) abort.abort();
  });

  // Keep the SSE stream alive through proxies.
  const keepAlive = setInterval(() => write(': ping\n\n'), 15000);

  return {
    emit: (event) => write(`data: ${JSON.stringify(event)}\n\n`),
    signal: abort.signal,
    finish: () => {
      clearInterval(keepAlive);
      write('data: [DONE]\n\n');
      if (!res.writableEnded) res.end();
    },
  };
}

/**
 * POST /api/ai/run
 * AG-UI SSE streaming endpoint.
 * Body: { message: string, threadId?: string, language?: string ('de' | 'en'; others → 'en') }
 * 409 { error, code: 'RUN_IN_PROGRESS' } when the thread already has an active run.
 */
export async function runStream(req: Request, res: Response): Promise<void> {
  const { message, threadId, language } = req.body as { message: string; threadId?: string; language?: string };

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // Rate limiting
  if (!checkRateLimit(userId)) {
    res.status(429).json({ error: 'Too many requests — please wait a moment' });
    return;
  }

  // Input guardrails
  const trimmed = message.trim().slice(0, MAX_MESSAGE_LENGTH);
  if (detectPromptInjection(trimmed)) {
    logger.warn(`[AI] Prompt injection attempt detected from user ${userId}`);
    res.status(400).json({ error: 'Message contains disallowed content' });
    return;
  }

  // threadId must be a valid UUID if provided
  if (threadId !== undefined && threadId !== null && (typeof threadId !== 'string' || !UUID_RE.test(threadId))) {
    res.status(400).json({ error: 'Invalid threadId format' });
    return;
  }

  // One active run per conversation — refuse BEFORE the SSE stream starts.
  // (A new thread is locked by the service as soon as it has been created.)
  const lockKey = threadId ? runLockKey(userId, threadId) : null;
  if (lockKey && !tryAcquireRunLock(lockKey)) {
    res.status(409).json(RUN_IN_PROGRESS_BODY);
    return;
  }

  const bearerToken = req.headers.authorization ?? '';
  let sse: ReturnType<typeof openSseStream> | undefined;

  // A fresh instance per request — the service holds per-user client/model state
  // that must not be shared across concurrent requests.
  const svc = new AIAssistantService();
  try {
    sse = openSseStream(res);
    await svc.initialize(userId);
    await svc.runStream(
      userId,
      threadId ?? null,
      trimmed,
      req.user?.fullName ?? req.user?.username ?? 'User',
      req.user?.email ?? '',
      normalizeLanguage(language),
      bearerToken,
      req.user?.roles ?? [],
      sse.emit,
      sse.signal,
      tokenAccess(req)
    );
  } catch (error: unknown) {
    const event = toRunErrorEvent(error, sse?.signal, 'runStream controller');
    if (event) sse?.emit(event);
  } finally {
    if (lockKey) releaseRunLock(lockKey);
    sse?.finish();
  }
}

/**
 * POST /api/ai/run/:conversationId/approve
 * AG-UI SSE endpoint. Resumes a run paused for write approval: executes the
 * approved write tool calls (rejected ones are recorded as declined), then
 * continues the assistant loop.
 * Body: { approvals: [{ toolCallId, decision, editedArguments? }], language?, batchId? }
 * batchId (TOOL_APPROVAL_REQUIRED.batchId) — when given and not the current
 * awaiting batch, the run fails with RUN_ERROR STALE_APPROVAL and nothing runs.
 */
export async function approveRun(req: Request, res: Response): Promise<void> {
  const { conversationId } = req.params;
  const { approvals, language, batchId } = req.body as {
    approvals?: ToolApprovalDecision[];
    language?: string;
    batchId?: unknown;
  };

  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  if (!UUID_RE.test(conversationId)) {
    res.status(400).json({ error: 'Invalid conversationId format' });
    return;
  }
  if (!Array.isArray(approvals) || approvals.length === 0) {
    res.status(400).json({ error: 'approvals array is required' });
    return;
  }
  if (tokenAccess(req)?.approvalMode === 'in_app') {
    res.status(403).json({
      error: "This token's actions are approved by its owner in the OpenTyme app. Poll the conversation for the outcome.",
      code: 'APPROVAL_IN_APP',
    });
    return;
  }
  if (!checkRateLimit(userId)) {
    res.status(429).json({ error: 'Too many requests — please wait a moment' });
    return;
  }

  const sanitized: ToolApprovalDecision[] = approvals
    .filter(
      (a) => a && typeof a.toolCallId === 'string' && (a.decision === 'approve' || a.decision === 'reject')
    )
    .map((a) => ({
      toolCallId: a.toolCallId,
      decision: a.decision,
      ...(a.editedArguments && typeof a.editedArguments === 'object' && !Array.isArray(a.editedArguments)
        ? { editedArguments: a.editedArguments }
        : {}),
    }));

  const bearerToken = req.headers.authorization ?? '';

  // One active run per conversation — refuse BEFORE the SSE stream starts.
  const lockKey = runLockKey(userId, conversationId);
  if (!tryAcquireRunLock(lockKey)) {
    res.status(409).json(RUN_IN_PROGRESS_BODY);
    return;
  }

  let sse: ReturnType<typeof openSseStream> | undefined;
  const svc = new AIAssistantService();
  try {
    sse = openSseStream(res);
    await svc.initialize(userId);
    await svc.resumeRun(
      userId,
      conversationId,
      sanitized,
      req.user?.fullName ?? req.user?.username ?? 'User',
      req.user?.email ?? '',
      normalizeLanguage(language),
      bearerToken,
      req.user?.roles ?? [],
      sse.emit,
      sse.signal,
      // Non-string values are passed through so the service reports them as stale.
      batchId === undefined || batchId === null ? undefined : (batchId as string),
      tokenAccess(req)
    );
  } catch (error: unknown) {
    const event = toRunErrorEvent(error, sse?.signal, 'approveRun controller');
    if (event) sse?.emit(event);
  } finally {
    releaseRunLock(lockKey);
    sse?.finish();
  }
}

/**
 * GET /api/ai/conversations
 */
export async function listConversations(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const db = pool();
    const scope = conversationScope(req, 2);
    // api_token_name: which token started it (null = the web app).
    // awaiting_approval: actions wait for a decision (e.g. a token's run in "approve in app" mode).
    const result = await db.query(
      `SELECT c.id, c.title, c.created_at, c.updated_at, c.api_token_id, c.started_by_token,
              t.name AS api_token_name,
              EXISTS (
                SELECT 1 FROM ai_messages m
                WHERE m.conversation_id = c.id AND m.role = 'assistant'
                  AND m.metadata->>'status' = 'awaiting_approval'
              ) AS awaiting_approval
       FROM ai_conversations c
       LEFT JOIN api_tokens t ON t.id = c.api_token_id
       WHERE c.user_id = $1${scope.sql}
       ORDER BY c.updated_at DESC
       LIMIT 50`,
      [userId, ...scope.params]
    );
    res.json(result.rows);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`[AI Controller] listConversations error: ${msg}`);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * GET /api/ai/conversations/:id
 */
export async function getConversation(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  const { id } = req.params;

  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  // Not a UUID → cannot exist (and would make Postgres throw a 500).
  if (!UUID_RE.test(id)) {
    res.status(404).json({ error: 'Conversation not found' });
    return;
  }

  try {
    const db = pool();

    const scope = conversationScope(req, 3);
    const convResult = await db.query(
      `SELECT c.id, c.title, c.created_at, c.updated_at, c.api_token_id, c.started_by_token,
              t.name AS api_token_name
       FROM ai_conversations c
       LEFT JOIN api_tokens t ON t.id = c.api_token_id
       WHERE c.id = $1 AND c.user_id = $2${scope.sql}`,
      [id, userId, ...scope.params]
    );

    if (convResult.rows.length === 0) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    // Bounded: return only the newest 200 messages (in chronological order) —
    // the client displays at most that many, and threads live indefinitely.
    const msgResult = await db.query(
      `SELECT * FROM (
         SELECT id, role, content, tool_calls, tool_call_id, tool_name, metadata, created_at
         FROM ai_messages
         WHERE conversation_id = $1
         ORDER BY created_at DESC, id DESC
         LIMIT 200
       ) sub ORDER BY created_at ASC, id ASC`,
      [id]
    );

    res.json({ ...convResult.rows[0], messages: msgResult.rows });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`[AI Controller] getConversation error: ${msg}`);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * DELETE /api/ai/conversations/:id
 */
export async function deleteConversation(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  const { id } = req.params;

  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  if (!UUID_RE.test(id)) {
    res.status(404).json({ error: 'Conversation not found' });
    return;
  }

  try {
    const db = pool();
    const scope = conversationScope(req, 3);
    const result = await db.query(
      `DELETE FROM ai_conversations c WHERE c.id = $1 AND c.user_id = $2${scope.sql}`,
      [id, userId, ...scope.params]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    res.status(204).send();
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`[AI Controller] deleteConversation error: ${msg}`);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * POST /api/ai/transcribe
 * Accepts audio file (multipart form field 'audio'), returns { text, language, duration }.
 * Engine: fast-whisper or Qwen3 ASR (configured in user settings).
 */
export async function transcribeAudio(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!file) {
    res.status(400).json({ error: 'No audio file provided (field: audio)', code: 'NO_AUDIO' });
    return;
  }

  try {
    const result = await transcriptionService.transcribe(file.buffer, file.mimetype, userId);
    res.json(result);
  } catch (error: unknown) {
    // Classified errors carry a client-safe message + stable code
    // (STT_DISABLED 400, STT_UNREACHABLE 503, STT_TIMEOUT 504, STT_FAILED 502);
    // upstream bodies and hostnames are only logged by the service.
    if (error instanceof TranscriptionError) {
      res.status(error.status).json({ error: error.message, code: error.code });
      return;
    }
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`[AI Controller] transcribeAudio error: ${msg}`);
    res.status(500).json({ error: 'Transcription failed', code: 'INTERNAL' });
  }
}
