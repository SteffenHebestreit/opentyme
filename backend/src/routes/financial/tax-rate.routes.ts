import { Router } from 'express';
import { TaxRateController } from '../../controllers/financial/tax-rate.controller';
import { authenticateKeycloak, extractKeycloakUser } from '../../middleware/auth/keycloak.middleware';

const router = Router();
const taxRateController = new TaxRateController();

// Apply Keycloak authentication to all routes
router.use(authenticateKeycloak);
router.use(extractKeycloakUser);

/**
 * @openapi
 * /api/admin/tax-rates:
 *   post:
 *     tags:
 *       - Admin - Tax Rates
 *     summary: Create a new tax rate
 *     description: Creates a new predefined tax rate template that can be selected when creating invoices
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, rate]
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Standard VAT (19%)"
 *               rate:
 *                 type: number
 *                 format: decimal
 *                 example: 19.00
 *               description:
 *                 type: string
 *                 example: "Standard German VAT rate"
 *               is_default:
 *                 type: boolean
 *                 example: true
 *               is_active:
 *                 type: boolean
 *                 example: true
 *               country_code:
 *                 type: string
 *                 example: "DE"
 *               sort_order:
 *                 type: integer
 *                 example: 0
 *     responses:
 *       201:
 *         description: Tax rate created successfully
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post('/', taxRateController.create.bind(taxRateController));

/**
 * @openapi
 * /api/admin/tax-rates:
 *   get:
 *     tags:
 *       - Admin - Tax Rates
 *     summary: Get all tax rates
 *     description: Retrieves all tax rates for the authenticated user
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: active_only
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *     responses:
 *       200:
 *         description: List of tax rates retrieved successfully
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/', taxRateController.findAll.bind(taxRateController));

/**
 * @openapi
 * /api/admin/tax-rates/default:
 *   get:
 *     tags:
 *       - Admin - Tax Rates
 *     summary: Get default tax rate
 *     description: Retrieves the default tax rate for the authenticated user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Default tax rate retrieved successfully
 *       404:
 *         description: No default tax rate set
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/default', taxRateController.findDefault.bind(taxRateController));

/**
 * @openapi
 * /api/admin/tax-rates/{id}:
 *   get:
 *     tags:
 *       - Admin - Tax Rates
 *     summary: Get a tax rate by ID
 *     description: Retrieves a specific tax rate by its ID
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
 *         description: Tax rate retrieved successfully
 *       404:
 *         description: Tax rate not found
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/:id', taxRateController.findById.bind(taxRateController));

/**
 * @openapi
 * /api/admin/tax-rates/{id}:
 *   put:
 *     tags:
 *       - Admin - Tax Rates
 *     summary: Update a tax rate
 *     description: Updates an existing tax rate
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
 *               rate:
 *                 type: number
 *               description:
 *                 type: string
 *               is_default:
 *                 type: boolean
 *               is_active:
 *                 type: boolean
 *               country_code:
 *                 type: string
 *               sort_order:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Tax rate updated successfully
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       404:
 *         description: Tax rate not found
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.put('/:id', taxRateController.update.bind(taxRateController));

/**
 * @openapi
 * /api/admin/tax-rates/{id}/set-default:
 *   patch:
 *     tags:
 *       - Admin - Tax Rates
 *     summary: Set tax rate as default
 *     description: Sets a tax rate as the default for new invoices
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
 *         description: Default tax rate set successfully
 *       404:
 *         description: Tax rate not found
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.patch('/:id/set-default', taxRateController.setAsDefault.bind(taxRateController));

/**
 * @openapi
 * /api/admin/tax-rates/{id}:
 *   delete:
 *     tags:
 *       - Admin - Tax Rates
 *     summary: Delete a tax rate
 *     description: Deletes a tax rate (only if not used by any invoices)
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
 *         description: Tax rate deleted successfully
 *       400:
 *         description: Tax rate is in use by invoices
 *       404:
 *         description: Tax rate not found
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.delete('/:id', taxRateController.delete.bind(taxRateController));

export default router;
