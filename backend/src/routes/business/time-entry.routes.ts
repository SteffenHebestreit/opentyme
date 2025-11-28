import { Router } from 'express';
import { TimeEntryController } from '../../controllers/business/time-entry.controller';
import { authenticateKeycloak, extractKeycloakUser } from '../../middleware/auth/keycloak.middleware';

const router = Router();
const timeEntryController = new TimeEntryController();

// Apply Keycloak authentication to all routes
router.use(authenticateKeycloak);
router.use(extractKeycloakUser);

/**
 * @openapi
 * /api/time-entries:
 *   post:
 *     tags:
 *       - Time Entries
 *     summary: Create a new time entry
 *     description: Creates a new time entry for tracking work on a project
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [project_id, date_start]
 *             properties:
 *               project_id:
 *                 type: string
 *                 format: uuid
 *               description:
 *                 type: string
 *               date_start:
 *                 type: string
 *                 format: date-time
 *               date_end:
 *                 type: string
 *                 format: date-time
 *               duration_hours:
 *                 type: number
 *                 format: decimal
 *               is_billable:
 *                 type: boolean
 *                 default: true
 *               category:
 *                 type: string
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Time entry created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TimeEntry'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.post('/', timeEntryController.create.bind(timeEntryController));

/**
 * @openapi
 * /api/time-entries:
 *   get:
 *     tags:
 *       - Time Entries
 *     summary: Get all time entries
 *     description: Retrieves all time entries for the authenticated user with optional filtering
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: project_id
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by project ID
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter entries starting from this date
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter entries up to this date
 *       - in: query
 *         name: is_billable
 *         schema:
 *           type: boolean
 *         description: Filter by billable status
 *     responses:
 *       200:
 *         description: List of time entries retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/TimeEntry'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.get('/', timeEntryController.findAll.bind(timeEntryController));

router.post('/start', timeEntryController.startTimer.bind(timeEntryController));

/**
 * @openapi
 * /api/time-entries/stop:
 *   put:
 *     tags:
 *       - Time Entries
 *     summary: Stop a running timer
 *     description: Stops the currently running timer for the user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Timer stopped successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 time_entry:
 *                   $ref: '#/components/schemas/TimeEntry'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         description: No active timer found
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.put('/stop', timeEntryController.stopTimer.bind(timeEntryController));

/**
 * @openapi
 * /api/time-entries/pause:
 *   put:
 *     tags:
 *       - Time Entries
 *     summary: Pause a running timer
 *     description: Pauses the currently running timer for the user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Timer paused successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 time_entry:
 *                   $ref: '#/components/schemas/TimeEntry'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         description: No active timer found
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.put('/pause', timeEntryController.pauseTimer.bind(timeEntryController));

/**
 * @openapi
 * /api/time-entries/{id}:
 *   get:
 *     tags:
 *       - Time Entries
 *     summary: Get a time entry by ID
 *     description: Retrieves a specific time entry by its ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Time entry ID
 *     responses:
 *       200:
 *         description: Time entry retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TimeEntry'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.get('/:id', timeEntryController.findById.bind(timeEntryController));

/**
 * @openapi
 * /api/time-entries/{id}:
 *   put:
 *     tags:
 *       - Time Entries
 *     summary: Update a time entry
 *     description: Updates an existing time entry
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Time entry ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               description:
 *                 type: string
 *               date_start:
 *                 type: string
 *                 format: date-time
 *               date_end:
 *                 type: string
 *                 format: date-time
 *               duration_hours:
 *                 type: number
 *                 format: decimal
 *               is_billable:
 *                 type: boolean
 *               category:
 *                 type: string
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Time entry updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TimeEntry'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.put('/:id', timeEntryController.update.bind(timeEntryController));

/**
 * @openapi
 * /api/time-entries/{id}:
 *   delete:
 *     tags:
 *       - Time Entries
 *     summary: Delete a time entry
 *     description: Deletes a time entry
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Time entry ID
 *     responses:
 *       200:
 *         description: Time entry deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Time entry deleted successfully
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.delete('/:id', timeEntryController.delete.bind(timeEntryController));

/**
 * @openapi
 * /api/time-entries/start:
 *   post:
 *     tags:
 *       - Time Entries
 *     summary: Start a timer
 *     description: Starts a new timer for tracking time on a project
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [project_id]
 *             properties:
 *               project_id:
 *                 type: string
 *                 format: uuid
 *               description:
 *                 type: string
 *               category:
 *                 type: string
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Timer started successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TimeEntry'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.post('/start', timeEntryController.startTimer.bind(timeEntryController));

export default router;
