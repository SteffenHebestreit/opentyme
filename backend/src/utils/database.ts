import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Ensure environment variables are loaded
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('Missing required database environment variable (DATABASE_URL)');
}

/**
 * PostgreSQL connection pool for database operations.
 * Configured via DATABASE_URL environment variable.
 * 
 * @constant {Pool}
 */
const pool = new Pool({
  connectionString: DATABASE_URL,
  // ssl: { rejectUnauthorized: false }, // Uncomment if using SSL with self-signed certs, or configure based on your DB
});

/**
 * Tests the database connection by executing a simple query.
 * Should be called during application startup to ensure database connectivity.
 * 
 * @async
 * @returns {Promise<void>} Resolves if connection is successful
 * @throws {Error} If database connection fails
 * 
 * @example
 * await testConnection();
 * console.log('Database is ready');
 */
const testConnection = async (): Promise<void> => {
  try {
    await pool.query('SELECT NOW()');
    console.log('✅ Database connection successful.');
  } catch (err) {
    console.error('❌ Database connection failed:', err);
    throw err; // Rethrow to be caught by the caller
  }
};

/**
 * Returns the PostgreSQL connection pool for executing queries.
 * Use this to obtain a database client for running SQL queries.
 * 
 * @returns {Pool} The PostgreSQL connection pool
 * 
 * @example
 * const db = getDbClient();
 * const result = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
 */
const getDbClient = () => {
  return pool;
};

export { testConnection, getDbClient };
