/**
 * Upload Middleware
 * Provides file upload handling using Multer.
 * Supports in-memory storage with configurable file size limits and type restrictions.
 * Validates file types (JPEG, PNG, PDF by default) and enforces size limits.
 */

import { Request, Response, NextFunction } from 'express';
import multer, { FileFilterCallback } from 'multer'; // Import FileFilterCallback

// Add proper Express + Multer type augmentation
declare global {
  namespace Express {
    namespace Multer {
      interface File {
        fieldname: string;
        originalname: string;
        encoding: string;
        mimetype: string;
        size: number;
        destination: string;
        filename: string;
        path: string;
        buffer: Buffer;
      }
    }
  }
}

// Configure storage for multer
const storage = multer.memoryStorage();

/**
 * Multer upload middleware configuration.
 * Uses in-memory storage for file uploads with size and type restrictions.
 * 
 * Configuration:
 * - Storage: Memory (files stored in req.file.buffer)
 * - Size Limit: Configured via MAX_FILE_SIZE_MB env var (default: 5MB)
 * - Allowed Types: Configured via ALLOWED_UPLOAD_TYPES env var (default: image/jpeg, image/png, application/pdf)
 * - Field Name: 'file' (single file upload)
 * 
 * @constant
 */
/**
 * Multer configuration with file size limits and type restrictions
 */
export const uploadMiddleware = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE_MB || '5') * 1024 * 1024, // Convert MB to bytes (default: 5MB)
  },
  fileFilter: (
    req: Request,
    file: Express.Multer.File, // Use the correct Multer File type
    cb: FileFilterCallback // Use the imported callback type
  ) => {
    const allowedMimes = process.env.ALLOWED_UPLOAD_TYPES?.split(',') || ['image/jpeg', 'image/png', 'application/pdf'];
    
    if (allowedMimes.includes(file.mimetype)) {
      // Allow the file
      cb(null, true);
    } else {
      // Just reject the file without an error
      cb(null, false);
    }
  },
}).single('file'); // 'file' is the field name for uploads

/**
 * Express middleware wrapper for file upload handling.
 * Handles multer errors and provides user-friendly error messages.
 * Validates file size and type before processing.
 * 
 * File is available in req.file after successful upload.
 * 
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @param {NextFunction} next - Express next function
 * @returns {void} Calls next() on success, sends error response on failure
 * 
 * @example
 * // Apply to upload route
 * router.post('/upload', handleUpload, uploadController.uploadFile);
 * 
 * @example
 * // Access uploaded file in controller
 * async function uploadFile(req: Request, res: Response) {
 *   if (!req.file) {
 *     return res.status(400).json({ message: 'No file uploaded' });
 *   }
 *   const { buffer, originalname, mimetype } = req.file;
 *   // Process file...
 * }
 * 
 * @example
 * // Error responses
 * // File too large: 400 "File size exceeds the 5MB limit."
 * // Invalid type: 400 "Invalid file type. Only JPEG, PNG, and PDF files are allowed."
 */
/**
 * Wrapper to handle multer async operations in Express middleware chain
 */
export const handleUpload = (req: Request, res: Response, next: NextFunction) => {
  uploadMiddleware(req, res, (err: any) => {
    if (err) {
      // Handle error based on type
      if (err.code === 'LIMIT_FILE_SIZE') {
        const maxSize = process.env.MAX_FILE_SIZE_MB || '5';
        res.status(400).json({ message: `File size exceeds the ${maxSize}MB limit.` });
        return;
      }
      res.status(400).json({ message: err.message || 'Error uploading file.' });
      return;
    }
    
    // Check if a file was rejected due to type
    if (req.file === undefined && req.body.file) {
      res.status(400).json({ message: 'Invalid file type. Only JPEG, PNG, and PDF files are allowed.' });
      return;
    }
    
    // If no error, proceed to the next middleware or route handler
    next();
  });
};
