import { Router } from 'express';
import { RecurringInvoiceController } from '../../controllers/financial/recurring-invoice.controller';
import { authenticateKeycloak, extractKeycloakUser } from '../../middleware/auth/keycloak.middleware';

const router = Router();
const controller = new RecurringInvoiceController();

// All recurring-invoice routes require authentication
router.use(authenticateKeycloak);
router.use(extractKeycloakUser);

/**
 * @openapi
 * /api/recurring-invoices:
 *   get:
 *     tags: [Recurring Invoices]
 *     summary: List the user's recurring invoice schedules
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Array of recurring invoice schedules }
 *   post:
 *     tags: [Recurring Invoices]
 *     summary: Create a recurring invoice schedule (retainer)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       201: { description: Created }
 *       400: { description: Validation error }
 */
router.get('/', controller.list.bind(controller));
router.post('/', controller.create.bind(controller));

/**
 * @openapi
 * /api/recurring-invoices/{id}:
 *   get:
 *     tags: [Recurring Invoices]
 *     summary: Get a recurring invoice schedule
 *     security: [{ bearerAuth: [] }]
 *   put:
 *     tags: [Recurring Invoices]
 *     summary: Update a recurring invoice schedule
 *     security: [{ bearerAuth: [] }]
 *   delete:
 *     tags: [Recurring Invoices]
 *     summary: Delete a recurring invoice schedule
 *     security: [{ bearerAuth: [] }]
 */
router.get('/:id', controller.getById.bind(controller));
router.put('/:id', controller.update.bind(controller));
router.delete('/:id', controller.remove.bind(controller));

/**
 * @openapi
 * /api/recurring-invoices/{id}/generate:
 *   post:
 *     tags: [Recurring Invoices]
 *     summary: Generate any due draft invoices for this schedule now
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Generation result with invoice ids }
 */
router.post('/:id/generate', controller.generateNow.bind(controller));

export default router;
