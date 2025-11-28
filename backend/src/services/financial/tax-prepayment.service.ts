/**
 * @fileoverview Tax Prepayment Service
 * 
 * Handles business logic for tax prepayment management:
 * - Create, read, update, delete tax prepayments
 * - Receipt upload and management
 * - Summary calculations
 * - Filtering and sorting
 * 
 * @module services/financial/tax-prepayment
 */

import { getDbClient } from '../../utils/database';
import {
  TaxPrepayment,
  CreateTaxPrepaymentData,
  UpdateTaxPrepaymentData,
  TaxPrepaymentFilters,
  TaxPrepaymentSummary,
  TaxPrepaymentStatus,
} from '../../models/financial/tax-prepayment.model';

export class TaxPrepaymentService {
  private db = getDbClient();

  /**
   * Create a new tax prepayment
   */
  async createTaxPrepayment(userId: string, data: CreateTaxPrepaymentData): Promise<TaxPrepayment> {
    const query = `
      INSERT INTO tax_prepayments (
        user_id, tax_type, amount, payment_date, period_start, period_end,
        tax_year, quarter, description, reference_number, payment_method,
        notes, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `;

    const values = [
      userId,
      data.tax_type,
      data.amount,
      data.payment_date,
      data.period_start || null,
      data.period_end || null,
      data.tax_year,
      data.quarter || null,
      data.description || null,
      data.reference_number || null,
      data.payment_method || null,
      data.notes || null,
      data.status || TaxPrepaymentStatus.PAID,
    ];

    const result = await this.db.query(query, values);
    return result.rows[0];
  }

  /**
   * Get tax prepayment by ID
   */
  async getTaxPrepaymentById(id: string, userId: string): Promise<TaxPrepayment | null> {
    const query = `
      SELECT * FROM tax_prepayments
      WHERE id = $1 AND user_id = $2
    `;

    const result = await this.db.query(query, [id, userId]);
    return result.rows[0] || null;
  }

