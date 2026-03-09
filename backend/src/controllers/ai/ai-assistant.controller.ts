import { Request, Response } from 'express';
import { logger } from '../../utils/logger';
import { pool } from '../../utils/database';
import { aiAssistantService } from '../../services/ai/ai-assistant.service';
import { openTyMEAgentCard } from '../../services/ai/a2a-agent.service';
import { transcriptionService } from '../../services/ai/transcription.service';

// ── Guardrails ────────────────────────────────────────────────────────────────

const MAX_MESSAGE_LENGTH = 4000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Basic prompt-injection detection: patterns that attempt to override the system role
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /you\s+are\s+now\s+(?:a\s+)?(?:different|new|another)\s+(?:ai|assistant|model)/i,
  /disregard\s+(?:all\s+)?(?:previous\s+)?(?:instructions|rules|guidelines)/i,
  /system\s*:\s*you\s+are/i,
  /\[SYSTEM\]/i,
];

function detectPromptInjection(text: string): boolean {
  return INJECTION_PATTERNS.some((re) => re.test(text));
}

// Simple per-user in-memory rate limiter (requests per minute)
const userRequestCounts = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_RPM = 20;

function checkRateLimit(userId: string): boolean {
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

/**
 * POST /api/ai/run
 * AG-UI SSE streaming endpoint.
 * Body: { message: string, threadId?: string }
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
  if (threadId !== undefined && threadId !== null && !UUID_RE.test(threadId)) {
    res.status(400).json({ error: 'Invalid threadId format' });
    return;
  }

  const bearerToken = req.headers.authorization ?? '';

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const emit = (event: Record<string, unknown>): void => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  try {
    await aiAssistantService.initialize(userId);
    await aiAssistantService.runStream(
      userId,
      threadId ?? null,
      trimmed,
      req.user?.fullName ?? req.user?.username ?? 'User',
      req.user?.email ?? '',
      language ?? 'en',
      bearerToken,
      emit
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`[AI Controller] runStream error: ${msg}`);
    emit({ type: 'RUN_ERROR', message: msg, code: 'INTERNAL' });
  } finally {
    res.write('data: [DONE]\n\n');
    res.end();
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
    const result = await db.query(
      `SELECT id, title, created_at, updated_at
       FROM ai_conversations
       WHERE user_id = $1
       ORDER BY updated_at DESC
       LIMIT 50`,
      [userId]
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

  try {
    const db = pool();

    const convResult = await db.query(
      `SELECT id, title, created_at, updated_at FROM ai_conversations WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    if (convResult.rows.length === 0) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    const msgResult = await db.query(
      `SELECT id, role, content, tool_calls, tool_call_id, tool_name, created_at
       FROM ai_messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC`,
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

  try {
    const db = pool();
    const result = await db.query(
      `DELETE FROM ai_conversations WHERE id = $1 AND user_id = $2`,
      [id, userId]
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
 * GET /.well-known/agent.json  (A2A Agent Card)
 */
export async function getAgentCard(req: Request, res: Response): Promise<void> {
  const card = {
    ...openTyMEAgentCard,
    url: `${req.protocol}://${req.get('host')}`,
  };
  res.json(card);
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
    res.status(400).json({ error: 'No audio file provided (field: audio)' });
    return;
  }

  try {
    const result = await transcriptionService.transcribe(file.buffer, file.mimetype, userId);
    res.json(result);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`[AI Controller] transcribeAudio error: ${msg}`);
    res.status(500).json({ error: msg });
  }
}
