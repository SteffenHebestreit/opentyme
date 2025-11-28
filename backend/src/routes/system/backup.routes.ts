import { Router } from 'express';
import * as backupController from '../../controllers/system/backup.controller';
import { authenticateKeycloak, extractKeycloakUser, requireAdmin } from '../../middleware/auth/keycloak.middleware';

const router = Router();

// Apply Keycloak authentication and admin role requirement to all routes
router.use(authenticateKeycloak);
router.use(extractKeycloakUser);
router.use(requireAdmin);

// Schedule operations (must be before /:id routes to avoid conflict)
router.post('/schedules', backupController.createSchedule);
router.get('/schedules', backupController.listSchedules);
router.put('/schedules/:id', backupController.updateSchedule);
router.delete('/schedules/:id', backupController.deleteSchedule);

// Cleanup operation (must be before /:id route)
router.post('/cleanup', backupController.cleanupOldBackups);

// Backup operations
router.post('/', backupController.createBackup);
router.get('/', backupController.listBackups);
router.get('/:id', backupController.getBackupById);
router.post('/:id/restore', backupController.restoreBackup);
router.delete('/:id', backupController.deleteBackup);

export default router;
