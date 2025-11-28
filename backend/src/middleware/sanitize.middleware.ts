/**
 * Sanitization Middleware
 * Provides middleware for sanitizing user input to prevent XSS attacks.
 * Uses DOMPurify with JSDOM to clean HTML content from request body fields.
 * Sanitized data is available in req.sanitizedBody.
 */

import { Request, Response, NextFunction } from 'express';
import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

// Initialize DOMPurify with a window from JSDOM
const window = new JSDOM('').window;
const purify = DOMPurify(window);

// Extend Express's Request type to include sanitizedBody property
declare global {
  namespace Express {
    interface Request {
      sanitizedBody?: any;
    }
  }
}

/**
 * Sanitizes request body fields to prevent XSS attacks.
 * Uses DOMPurify to clean potentially dangerous HTML content.
 * Creates req.sanitizedBody with cleaned data while leaving req.body unchanged.
 * 
 * Automatically sanitizes common fields like name, description, notes, email, etc.
 * Recursively sanitizes nested objects.
 * Arrays are passed through unchanged.
 * 
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @param {NextFunction} next - Express next function
 * @returns {void} Calls next() with req.sanitizedBody populated
 * 
 * @example
 * // Apply to all routes
 * app.use(sanitizeRequestBody);
 * 
 * @example
 * // Apply to specific routes
 * router.post('/clients', sanitizeRequestBody, clientController.create);
 * 
 * @example
 * // Use sanitized data in controller
 * async function create(req: Request, res: Response) {
 *   const cleanData = req.sanitizedBody || req.body;
 *   await clientService.create(cleanData);
 * }
 */
/**
 * Sanitizes request body fields that might contain HTML content
 */
export const sanitizeRequestBody = (req: Request, res: Response, next: NextFunction): void => {
  try {
    if (!req.body) {
      return next();
    }

    // Create a sanitized version of the body
    const sanitizedBody = { ...req.body };

    // Fields that might contain HTML content and need sanitization
    const potentiallyDangerousFields = [
      'name',
      'description', 
      'notes',
      'address',
      'title',
      'content',
      'email',
      'username',
      'first_name',
      'last_name'
    ];

    // Sanitize each potentially dangerous field if it exists
    potentiallyDangerousFields.forEach(field => {
      if (sanitizedBody[field] && typeof sanitizedBody[field] === 'string') {
        sanitizedBody[field] = purify.sanitize(sanitizedBody[field]);
      }
    });

    // For nested objects, recursively sanitize string fields
    const sanitizeNestedObject = (obj: any): any => {
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
        return obj;
      }

      const result: Record<string, any> = {};
      
      for (const key in obj) {
        if (typeof obj[key] === 'string') {
          result[key] = purify.sanitize(obj[key]);
        } else if (typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
          result[key] = sanitizeNestedObject(obj[key]);
        } else {
          result[key] = obj[key];
        }
      }

      return result;
    };

    // If we have nested objects in the body, sanitize them too
    for (const key in sanitizedBody) {
      if (typeof sanitizedBody[key] === 'object' && !Array.isArray(sanitizedBody[key])) {
        sanitizedBody[key] = sanitizeNestedObject(sanitizedBody[key]);
      }
    }

    // Attach sanitized body to the request object
    req.sanitizedBody = sanitizedBody;
    
    // Continue to the next middleware or route handler
    next();
  } catch (error) {
    console.error('Sanitization error:', error);
    res.status(500).json({ message: 'Internal server error during data sanitization' });
  }
};
