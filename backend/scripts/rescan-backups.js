#!/usr/bin/env node
/**
 * Rescan backups directory and repopulate system_backups table
 * This script is used after a database restore to rebuild the backup registry
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const BACKUPS_DIR = process.env.BACKUPS_DIR || path.join(__dirname, '..', 'backups');

const pool = new Pool({
  host: process.env.DB_HOST || 'db',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_NAME || 'tyme',
});

async function rescanBackups() {
  console.log('[RESCAN] Starting backup directory scan...');
  console.log('[RESCAN] Backups directory:', BACKUPS_DIR);

  if (!fs.existsSync(BACKUPS_DIR)) {
    console.error('[RESCAN] Backups directory does not exist:', BACKUPS_DIR);
    process.exit(1);
  }

  const backupDirs = fs.readdirSync(BACKUPS_DIR, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  console.log(`[RESCAN] Found ${backupDirs.length} backup directories`);

  let registered = 0;
  let skipped = 0;
  let failed = 0;

  for (const backupName of backupDirs) {
    const backupPath = path.join(BACKUPS_DIR, backupName);
    
    try {
      // Find tar.gz file in directory
      const files = fs.readdirSync(backupPath);
      const tarFile = files.find(f => f.endsWith('.tar.gz'));
      
      if (!tarFile) {
        console.log(`[RESCAN] No backup file found in: ${backupName}`);
        skipped++;
        continue;
      }

      const filePath = path.join(backupPath, tarFile);
      const stats = fs.statSync(filePath);
      
      // Extract timestamp from filename (backup_YYYYMMDD_HHMMSS.tar.gz)
      const timestampMatch = tarFile.match(/backup_(\d{8})_(\d{6})\.tar\.gz/);
      let createdAt;
      
      if (timestampMatch) {
        const [, dateStr, timeStr] = timestampMatch;
        const year = dateStr.substring(0, 4);
        const month = dateStr.substring(4, 6);
        const day = dateStr.substring(6, 8);
        const hour = timeStr.substring(0, 2);
        const minute = timeStr.substring(2, 4);
        const second = timeStr.substring(4, 6);
        createdAt = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
      } else {
        createdAt = stats.mtime;
      }

      // Determine backup type
      let backupType = 'manual';
      if (backupName.startsWith('scheduled_')) {
        backupType = 'scheduled';
      }

      // Check if backup already exists
      const existing = await pool.query(
        'SELECT id FROM system_backups WHERE backup_name = $1',
        [backupName]
      );

      if (existing.rows.length > 0) {
        console.log(`[RESCAN] Backup already registered: ${backupName}`);
        skipped++;
        continue;
      }

      // Insert backup record
      await pool.query(`
        INSERT INTO system_backups (
          backup_name,
          backup_type,
          status,
          backup_path,
          file_size_bytes,
          includes_database,
          includes_storage,
          includes_config,
          started_at,
          completed_at,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [
        backupName,
        backupType,
        'completed',
        backupPath,
        stats.size,
        true,
        true,
        false,
        createdAt,
        createdAt,
        createdAt
      ]);

      console.log(`[RESCAN] ✓ Registered: ${backupName} (${stats.size} bytes)`);
      registered++;

    } catch (error) {
      console.error(`[RESCAN] Failed to register ${backupName}:`, error.message);
      failed++;
    }
  }

  await pool.end();

  console.log('\n[RESCAN] Scan complete:');
  console.log(`  - Registered: ${registered}`);
  console.log(`  - Skipped: ${skipped}`);
  console.log(`  - Failed: ${failed}`);
  console.log(`  - Total: ${backupDirs.length}`);
}

rescanBackups().catch(error => {
  console.error('[RESCAN] Fatal error:', error);
  process.exit(1);
});