  /**
   * Get all tax prepayments with filtering
   */
  async getTaxPrepayments(filters: TaxPrepaymentFilters): Promise<{ prepayments: TaxPrepayment[]; total: number }> {
    const conditions: string[] = ['user_id = $1'];
    const values: any[] = [filters.user_id];
    let paramIndex = 2;

    // Build WHERE clause
    if (filters.tax_type) {
      conditions.push(`tax_type = $${paramIndex++}`);
      values.push(filters.tax_type);
    }

    if (filters.tax_year) {
      conditions.push(`tax_year = $${paramIndex++}`);
      values.push(filters.tax_year);
    }

    if (filters.quarter) {
      conditions.push(`quarter = $${paramIndex++}`);
      values.push(filters.quarter);
    }

    if (filters.status) {
      conditions.push(`status = $${paramIndex++}`);
      values.push(filters.status);
    }

    if (filters.date_from) {
      conditions.push(`payment_date >= $${paramIndex++}`);
      values.push(filters.date_from);
    }

    if (filters.date_to) {
      conditions.push(`payment_date <= $${paramIndex++}`);
      values.push(filters.date_to);
    }

    if (filters.search) {
      conditions.push(`(description ILIKE $${paramIndex} OR reference_number ILIKE $${paramIndex} OR notes ILIKE $${paramIndex})`);
      values.push(`%${filters.search}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Build ORDER BY clause
    const sortBy = filters.sort_by || 'payment_date';
    const sortOrder = filters.sort_order || 'desc';
    const orderByClause = `ORDER BY ${sortBy} ${sortOrder.toUpperCase()}`;

    // Get total count (before adding pagination parameters)
    const countQuery = `
      SELECT COUNT(*) as total
      FROM tax_prepayments
      ${whereClause}
    `;
    const countResult = await this.db.query(countQuery, values);
    const total = parseInt(countResult.rows[0].total);

    // Build pagination
    const limit = filters.limit || 50;
    const offset = filters.offset || 0;
    const paginationClause = `LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    values.push(limit, offset);

    // Get prepayments
    const query = `
      SELECT *
      FROM tax_prepayments
      ${whereClause}
      ${orderByClause}
      ${paginationClause}
    `;

    const result = await this.db.query(query, values);

    return {
      prepayments: result.rows,
      total,
    };
  }

  /**
   * Update a tax prepayment
   */
  async updateTaxPrepayment(id: string, userId: string, data: UpdateTaxPrepaymentData): Promise<TaxPrepayment> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    // Build SET clause dynamically
    if (data.tax_type !== undefined) {
      fields.push(`tax_type = $${paramIndex++}`);
      values.push(data.tax_type);
    }
    if (data.amount !== undefined) {
      fields.push(`amount = $${paramIndex++}`);
      values.push(data.amount);
    }
    if (data.payment_date !== undefined) {
      fields.push(`payment_date = $${paramIndex++}`);
      values.push(data.payment_date);
    }
    if (data.period_start !== undefined) {
      fields.push(`period_start = $${paramIndex++}`);
      values.push(data.period_start);
    }
    if (data.period_end !== undefined) {
      fields.push(`period_end = $${paramIndex++}`);
      values.push(data.period_end);
    }
    if (data.tax_year !== undefined) {
      fields.push(`tax_year = $${paramIndex++}`);
      values.push(data.tax_year);
    }
    if (data.quarter !== undefined) {
      fields.push(`quarter = $${paramIndex++}`);
      values.push(data.quarter);
    }
    if (data.description !== undefined) {
      fields.push(`description = $${paramIndex++}`);
      values.push(data.description);
    }
    if (data.reference_number !== undefined) {
      fields.push(`reference_number = $${paramIndex++}`);
      values.push(data.reference_number);
    }
    if (data.payment_method !== undefined) {
      fields.push(`payment_method = $${paramIndex++}`);
      values.push(data.payment_method);
    }
    if (data.notes !== undefined) {
      fields.push(`notes = $${paramIndex++}`);
      values.push(data.notes);
    }
    if (data.status !== undefined) {
      fields.push(`status = $${paramIndex++}`);
      values.push(data.status);
    }

    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id, userId);

    const query = `
      UPDATE tax_prepayments
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex++} AND user_id = $${paramIndex++}
      RETURNING *
    `;

    const result = await this.db.query(query, values);
    if (result.rows.length === 0) {
      throw new Error('Tax prepayment not found or unauthorized');
    }

    return result.rows[0];
  }

  /**
   * Delete a tax prepayment
   */
  async deleteTaxPrepayment(id: string, userId: string): Promise<void> {
    // First get the prepayment to delete associated receipt
    const prepayment = await this.getTaxPrepaymentById(id, userId);
    if (!prepayment) {
      throw new Error('Tax prepayment not found or unauthorized');
    }

    // Delete receipt if exists
    if (prepayment.receipt_url) {
      try {
        const { minioService } = await import('../storage/minio.service');
        await minioService.deleteFileFromPath(prepayment.receipt_url);
      } catch (error) {
        console.error('Failed to delete receipt file:', error);
        // Continue with deletion even if file deletion fails
      }
    }

    const query = `
      DELETE FROM tax_prepayments
      WHERE id = $1 AND user_id = $2
    `;

    await this.db.query(query, [id, userId]);
  }

  /**
   * Save receipt for tax prepayment
   */
  async saveReceipt(
    id: string,
    userId: string,
    fileBuffer: Buffer,
    originalFilename: string,
    mimetype: string,
    size: number
  ): Promise<TaxPrepayment> {
    const prepayment = await this.getTaxPrepaymentById(id, userId);
    if (!prepayment) {
      throw new Error('Tax prepayment not found or unauthorized');
    }

    // Delete old receipt if exists
    if (prepayment.receipt_url) {
      try {
        const { minioService } = await import('../storage/minio.service');
        await minioService.deleteFileFromPath(prepayment.receipt_url);
      } catch (error) {
        console.error('Failed to delete old receipt:', error);
      }
    }

    // Upload new receipt
    const { minioService } = await import('../storage/minio.service');
    const { url, filename } = await minioService.uploadFile(
      userId,
      fileBuffer,
      originalFilename,
      mimetype,
      'documents'
    );

    // Update prepayment with receipt info
    const query = `
      UPDATE tax_prepayments
      SET 
        receipt_url = $1,
        receipt_filename = $2,
        receipt_size = $3,
        receipt_mimetype = $4,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $5 AND user_id = $6
      RETURNING *
    `;

    const result = await this.db.query(query, [url, filename, size, mimetype, id, userId]);
    return result.rows[0];
  }

