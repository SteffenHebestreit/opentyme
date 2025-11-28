import { Pool, PoolClient } from 'pg';

let testPool: Pool | null = null;

/**
 * Get database connection pool for tests
 */
export function getTestDbPool(): Pool {
  if (!testPool) {
    testPool = new Pool({
      host: process.env.DB_HOST || 'tyme-test-db',
      port: parseInt(process.env.DB_PORT || '5432'),
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'testpass',
      database: process.env.DB_NAME || 'tyme_test',
      ssl: false,
    });
  }
  return testPool;
}

/**
 * Clean all tables before/after tests
 */
export async function cleanTestDatabase(): Promise<void> {
  const pool = getTestDbPool();
  
  // Truncate all tables in correct order (respecting foreign keys)
  await pool.query(`
    TRUNCATE TABLE 
      time_entries,
      invoice_items,
      payments,
      invoices,
      projects,
      clients,
      settings
    RESTART IDENTITY CASCADE;
  `);
}

/**
 * Close test database connection
 */
export async function closeTestDatabase(): Promise<void> {
  if (testPool) {
    await testPool.end();
    testPool = null;
  }
}

/**
 * Run database migrations for tests
 * Note: The test database is initialized from init.sql via Docker, 
 * so no additional migrations are needed.
 */
export async function runTestMigrations(): Promise<void> {
  // Schema is now fully defined in init.sql which is loaded by Docker on container startup
  // No additional migrations needed
  const pool = getTestDbPool();
  
  // Verify the database is ready by checking for a core table
  try {
    await pool.query('SELECT 1 FROM clients LIMIT 1');
    console.log('✅ Test database schema verified');
  } catch (error: any) {
    console.error('❌ Test database not ready:', error.message);
    throw new Error('Test database schema not initialized. Ensure tyme-test-db container is running with init.sql.');
  }
}

