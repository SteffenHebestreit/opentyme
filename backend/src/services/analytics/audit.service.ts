/**
 * @fileoverview Audit service for tracking report exports.
 * 
 * Provides methods to log report export activities for compliance and auditing.
 * All report exports are tracked with user, timestamp, and metadata.
 * 
 * @module services/analytics/audit.service
 */

import { getDbClient } from '../../utils/database';

export interface ReportExportAuditLog {
  id?: string;
  user_id: string;
  report_type: string;
  report_format: 'JSON' | 'CSV' | 'Excel' | 'PDF';
  report_id?: string;
  start_date?: string;
  end_date?: string;
  exported_at?: Date;
  ip_address?: string;
  user_agent?: string;
  file_size_bytes?: number;
  metadata?: any;
}

export interface AuditQueryOptions {
  userId?: string;
  reportType?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export class AuditService {
  private db = getDbClient();

  /**
   * Log a report export
   */
  async logReportExport(
    userId: string,
    reportType: string,
    reportFormat: 'JSON' | 'CSV' | 'Excel' | 'PDF',
    options: {
      reportId?: string;
      startDate?: string;
      endDate?: string;
      ipAddress?: string;
      userAgent?: string;
      fileSizeBytes?: number;
      metadata?: any;
    } = {}
  ): Promise<string> {
    const query = `
      INSERT INTO report_export_audit (
        user_id,
        report_type,
        report_format,
        report_id,
        start_date,
        end_date,
        ip_address,
        user_agent,
        file_size_bytes,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id
    `;

    const values = [
      userId,
      reportType,
      reportFormat,
      options.reportId || null,
      options.startDate || null,
      options.endDate || null,
      options.ipAddress || null,
      options.userAgent || null,
      options.fileSizeBytes || null,
      options.metadata ? JSON.stringify(options.metadata) : null,
    ];

    try {
      const result = await this.db.query(query, values);
      return result.rows[0].id;
    } catch (error) {
      console.error('Error logging report export:', error);
      throw error;
    }
  }

  /**
   * Log report export from Express request
   */
  async logReportExportFromRequest(
    req: any,
    reportType: string,
    reportFormat: 'JSON' | 'CSV' | 'Excel' | 'PDF',
    options: {
      reportId?: string;
      startDate?: string;
      endDate?: string;
      fileSizeBytes?: number;
      metadata?: any;
    } = {}
  ): Promise<string> {
    const userId = req.user?.id;
    
    if (!userId) {
      throw new Error('User ID not found in request');
    }

    const ipAddress = req.ip || req.connection?.remoteAddress;
    const userAgent = req.get ? req.get('user-agent') : req.headers?.['user-agent'];

    return this.logReportExport(userId, reportType, reportFormat, {
      ...options,
      ipAddress,
      userAgent,
    });
  }

  /**
   * Get audit logs with optional filtering
   */
  async getAuditLogs(options: AuditQueryOptions = {}): Promise<ReportExportAuditLog[]> {
    let query = `
      SELECT 
        id,
        user_id,
        report_type,
        report_format,
        report_id,
        start_date,
        end_date,
        exported_at,
        ip_address,
        user_agent,
        file_size_bytes,
        metadata
      FROM report_export_audit
      WHERE 1=1
    `;

    const values: any[] = [];
    let paramCount = 1;

    if (options.userId) {
      query += ` AND user_id = $${paramCount}`;
      values.push(options.userId);
      paramCount++;
    }

    if (options.reportType) {
      query += ` AND report_type = $${paramCount}`;
      values.push(options.reportType);
      paramCount++;
    }

    if (options.startDate) {
      query += ` AND exported_at >= $${paramCount}`;
      values.push(options.startDate);
      paramCount++;
    }

    if (options.endDate) {
      query += ` AND exported_at <= $${paramCount}`;
      values.push(options.endDate);
      paramCount++;
    }

    query += ` ORDER BY exported_at DESC`;

    if (options.limit) {
      query += ` LIMIT $${paramCount}`;
      values.push(options.limit);
      paramCount++;
    }

    if (options.offset) {
      query += ` OFFSET $${paramCount}`;
      values.push(options.offset);
      paramCount++;
    }

    try {
      const result = await this.db.query(query, values);
      return result.rows;
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      throw error;
    }
  }

  /**
   * Get export statistics for a user
   */
  async getUserExportStats(userId: string, days: number = 30): Promise<any> {
    const query = `
      SELECT 
        report_type,
        report_format,
        COUNT(*) as export_count,
        MAX(exported_at) as last_export
      FROM report_export_audit
      WHERE user_id = $1
        AND exported_at >= CURRENT_DATE - INTERVAL '${days} days'
      GROUP BY report_type, report_format
      ORDER BY export_count DESC
    `;

    try {
      const result = await this.db.query(query, [userId]);
      return result.rows;
    } catch (error) {
      console.error('Error fetching export stats:', error);
      throw error;
    }
  }

  /**
   * Get system-wide export statistics
   */
  async getSystemExportStats(days: number = 30): Promise<any> {
    const query = `
      SELECT 
        report_type,
        report_format,
        COUNT(*) as export_count,
        COUNT(DISTINCT user_id) as unique_users,
        MAX(exported_at) as last_export
      FROM report_export_audit
      WHERE exported_at >= CURRENT_DATE - INTERVAL '${days} days'
      GROUP BY report_type, report_format
      ORDER BY export_count DESC
    `;

    try {
      const result = await this.db.query(query);
      return result.rows;
    } catch (error) {
      console.error('Error fetching system export stats:', error);
      throw error;
    }
  }
}

export const auditService = new AuditService();