  /**
   * Delete receipt from tax prepayment
   */
  async deleteReceipt(id: string, userId: string): Promise<TaxPrepayment> {
    const prepayment = await this.getTaxPrepaymentById(id, userId);
    if (!prepayment) {
      throw new Error('Tax prepayment not found or unauthorized');
    }

    if (!prepayment.receipt_url) {
      throw new Error('No receipt found for this tax prepayment');
    }

    // Delete file from storage
    const { minioService } = await import('../storage/minio.service');
    await minioService.deleteFileFromPath(prepayment.receipt_url);

    // Update prepayment
    const query = `
      UPDATE tax_prepayments
      SET 
        receipt_url = NULL,
        receipt_filename = NULL,
        receipt_size = NULL,
        receipt_mimetype = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `;

    const result = await this.db.query(query, [id, userId]);
    return result.rows[0];
  }

  /**
   * Get receipt file stream
   */
  async getReceiptFileStream(id: string, userId: string): Promise<{
    stream: import('stream').Readable;
    filename: string;
    mimetype: string;
  }> {
    const prepayment = await this.getTaxPrepaymentById(id, userId);
    if (!prepayment) {
      throw new Error('Tax prepayment not found or unauthorized');
    }

    if (!prepayment.receipt_url) {
      throw new Error('No receipt found for this tax prepayment');
    }

    const { minioService } = await import('../storage/minio.service');
    const urlParts = prepayment.receipt_url.replace(/^\//, '').split('/');
    const bucket = urlParts[0];
    const objectName = urlParts.slice(1).join('/');

    const stream = await minioService.getFileStream(bucket, objectName);

    return {
      stream,
      filename: prepayment.receipt_filename || 'receipt',
      mimetype: prepayment.receipt_mimetype || 'application/octet-stream',
    };
  }

  /**
   * Get summary statistics
   */
  async getSummary(userId: string, taxYear?: number): Promise<TaxPrepaymentSummary> {
    let whereClause = 'WHERE user_id = $1 AND status IN (\'paid\', \'refund\')';
    const values: any[] = [userId];
    
    if (taxYear) {
      whereClause += ' AND tax_year = $2';
      values.push(taxYear);
    }

    const query = `
      SELECT 
        tax_type,
        tax_year,
        status,
        SUM(amount) as total
      FROM tax_prepayments
      ${whereClause}
      GROUP BY tax_type, tax_year, status
      ORDER BY tax_year DESC
    `;

    const result = await this.db.query(query, values);

    const summary: TaxPrepaymentSummary = {
      total_vat: 0,
      total_income_tax: 0,
      total_by_year: {},
      count: 0,
    };

    result.rows.forEach((row: any) => {
      const amount = parseFloat(row.total);
      const year = row.tax_year;
      const isRefund = row.status === 'refund';
      const finalAmount = isRefund ? -amount : amount;

      if (!summary.total_by_year[year]) {
        summary.total_by_year[year] = { vat: 0, income_tax: 0 };
      }

      if (row.tax_type === 'vat') {
        summary.total_vat += finalAmount;
        summary.total_by_year[year].vat += finalAmount;
      } else if (row.tax_type === 'income_tax') {
        summary.total_income_tax += finalAmount;
        summary.total_by_year[year].income_tax += finalAmount;
      }

      summary.count++;
    });

    return summary;
  }
}
