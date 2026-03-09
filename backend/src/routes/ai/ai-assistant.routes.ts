import { Router, Request, Response } from 'express';
import multer from 'multer';
import {
  authenticateKeycloak,
  extractKeycloakUser,
} from '../../middleware/auth/keycloak.middleware';
import {
  runStream,
  listConversations,
  getConversation,
  deleteConversation,
  getAgentCard,
  transcribeAudio,
} from '../../controllers/ai/ai-assistant.controller';
import { logger } from '../../utils/logger';

const router = Router();

// Multer for audio uploads (in-memory, max 25 MB)
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg', 'audio/wav', 'audio/flac'];
    cb(null, allowed.includes(file.mimetype));
  },
});

// ── AG-UI / authenticated endpoints ────────────────────────────────────────
router.use(authenticateKeycloak);
router.use(extractKeycloakUser);

router.post('/run', runStream);
router.get('/conversations', listConversations);
router.get('/conversations/:id', getConversation);
router.delete('/conversations/:id', deleteConversation);
router.post('/transcribe', audioUpload.single('audio'), transcribeAudio);

// ── A2A endpoints ───────────────────────────────────────────────────────────
// Agent Card is public — mounted separately at app level in routes/index.ts
// Simple A2A task endpoint (no SDK dependency)
router.post('/a2a', handleA2ATask);

logger.debug('[AI] AI assistant routes configured');

export default router;

// ── A2A minimal handler ─────────────────────────────────────────────────────

interface A2ATaskRequest {
  id?: string;
  message?: {
    role?: string;
    parts?: Array<{ kind: string; text?: string }>;
  };
}

async function handleA2ATask(req: Request, res: Response): Promise<void> {
  const body = req.body as A2ATaskRequest;
  const taskId = body.id ?? `task-${Date.now()}`;

  let userText = '';
  const parts = body.message?.parts ?? [];
  for (const part of parts) {
    if (part.kind === 'text' && part.text) userText += part.text;
  }

  if (!userText.trim()) {
    res.status(400).json({ error: 'No text content in A2A message' });
    return;
  }

  res.json({
    id: taskId,
    status: { state: 'working' },
    artifacts: [
      {
        parts: [
          {
            kind: 'text',
            text: 'A2A task received. For full capabilities, use the AG-UI endpoint POST /api/ai/run with an authenticated Bearer token.',
          },
        ],
      },
    ],
  });
}
