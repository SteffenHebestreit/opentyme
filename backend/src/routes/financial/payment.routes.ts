import { Router } from 'express';
import { PaymentController } from '../../controllers/financial/payment.controller';
import { authenticateKeycloak, extractKeycloakUser } from '../../middleware/auth/keycloak.middleware';

const router = Router();
const paymentController = new PaymentController();

// Apply Keycloak authentication to all routes
router.use(authenticateKeycloak);
router.use(extractKeycloakUser);

// POST /api/payments - Create a new payment
router.post('/', paymentController.create.bind(paymentController));

// GET /api/payments - Get all payments for the current user
router.get('/', paymentController.findAll.bind(paymentController));

// GET /api/payments/:id - Get a specific payment by ID
router.get('/:id', paymentController.findById.bind(paymentController));

// PUT /api/payments/:id - Update an existing payment
router.put('/:id', paymentController.update.bind(paymentController));

// DELETE /api/payments/:id - Delete a payment record
router.delete('/:id', paymentController.delete.bind(paymentController));

// GET /api/payments/invoice/:invoice_id - Get all payments for a specific invoice
router.get('/invoice/:invoice_id', paymentController.getPaymentsByInvoice.bind(paymentController));


export default router;
