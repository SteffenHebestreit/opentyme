import { Router } from 'express';
import multer from 'multer';
import {
  authenticateKeycloak,
  extractKeycloakUser,
} from '../../middleware/auth/keycloak.middleware';
import {
  runStream,
  approveRun,
  listConversations,
  getConversation,
  deleteConversation,
  transcribeAudio,
} from '../../controllers/ai/ai-assistant.controller';
import { handleA2ARequest } from '../../controllers/ai/a2a.controller';
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
router.post('/run/:conversationId/approve', approveRun);
router.get('/conversations', listConversations);
router.get('/conversations/:id', getConversation);
router.delete('/conversations/:id', deleteConversation);
router.post('/transcribe', audioUpload.single('audio'), transcribeAudio);

// ── A2A (JSON-RPC 2.0) ─────────────────────────────────────────────────────
// The agent card is public — mounted at app level in routes/index.ts.
router.post('/a2a', handleA2ARequest);

logger.debug('[AI] AI assistant routes configured');

export default router;
