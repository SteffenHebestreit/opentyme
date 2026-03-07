/**
 * Example Controller
 * 
 * Handles HTTP requests for the example addon.
 * Controllers should be thin and delegate to services.
 */

import { Request, Response } from 'express';
import { exampleService } from '../services/example.service';

export class ExampleController {
  /**
   * GET /api/addons/example/data
   * Get user's data
   */
  async getData(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
        return;
      }

      const data = await exampleService.getUserData(userId);

      res.json({
        success: true,
        data: data || { message: 'No data found' },
      });
    } catch (error: any) {
      console.error('[ExampleController] Error getting data:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get data',
        error: error.message,
      });
    }
  }

  /**
   * POST /api/addons/example/process
   * Process some data
   */
  async processData(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
        return;
      }

      const { input } = req.body;

      if (!input) {
        res.status(400).json({
          success: false,
          message: 'Input is required',
        });
        return;
      }

      const result = await exampleService.processData(userId, input);

      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      console.error('[ExampleController] Error processing data:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to process data',
        error: error.message,
      });
    }
  }

  /**
   * GET /api/addons/example/status
   * Get addon status
   */
  async getStatus(req: Request, res: Response): Promise<void> {
    try {
      const status = {
        initialized: exampleService.isInitialized(),
        version: '1.0.0',
        timestamp: new Date().toISOString(),
      };

      res.json({
        success: true,
        status,
      });
    } catch (error: any) {
      console.error('[ExampleController] Error getting status:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get status',
        error: error.message,
      });
    }
  }
}

export const exampleController = new ExampleController();
