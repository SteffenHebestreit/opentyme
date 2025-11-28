/**
 * @fileoverview Tax Prepayment Routes
 * 
 * Provides REST API endpoints for tax prepayment management:
 * - CRUD operations on tax prepayments
 * - Receipt upload and deletion
 * - Summary statistics
 * 
 * All routes require authentication via Keycloak middleware.
 * 
 * @module routes/financial/tax-prepayment
 */

import { Router } from 'express';
import { TaxPrepaymentController } from '../../controllers/financial/tax-prepayment.controller';
import { authenticateKeycloak, extractKeycloakUser } from '../../middleware/auth/keycloak.middleware';
import multer from 'multer';

// Configure multer for receipt uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow images and PDFs
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images and PDFs are allowed.'));
    }
  },
});

const router = Router();
const taxPrepaymentController = new TaxPrepaymentController();

// Apply authentication to all routes
router.use(authenticateKeycloak);
router.use(extractKeycloakUser);

/**
 * Tax Prepayment CRUD routes
 */

// Get summary/analytics (must be before /:id to avoid conflicts)
router.get('/summary', taxPrepaymentController.getTaxPrepaymentSummary);

// Get all tax prepayments with filtering
router.get('/', taxPrepaymentController.getTaxPrepayments);

// Get single tax prepayment by ID
router.get('/:id', taxPrepaymentController.getTaxPrepaymentById);

// Create new tax prepayment
router.post('/', taxPrepaymentController.createTaxPrepayment);

// Update tax prepayment
router.put('/:id', taxPrepaymentController.updateTaxPrepayment);

// Delete tax prepayment
router.delete('/:id', taxPrepaymentController.deleteTaxPrepayment);

/**
 * Receipt management routes
 */

// Upload receipt for tax prepayment
router.post('/:id/receipt', upload.single('receipt'), taxPrepaymentController.uploadReceipt);

// Download receipt file
router.get('/:id/receipt/download', taxPrepaymentController.downloadReceipt);

// Delete receipt from tax prepayment
router.delete('/:id/receipt', taxPrepaymentController.deleteReceipt);

export default router;
