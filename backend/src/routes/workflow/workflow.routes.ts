/**
 * @fileoverview Routes of the workflow engine, mounted at /api/workflows.
 *
 * Who may do what:
 * - Looking (flows, runs, tasks, catalog) needs the `workflows` permission to read.
 * - Starting runs and settling tasks needs it to write.
 * - Drawing, publishing and deleting flows needs a signed-in session. Publishing
 *   hands a flow permissions of its own, so — like minting an API token — it is
 *   not something a token may do.
 * - Approving (or skipping) an action also needs a session: the approval exists
 *   so that a person looks at what is about to be sent.
 *
 * @module routes/workflow
 */

import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { authenticateKeycloak, extractKeycloakUser } from '../../middleware/auth/keycloak.middleware';
import * as controller from '../../controllers/workflow/workflow.controller';
import { logger } from '../../utils/logger';

// Same limits and file types as client documents: an uploaded file becomes one.
const ALLOWED_UPLOAD_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.oasis.opendocument.text',
];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_UPLOAD_TYPES.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Invalid file type. Only PDFs, images and Word/ODT documents are allowed.'));
  },
});

function handleUpload(req: Request, res: Response, next: NextFunction): void {
  upload.single('file')(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    const message =
      err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE'
        ? 'File is too large. The maximum size is 25 MB.'
        : err instanceof multer.MulterError
          ? `Upload failed: ${err.message}`
          : err instanceof Error
            ? err.message
            : 'Upload failed.';
    res.status(400).json({ message });
  });
}

function sessionOnly(req: Request, res: Response, next: NextFunction): void {
  if (req.authContext?.method === 'session') {
    next();
    return;
  }
  res.status(403).json({
    error: 'Forbidden',
    message: 'This needs a signed-in session: flows are drawn, published and approved in OpenTyme itself.',
  });
}

const router = Router();

router.use(authenticateKeycloak);
router.use(extractKeycloakUser);

router.get('/catalog', controller.getCatalog);
router.get('/templates', controller.getTemplates);

router.get('/definitions', controller.listDefinitions);
router.post('/definitions', sessionOnly, controller.createDefinition);
router.get('/definitions/:id', controller.getDefinition);
router.put('/definitions/:id', sessionOnly, controller.updateDefinition);
router.delete('/definitions/:id', sessionOnly, controller.deleteDefinition);
router.post('/definitions/:id/validate', controller.validateDefinition);
router.post('/definitions/:id/publish', sessionOnly, controller.publishDefinition);
router.post('/definitions/:id/status', sessionOnly, controller.setDefinitionStatus);
router.post('/definitions/:id/runs', controller.startRun);

router.get('/runs', controller.listRuns);
router.get('/runs/:id', controller.getRun);
router.post('/runs/:id/cancel', controller.cancelRun);
router.post('/runs/:id/steps/:stepId/retry', controller.retryStep);
router.post('/runs/:id/steps/:stepId/skip', controller.skipStep);

router.get('/tasks', controller.listTasks);
router.get('/tasks/count', controller.countTasks);
router.post('/tasks/:id/complete', handleUpload, controller.completeTask);
router.post('/tasks/:id/reject', controller.rejectTask);
router.post('/tasks/:id/approve', sessionOnly, controller.approveTask);
router.post('/tasks/:id/skip', sessionOnly, controller.skipTask);
router.post('/tasks/:id/dismiss', controller.dismissTask);

logger.debug('[Workflow] Workflow routes configured');

export default router;
