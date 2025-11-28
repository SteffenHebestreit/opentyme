import { getTestDbPool, cleanTestDatabase, runTestMigrations, closeTestDatabase } from './helpers/test-db';

// Store test user ID globally
export const TEST_USER_ID = '123e4567-e89b-12d3-a456-426614174000';

// Global setup: Run migrations once before all tests
beforeAll(async () => {
  console.log('🔧 Setting up test database...');
  await runTestMigrations();
  console.log(`✅ Test database ready with test user: ${TEST_USER_ID}`);
}, 30000); // 30 second timeout for setup

// Clean database before each test
beforeEach(async () => {
  const pool = getTestDbPool();
  // Clean all tables
  // Order matters: delete child tables first, then parents
  await pool.query(`DELETE FROM time_entries`);
  await pool.query(`DELETE FROM invoice_items`);
  await pool.query(`DELETE FROM payments`);
  await pool.query(`DELETE FROM invoices`);
  await pool.query(`DELETE FROM projects`);
  await pool.query(`DELETE FROM clients`);
  await pool.query(`DELETE FROM settings`);
});

// Clean database after each test
afterEach(async () => {
  const pool = getTestDbPool();
  // Clean all tables
  await pool.query(`DELETE FROM time_entries`);
  await pool.query(`DELETE FROM invoice_items`);
  await pool.query(`DELETE FROM payments`);
  await pool.query(`DELETE FROM invoices`);
  await pool.query(`DELETE FROM projects`);
  await pool.query(`DELETE FROM clients`);
  await pool.query(`DELETE FROM settings`);
});

// Global teardown: Close connections after all tests
afterAll(async () => {
  await closeTestDatabase();
});
