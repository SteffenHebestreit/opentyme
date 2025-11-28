/**
 * @fileoverview MinIO Object Storage Service
 * 
 * Provides methods to interact with MinIO for file uploads:
 * - Upload files (receipts, documents, logos)
 * - Download files with presigned URLs
 * - Delete files
 * - List files
 * - Bucket management
 * 
 * Integrates with Keycloak for user isolation - files are stored
 * in user-specific paths and access is controlled by authentication.
 * 
 * @module services/storage/minio
 */

import * as Minio from 'minio';

/**
 * MinIO configuration from environment variables
 */
const minioConfig = {
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT || '9000'),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin123',
};

/**
 * MinIO Service Class
 * Handles all object storage operations with per-user bucket isolation
 * Each user gets their own bucket: user-{userId}
 */
export class MinioService {
  private client: Minio.Client;
  private createdBuckets: Set<string> = new Set();

  constructor() {
    this.client = new Minio.Client(minioConfig);
  }

  /**
   * Get user-specific bucket name
   * Sanitizes user ID to be S3-compatible (lowercase, alphanumeric, hyphens)
   * 
   * @param {string} userId - User ID from Keycloak
   * @returns {string} Bucket name
   */
  private getUserBucket(userId: string): string {
    // S3 bucket naming rules: lowercase, alphanumeric, hyphens
    // Must be between 3-63 characters
    const sanitizedUserId = userId.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    return `user-${sanitizedUserId}`;
  }

  /**
   * Ensure user bucket exists
   * Creates bucket if it doesn't exist, with private access policy
   * 
   * @param {string} userId - User ID from Keycloak
   * @returns {Promise<string>} Bucket name
   */
  private async ensureUserBucket(userId: string): Promise<string> {
    const bucket = this.getUserBucket(userId);

    // Skip if already created in this session
    if (this.createdBuckets.has(bucket)) {
      return bucket;
    }

    try {
      const exists = await this.client.bucketExists(bucket);
      if (!exists) {
        await this.client.makeBucket(bucket, 'us-east-1');
        console.log(`[MinIO] Created user bucket: ${bucket}`);
      }

      this.createdBuckets.add(bucket);
      return bucket;
    } catch (error) {
      console.error(`[MinIO] Error ensuring user bucket ${bucket}:`, error);
      throw new Error('Failed to initialize user storage bucket');
    }
  }

  /**
   * Upload a file to MinIO
   * Files are stored in user-specific buckets: user-{userId}/{category}/{filename}
   * 
   * @param {string} userId - User ID from Keycloak
   * @param {Buffer} fileBuffer - File content as buffer
   * @param {string} originalFilename - Original filename
   * @param {string} mimetype - File MIME type
   * @param {string} category - File category (receipts, logos, documents, invoices, exports)
   * @returns {Promise<{url: string, filename: string, objectName: string}>} Upload result
   */
  async uploadFile(
    userId: string,
    fileBuffer: Buffer,
    originalFilename: string,
    mimetype: string,
    category: 'receipts' | 'logos' | 'documents' | 'invoices' | 'exports' = 'receipts'
  ): Promise<{ url: string; filename: string; objectName: string }> {
    try {
      // Ensure user bucket exists
      const bucket = await this.ensureUserBucket(userId);

      // Generate unique filename with timestamp
      const timestamp = Date.now();
      const sanitizedFilename = originalFilename.replace(/[^a-zA-Z0-9.-]/g, '_');
      const objectName = `${category}/${timestamp}-${sanitizedFilename}`;

      // Upload to MinIO
      await this.client.putObject(bucket, objectName, fileBuffer, fileBuffer.length, {
        'Content-Type': mimetype,
      });

      console.log(`[MinIO] Uploaded file: ${objectName} to user bucket: ${bucket}`);

      // Generate URL with bucket and object path
      const url = `/${bucket}/${objectName}`;

      return {
        url,
        filename: sanitizedFilename,
        objectName,
      };
    } catch (error) {
      console.error('[MinIO] Upload error:', error);
      throw new Error('Failed to upload file to storage');
    }
  }

  /**
   * Generate a presigned URL for downloading a file
   * URL is valid for a limited time (default: 1 hour)
   * 
   * @param {string} bucket - Bucket name
   * @param {string} objectName - Object name/path
   * @param {number} expirySeconds - URL expiry time in seconds (default: 3600)
   * @returns {Promise<string>} Presigned URL
   */
  async getPresignedUrl(
    bucket: string,
    objectName: string,
    expirySeconds: number = 3600
  ): Promise<string> {
    try {
      const url = await this.client.presignedGetObject(bucket, objectName, expirySeconds);
      return url;
    } catch (error) {
      console.error('[MinIO] Presigned URL error:', error);
      throw new Error('Failed to generate download URL');
    }
  }

