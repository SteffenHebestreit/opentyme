#!/usr/bin/env node
/**
 * Rescan backups directory and repopulate system_backups table.
 * This script is used after a database restore to rebuild the backup registry.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { Pool } = require('pg');

const BACKUPS_DIR = process.env.BACKUPS_DIR || path.resolve(__dirname, '..', '..', 'backups');
const PRUNE_MISSING = process.env.PRUNE_MISSING !== 'false';
const IGNORED_BACKUP_NAME_PATTERNS = [/^system_migration_/i, /^trace_bundle$/i, /^debug_bundle$/i];

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_NAME || 'opentyme',
});

function findBackupArchive(backupPath) {
  const files = fs.readdirSync(backupPath);
  return files.find((file) => file.endsWith('.tar.gz')) || null;
}

function isIgnoredBackupName(backupName) {
  return IGNORED_BACKUP_NAME_PATTERNS.some((pattern) => pattern.test(backupName));
}

function readArchiveListing(archivePath) {
  try {
    return execFileSync('tar', ['-tzf', archivePath], { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean);
  } catch (error) {
    console.warn(`[RESCAN] Warning: Could not list archive ${archivePath}: ${error.message}`);
    return [];
  }
}

function readManifest(archivePath, archiveListing) {
  const manifestCandidates = ['./manifest.json', 'manifest.json'];
  const manifestEntry = manifestCandidates.find((candidate) => archiveListing.includes(candidate));

  if (!manifestEntry) {
    return null;
  }

  try {
    const manifestJson = execFileSync('tar', ['-xOf', archivePath, manifestEntry], { encoding: 'utf8' });
    return JSON.parse(manifestJson);
  } catch (error) {
    console.warn(`[RESCAN] Warning: Could not parse manifest for ${archivePath}: ${error.message}`);
    return null;
  }
}

function hasArchiveEntry(archiveListing, entry) {
  return archiveListing.includes(entry) || archiveListing.includes(`./${entry}`);
}

function isApplicationBackup(manifest, archiveListing) {
  if (manifest) {
    return true;
  }

  return archiveListing.some((entry) => {
    return entry === './opentyme_database.dump'
      || entry === 'opentyme_database.dump'
      || entry === './keycloak_database.dump'
      || entry === 'keycloak_database.dump'
      || entry.startsWith('./storage/')
      || entry.startsWith('storage/')
      || entry.startsWith('./config/')
      || entry.startsWith('config/');
  });
}

function inferIncludes(manifest, archiveListing) {
  return {
    includesDatabase: manifest?.includes?.opentyme_database ?? (hasArchiveEntry(archiveListing, 'opentyme_database.dump') || hasArchiveEntry(archiveListing, 'database.dump')),
    includesStorage: manifest?.includes?.s3_storage ?? archiveListing.some((entry) => entry.startsWith('./storage/') || entry.startsWith('storage/')),
    includesConfig: manifest?.includes?.config ?? (manifest?.includes?.config_files ?? archiveListing.some((entry) => entry.startsWith('./config/') || entry.startsWith('config/'))),
  };
}

async function pruneMissingBackups(knownBackupNames) {
  if (!PRUNE_MISSING) {
    return 0;
  }

  const result = await pool.query('SELECT id, backup_name, backup_path FROM system_backups');
  let deleted = 0;

  for (const row of result.rows) {
    const pathExists = row.backup_path ? fs.existsSync(row.backup_path) : false;
    const nameExists = knownBackupNames.has(row.backup_name);

    if (pathExists || nameExists) {
      continue;
    }

    await pool.query('DELETE FROM system_backups WHERE id = $1', [row.id]);
    console.log(`[RESCAN] Removed stale backup record: ${row.backup_name}`);
    deleted += 1;
  }

  return deleted;
}

async function pruneInvalidBackups() {
  const result = await pool.query('SELECT id, backup_name, backup_path FROM system_backups');
  let deleted = 0;

  for (const row of result.rows) {
    if (isIgnoredBackupName(row.backup_name)) {
      await pool.query('DELETE FROM system_backups WHERE id = $1', [row.id]);
      console.log(`[RESCAN] Removed ignored backup record: ${row.backup_name}`);
      deleted += 1;
      continue;
    }

    const backupDir = path.join(BACKUPS_DIR, row.backup_name);
    const archivePath = fs.existsSync(backupDir) ? (() => {
      const archive = findBackupArchive(backupDir);
      return archive ? path.join(backupDir, archive) : null;
    })() : null;

    const existingArchivePath = row.backup_path && row.backup_path.endsWith('.tar.gz') && fs.existsSync(row.backup_path)
      ? row.backup_path
      : archivePath;

    if (!existingArchivePath) {
      continue;
    }

    const archiveListing = readArchiveListing(existingArchivePath);
    const manifest = readManifest(existingArchivePath, archiveListing);

    if (isApplicationBackup(manifest, archiveListing)) {
      continue;
    }

    await pool.query('DELETE FROM system_backups WHERE id = $1', [row.id]);
    console.log(`[RESCAN] Removed non-application backup record: ${row.backup_name}`);
    deleted += 1;
  }

  return deleted;
}

async function upsertBackupRecord(record) {
  const existing = await pool.query('SELECT id FROM system_backups WHERE backup_name = $1', [record.backupName]);

  if (existing.rows.length > 0) {
    await pool.query(
      `UPDATE system_backups
       SET status = 'completed',
           backup_path = $1,
           file_size_bytes = $2,
           includes_database = $3,
           includes_storage = $4,
           includes_config = $5,
           started_at = COALESCE(started_at, $6),
           completed_at = COALESCE(completed_at, $6)
       WHERE id = $7`,
      [
        record.filePath,
        record.fileSize,
        record.includesDatabase,
        record.includesStorage,
        record.includesConfig,
        record.createdAt,
        existing.rows[0].id,
      ]
    );

    return 'updated';
  }

  await pool.query(
    `INSERT INTO system_backups (
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
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      record.backupName,
      record.backupType,
      'completed',
      record.filePath,
      record.fileSize,
      record.includesDatabase,
      record.includesStorage,
      record.includesConfig,
      record.createdAt,
      record.createdAt,
      record.createdAt,
    ]
  );

  return 'inserted';
}

async function rescanBackups() {
  console.log('[RESCAN] Starting backup directory scan...');
  console.log('[RESCAN] Backups directory:', BACKUPS_DIR);

  if (!fs.existsSync(BACKUPS_DIR)) {
    console.error('[RESCAN] Backups directory does not exist:', BACKUPS_DIR);
    process.exit(1);
  }

  const backupDirs = fs.readdirSync(BACKUPS_DIR, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);

  const knownBackupNames = new Set(backupDirs);
  console.log(`[RESCAN] Found ${backupDirs.length} backup directories`);

  let registered = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  const pruned = await pruneMissingBackups(knownBackupNames);
  const prunedInvalid = await pruneInvalidBackups();

  for (const backupName of backupDirs) {
    if (isIgnoredBackupName(backupName)) {
      console.log(`[RESCAN] Skipping ignored backup directory: ${backupName}`);
      skipped += 1;
      continue;
    }

    const backupPath = path.join(BACKUPS_DIR, backupName);

    try {
      const tarFile = findBackupArchive(backupPath);

      if (!tarFile) {
        console.log(`[RESCAN] No backup file found in: ${backupName}`);
        skipped += 1;
        continue;
      }

      const filePath = path.join(backupPath, tarFile);
      const stats = fs.statSync(filePath);
      const archiveListing = readArchiveListing(filePath);
      const manifest = readManifest(filePath, archiveListing);

      if (!isApplicationBackup(manifest, archiveListing)) {
        console.log(`[RESCAN] Skipping non-application archive: ${backupName}`);
        skipped += 1;
        continue;
      }

      const timestampMatch = tarFile.match(/(?:backup_|.*_)(\d{8})_(\d{6})\.tar\.gz/);
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

      const includes = inferIncludes(manifest, archiveListing);
      const backupType = backupName.startsWith('scheduled_') ? 'scheduled' : 'manual';
      const action = await upsertBackupRecord({
        backupName,
        backupType,
        filePath,
        fileSize: stats.size,
        includesDatabase: includes.includesDatabase,
        includesStorage: includes.includesStorage,
        includesConfig: includes.includesConfig,
        createdAt,
      });

      if (action === 'updated') {
        console.log(`[RESCAN] ↺ Updated: ${backupName} (${stats.size} bytes)`);
        updated += 1;
      } else {
        console.log(`[RESCAN] ✓ Registered: ${backupName} (${stats.size} bytes)`);
        registered += 1;
      }
    } catch (error) {
      console.error(`[RESCAN] Failed to process ${backupName}:`, error.message);
      failed += 1;
    }
  }

  await pool.end();

  console.log('\n[RESCAN] Scan complete:');
  console.log(`  - Pruned stale records: ${pruned}`);
  console.log(`  - Pruned invalid records: ${prunedInvalid}`);
  console.log(`  - Registered: ${registered}`);
  console.log(`  - Updated: ${updated}`);
  console.log(`  - Skipped: ${skipped}`);
  console.log(`  - Failed: ${failed}`);
  console.log(`  - Total: ${backupDirs.length}`);
}

rescanBackups().catch((error) => {
  console.error('[RESCAN] Fatal error:', error);
  process.exit(1);
});
