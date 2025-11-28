/**
 * @fileoverview Analytics controller for handling dashboard analytics API requests.
 * 
 * Provides endpoints for:
 * - GET /api/analytics/time-trend - Time tracking trends
 * - GET /api/analytics/revenue-by-client - Revenue analysis
 * - GET /api/analytics/billable-ratio - Billable vs non-billable hours
 * - GET /api/analytics/project-profitability - Project profit/loss
 * 
 * All endpoints are protected and require authentication.
 * 
 * @module controllers/analytics/analytics.controller
 */

import { Request, Response } from 'express';
import { analyticsService } from '../../services/analytics/analytics.service';

export class AnalyticsController {
  /**
   * Get time tracking trend over specified days.
   * 
   * Query params:
   * - days: Number of days to look back (default: 30, options: 30, 60, 90)
   * 
   * @route GET /api/analytics/time-trend
   * @access Protected
   * 
   * @example
   * GET /api/analytics/time-trend?days=30
   * Response: [
   *   { date: '2025-10-01', total_hours: 8.5, billable_hours: 7.0, non_billable_hours: 1.5 },
   *   ...
   * ]
   */
  async getTimeTrend(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      // Parse and validate days parameter
      const daysParam = req.query.days as string;
      const days = daysParam ? parseInt(daysParam, 10) : 30;
      
      // Validate days is one of allowed values
      if (![30, 60, 90].includes(days)) {
        res.status(400).json({ message: 'Invalid days parameter. Allowed values: 30, 60, 90' });
        return;
      }

      const data = await analyticsService.getTimeTrend(userId, days);
      
      res.status(200).json(data);
    } catch (error: any) {
      console.error('Get time trend error:', error);
      res.status(500).json({ message: error.message || 'Internal server error' });
    }
  }

  /**
   * Get revenue by client (top N).
   * 
   * Query params:
   * - limit: Number of clients to return (default: 10, max: 20)
   * 
   * @route GET /api/analytics/revenue-by-client
   * @access Protected
   * 
   * @example
   * GET /api/analytics/revenue-by-client?limit=10
   * Response: [
   *   { client_id: 'uuid-1', client_name: 'Acme Corp', total_revenue: 15000, invoice_count: 5 },
   *   ...
   * ]
   */
  async getRevenueByClient(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      // Parse and validate limit parameter
      const limitParam = req.query.limit as string;
      const limit = limitParam ? parseInt(limitParam, 10) : 10;
      
      // Cap limit at 20 to prevent excessive data
      const cappedLimit = Math.min(Math.max(limit, 1), 20);

      const data = await analyticsService.getRevenueByClient(userId, cappedLimit);
      
      res.status(200).json(data);
    } catch (error: any) {
      console.error('Get revenue by client error:', error);
      res.status(500).json({ message: error.message || 'Internal server error' });
    }
  }

  /**
   * Get billable vs non-billable hours ratio.
   * 
   * Query params:
   * - days: Number of days to look back (optional, defaults to all time)
   * 
   * @route GET /api/analytics/billable-ratio
   * @access Protected
   * 
   * @example
   * GET /api/analytics/billable-ratio
   * Response: {
   *   billable_hours: 150,
   *   non_billable_hours: 30,
   *   billable_percentage: 83.33
   * }
   */
  async getBillableRatio(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      // Parse optional days parameter
      const daysParam = req.query.days as string;
      const days = daysParam ? parseInt(daysParam, 10) : undefined;

      const data = await analyticsService.getBillableRatio(userId, days);
      
      res.status(200).json(data);
    } catch (error: any) {
      console.error('Get billable ratio error:', error);
      res.status(500).json({ message: error.message || 'Internal server error' });
    }
  }

  /**
   * Get project profitability analysis.
   * 
   * Query params:
   * - limit: Number of projects to return (default: 10, max: 20)
   * 
   * @route GET /api/analytics/project-profitability
   * @access Protected
   * 
   * @example
   * GET /api/analytics/project-profitability?limit=10
   * Response: [
   *   { 
   *     project_id: 'uuid-1', 
   *     project_name: 'Website Redesign', 
   *     revenue: 5000, 
   *     cost: 3000, 
   *     profit: 2000, 
   *     profit_margin: 40.00 
   *   },
   *   ...
   * ]
   */
  async getProjectProfitability(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      // Parse and validate limit parameter
      const limitParam = req.query.limit as string;
      const limit = limitParam ? parseInt(limitParam, 10) : 10;
      
      // Cap limit at 20 to prevent excessive data
      const cappedLimit = Math.min(Math.max(limit, 1), 20);

      const data = await analyticsService.getProjectProfitability(userId, cappedLimit);
      
      res.status(200).json(data);
    } catch (error: any) {
      console.error('Get project profitability error:', error);
      res.status(500).json({ message: error.message || 'Internal server error' });
    }
  }

  /**
   * Get yearly financial summary for dashboard.
   * 
   * Query params:
   * - year: Year to get summary for (optional, defaults to current year)
   * 
   * @route GET /api/analytics/yearly-summary
   * @access Protected
   * 
   * @example
   * GET /api/analytics/yearly-summary?year=2025
   * Response: {
   *   year: 2025,
   *   total_revenue: 50000,
   *   total_expenses: 15000,
   *   revenue_tax: 7983.19,
   *   expense_tax: 2394.96,
   *   net_revenue: 42016.81,
   *   net_expenses: 12605.04,
   *   net_profit: 29411.77,
   *   tax_payable: 5588.23
   * }
   */
  async getYearlyFinancialSummary(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      // Parse optional year parameter
      const yearParam = req.query.year as string;
      const year = yearParam ? parseInt(yearParam, 10) : undefined;

      const data = await analyticsService.getYearlyFinancialSummary(userId, year);
      
      res.status(200).json(data);
    } catch (error: any) {
      console.error('Get yearly financial summary error:', error);
      res.status(500).json({ message: error.message || 'Internal server error' });
    }
  }
}