  /**
   * Get a presigned URL from a stored URL path
   * Extracts bucket and object name from URL like "/receipts/userId/category/file.pdf"
   * 
   * @param {string} storedUrl - URL stored in database
   * @param {number} expirySeconds - URL expiry time in seconds
   * @returns {Promise<string>} Presigned URL
   */
  async getPresignedUrlFromPath(storedUrl: string, expirySeconds: number = 3600): Promise<string> {
    try {
      // Parse URL: /bucket/objectName
      const parts = storedUrl.replace(/^\//, '').split('/');
      const bucket = parts[0];
      const objectName = parts.slice(1).join('/');

      return await this.getPresignedUrl(bucket, objectName, expirySeconds);
    } catch (error) {
      console.error('[MinIO] Presigned URL from path error:', error);
      throw new Error('Failed to generate download URL');
    }
  }

  /**
   * Delete a file from MinIO
   * 
   * @param {string} bucket - Bucket name
   * @param {string} objectName - Object name/path
   * @returns {Promise<void>}
   */
  async deleteFile(bucket: string, objectName: string): Promise<void> {
    try {
      await this.client.removeObject(bucket, objectName);
      console.log(`[MinIO] Deleted file: ${objectName} from bucket: ${bucket}`);
    } catch (error) {
      console.error('[MinIO] Delete error:', error);
      throw new Error('Failed to delete file from storage');
    }
  }

  /**
   * Delete a file using stored URL path
   * 
   * @param {string} storedUrl - URL stored in database
   * @returns {Promise<void>}
   */
  async deleteFileFromPath(storedUrl: string): Promise<void> {
    try {
      const parts = storedUrl.replace(/^\//, '').split('/');
      const bucket = parts[0];
      const objectName = parts.slice(1).join('/');

      await this.deleteFile(bucket, objectName);
    } catch (error) {
      console.error('[MinIO] Delete from path error:', error);
      throw new Error('Failed to delete file');
    }
  }

  /**
   * List files for a specific user
   * 
   * @param {string} userId - User ID
   * @param {string} category - File category (optional, lists all if not specified)
   * @returns {Promise<Array<{name: string, size: number, lastModified: Date}>>} File list
   */
  async listUserFiles(
    userId: string,
    category?: 'receipts' | 'logos' | 'documents' | 'invoices' | 'exports'
  ): Promise<Array<{ name: string; size: number; lastModified: Date }>> {
    try {
      const bucket = await this.ensureUserBucket(userId);
      const prefix = category ? `${category}/` : '';
      const files: Array<{ name: string; size: number; lastModified: Date }> = [];

      const stream = this.client.listObjects(bucket, prefix, true);

      return new Promise((resolve, reject) => {
        stream.on('data', (obj: any) => {
          if (obj.name && obj.size !== undefined && obj.lastModified) {
            files.push({
              name: obj.name as string,
              size: obj.size as number,
              lastModified: obj.lastModified as Date,
            });
          }
        });

        stream.on('end', () => resolve(files));
        stream.on('error', (err: any) => reject(err));
      });
    } catch (error) {
      console.error('[MinIO] List files error:', error);
      throw new Error('Failed to list files');
    }
  }

  /**
   * Check if user has access to a file
   * Validates that the bucket belongs to the user
   * 
   * @param {string} userId - User ID
   * @param {string} bucketName - Bucket name from URL
   * @returns {boolean} True if user owns the bucket
   */
  validateUserAccess(userId: string, bucketName: string): boolean {
    const userBucket = this.getUserBucket(userId);
    return bucketName === userBucket;
  }

  /**
   * Delete user bucket and all contents
   * WARNING: This will delete all user files permanently
   * 
   * @param {string} userId - User ID
   * @returns {Promise<void>}
   */
  async deleteUserBucket(userId: string): Promise<void> {
    try {
      const bucket = this.getUserBucket(userId);
      const exists = await this.client.bucketExists(bucket);
      
      if (!exists) {
        console.log(`[MinIO] Bucket ${bucket} does not exist, skipping deletion`);
        return;
      }

      // List and delete all objects in the bucket
      const objectsList: string[] = [];
      const stream = this.client.listObjects(bucket, '', true);

      await new Promise<void>((resolve, reject) => {
        stream.on('data', (obj: any) => {
          if (obj.name) {
            objectsList.push(obj.name);
          }
        });
        stream.on('end', () => resolve());
        stream.on('error', (err: any) => reject(err));
      });

      // Delete all objects
      if (objectsList.length > 0) {
        await this.client.removeObjects(bucket, objectsList);
        console.log(`[MinIO] Deleted ${objectsList.length} objects from bucket ${bucket}`);
      }

      // Delete the bucket
      await this.client.removeBucket(bucket);
      this.createdBuckets.delete(bucket);
      console.log(`[MinIO] Deleted user bucket: ${bucket}`);
    } catch (error) {
      console.error(`[MinIO] Error deleting user bucket:`, error);
      throw new Error('Failed to delete user bucket');
    }
  }

  /**
   * Get file metadata
   * 
   * @param {string} bucket - Bucket name
   * @param {string} objectName - Object name
   * @returns {Promise<Minio.BucketItemStat>} File metadata
   */
  async getFileMetadata(bucket: string, objectName: string): Promise<Minio.BucketItemStat> {
    try {
      return await this.client.statObject(bucket, objectName);
    } catch (error) {
      console.error('[MinIO] Get metadata error:', error);
      throw new Error('Failed to get file metadata');
    }
  }

  /**
   * Get file stream from MinIO
   * 
   * @param {string} bucket - Bucket name
   * @param {string} objectName - Object name
   * @returns {Promise<any>} File stream
   */
  async getFileStream(bucket: string, objectName: string): Promise<any> {
    try {
      return await this.client.getObject(bucket, objectName);
    } catch (error) {
      console.error('[MinIO] Get file stream error:', error);
      throw new Error('Failed to get file stream');
    }
  }
}

// Export singleton instance
export const minioService = new MinioService();
