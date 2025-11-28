import { Router } from 'express';
import { InvoiceTextTemplateController } from '../../controllers/financial/invoice-text-template.controller';
import { authenticateKeycloak, extractKeycloakUser } from '../../middleware/auth/keycloak.middleware';

const router = Router();
const templateController = new InvoiceTextTemplateController();

// Apply Keycloak authentication to all routes
router.use(authenticateKeycloak);
router.use(extractKeycloakUser);

/**
 * @openapi
 * /api/admin/invoice-templates:
 *   post:
 *     tags:
 *       - Admin - Invoice Templates
 *     summary: Create a new invoice text template
 *     description: Creates a new reusable text snippet for invoices
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, category, content]
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Small Business Exemption (DE)"
 *               category:
 *                 type: string
 *                 enum: [tax_exemption, payment_terms, legal_notice, footer, header, custom]
 *                 example: "tax_exemption"
 *               content:
 *                 type: string
 *                 example: "Gemäß § 19 UStG wird keine Umsatzsteuer berechnet."
 *               language:
 *                 type: string
 *                 example: "de"
 *               is_default:
 *                 type: boolean
 *                 example: false
 *               is_active:
 *                 type: boolean
 *                 example: true
 *               sort_order:
 *                 type: integer
 *                 example: 0
 *     responses:
 *       201:
 *         description: Template created successfully
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post('/', templateController.create.bind(templateController));

/**
 * @openapi
 * /api/admin/invoice-templates:
 *   get:
 *     tags:
 *       - Admin - Invoice Templates
 *     summary: Get all invoice text templates
 *     description: Retrieves all templates for the authenticated user
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [tax_exemption, payment_terms, legal_notice, footer, header, custom]
 *         description: Filter by category
 *       - in: query
 *         name: active_only
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *     responses:
 *       200:
 *         description: List of templates retrieved successfully
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/', templateController.findAll.bind(templateController));

/**
 * @openapi
 * /api/admin/invoice-templates/defaults:
 *   get:
 *     tags:
 *       - Admin - Invoice Templates
 *     summary: Get default templates
 *     description: Retrieves all default templates for the authenticated user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Default templates retrieved successfully
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/defaults', templateController.findDefaults.bind(templateController));

/**
 * @openapi
 * /api/admin/invoice-templates/{id}:
 *   get:
 *     tags:
 *       - Admin - Invoice Templates
 *     summary: Get a template by ID
 *     description: Retrieves a specific template by its ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Template retrieved successfully
 *       404:
 *         description: Template not found
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/:id', templateController.findById.bind(templateController));

/**
 * @openapi
 * /api/admin/invoice-templates/{id}:
 *   put:
 *     tags:
 *       - Admin - Invoice Templates
 *     summary: Update a template
 *     description: Updates an existing invoice text template
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               category:
 *                 type: string
 *               content:
 *                 type: string
 *               language:
 *                 type: string
 *               is_default:
 *                 type: boolean
 *               is_active:
 *                 type: boolean
 *               sort_order:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Template updated successfully
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       404:
 *         description: Template not found
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.put('/:id', templateController.update.bind(templateController));

/**
 * @openapi
 * /api/admin/invoice-templates/{id}:
 *   delete:
 *     tags:
 *       - Admin - Invoice Templates
 *     summary: Delete a template
 *     description: Deletes an invoice text template
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Template deleted successfully
 *       404:
 *         description: Template not found
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.delete('/:id', templateController.delete.bind(templateController));

export default router;
