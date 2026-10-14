import { Router } from 'express';
import { ApiTokenController } from '../../controllers/auth/api-token.controller';
import { authenticateKeycloak, extractKeycloakUser } from '../../middleware/auth/keycloak.middleware';
import { requireInteractiveSession } from '../../middleware/auth/api-token.middleware';

const router = Router();
const controller = new ApiTokenController();

router.use(authenticateKeycloak);
router.use(extractKeycloakUser);

/**
 * @openapi
 * /api/api-tokens/current:
 *   get:
 *     tags:
 *       - API Tokens
 *     summary: Describe the calling API token
 *     description: >
 *       Returns the token the request was made with — its permissions, approval
 *       mode and expiry — and its owner, so a client can check what it may do.
 *       Only callable with a personal access token.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: The calling token and its owner
 *       400:
 *         description: The request was not made with an API token
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/current', controller.current.bind(controller));

// Everything below manages tokens: a signed-in person only, never a token.
router.use(requireInteractiveSession);

/**
 * @openapi
 * /api/api-tokens/catalog:
 *   get:
 *     tags:
 *       - API Tokens
 *     summary: Permissions a token can be given
 *     description: Resources with the levels each supports (none, read, write, delete), capabilities and approval modes.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: The permission catalog
 */
router.get('/catalog', controller.catalog.bind(controller));

/**
 * @openapi
 * /api/api-tokens:
 *   get:
 *     tags:
 *       - API Tokens
 *     summary: List your API tokens
 *     description: Secrets are never returned; token_prefix identifies a token.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: The user's tokens
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Called with an API token
 */
router.get('/', controller.list.bind(controller));

/**
 * @openapi
 * /api/api-tokens:
 *   post:
 *     tags:
 *       - API Tokens
 *     summary: Create an API token
 *     description: The response contains the secret. It is shown only this once.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, permissions, expires_at]
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Claude Code"
 *               description:
 *                 type: string
 *                 nullable: true
 *               permissions:
 *                 type: object
 *                 properties:
 *                   resources:
 *                     type: object
 *                     additionalProperties:
 *                       type: string
 *                       enum: [none, read, write, delete]
 *                     example: { time_entries: "write", projects: "read" }
 *                   capabilities:
 *                     type: array
 *                     items:
 *                       type: string
 *                       enum: [assistant, mcp, email_send]
 *               approval_mode:
 *                 type: string
 *                 enum: [self, in_app]
 *                 default: self
 *               expires_at:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *                 description: A future date, or null for a token that never expires
 *     responses:
 *       201:
 *         description: Token created; `secret` holds the token
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       409:
 *         description: Name already used, or the token limit is reached
 */
router.post('/', controller.create.bind(controller));

/**
 * @openapi
 * /api/api-tokens/{id}:
 *   get:
 *     tags:
 *       - API Tokens
 *     summary: Get an API token
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
 *         description: The token
 *       404:
 *         description: Token not found
 */
router.get('/:id', controller.get.bind(controller));

/**
 * @openapi
 * /api/api-tokens/{id}:
 *   patch:
 *     tags:
 *       - API Tokens
 *     summary: Rename an API token or change its permissions
 *     description: Takes effect on the token's next request. Regenerate to change the expiry.
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
 *         description: Token updated
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       404:
 *         description: Token not found
 */
router.patch('/:id', controller.update.bind(controller));

/**
 * @openapi
 * /api/api-tokens/{id}/regenerate:
 *   post:
 *     tags:
 *       - API Tokens
 *     summary: Issue a new secret for an API token
 *     description: The old secret stops working immediately. Name and permissions are kept.
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
 *             required: [expires_at]
 *             properties:
 *               expires_at:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Token regenerated; `secret` holds the new token
 *       404:
 *         description: Token not found
 */
router.post('/:id/regenerate', controller.regenerate.bind(controller));

/**
 * @openapi
 * /api/api-tokens/{id}:
 *   delete:
 *     tags:
 *       - API Tokens
 *     summary: Revoke an API token
 *     description: The token stops working on its next request.
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
 *         description: Token revoked
 *       404:
 *         description: Token not found
 */
router.delete('/:id', controller.remove.bind(controller));

export default router;
