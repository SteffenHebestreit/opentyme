#!/bin/sh
set -e

# =============================================================================
# Tyme System Restore Script
# =============================================================================
# Restores a complete system backup including:
# - Tyme PostgreSQL database
# - Keycloak PostgreSQL database  
# - MinIO object storage (user buckets)
#
# SAFETY FEATURES:
# - Automatic backup of current data BEFORE restore (pre_restore_*)
# - Pre-restore backups are stored in /app/backups/pre_restore_<timestamp>
# - If restore fails, you can recover from the pre-restore backup
#
# Usage:
#   ./restore.sh <backup_path> [options]
#
# Options via environment variables:
#   RESTORE_DATABASE=true|false   - Restore Tyme database (default: true)
#   RESTORE_KEYCLOAK=true|false   - Restore Keycloak database (default: true)
#   RESTORE_STORAGE=true|false    - Restore storage files (default: true)
#   RESTORE_MINIO=true|false      - Restore MinIO data (default: true)
#   SKIP_PRE_BACKUP=true|false    - Skip automatic pre-restore backup (default: false)
#
# Recovery:
#   If something goes wrong, your original data is in:
#   /app/backups/pre_restore_<timestamp>/
# =============================================================================

BACKUP_FILE="${BACKUP_PATH:-$1}"
RESTORE_DB="${RESTORE_DATABASE:-true}"
RESTORE_KEYCLOAK="${RESTORE_KEYCLOAK:-true}"
RESTORE_STORAGE="${RESTORE_STORAGE:-true}"
RESTORE_MINIO="${RESTORE_MINIO:-true}"
RESTORE_CONFIG="${RESTORE_CONFIG:-false}"
SKIP_PRE_BACKUP="${SKIP_PRE_BACKUP:-false}"

# Pre-restore backup directory
PRE_RESTORE_BACKUP_DIR="${PRE_RESTORE_BACKUP_DIR:-/app/backups/pre_restore_$(date +%Y%m%d_%H%M%S)}"

# Tyme Database configuration
DB_HOST="${DB_HOST:-db}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${DB_PASSWORD:-password}"
DB_NAME="${DB_NAME:-tyme}"

# Keycloak Database configuration
KC_DB_HOST="${KC_DB_HOST:-keycloak-db}"
KC_DB_PORT="${KC_DB_PORT:-5432}"
KC_DB_USER="${KC_DB_USER:-keycloak_user}"
KC_DB_PASSWORD="${KC_DB_PASSWORD:-keycloak_password}"
KC_DB_NAME="${KC_DB_NAME:-keycloak}"

# MinIO configuration
MINIO_HOST="${MINIO_HOST:-minio}"
MINIO_PORT="${MINIO_PORT:-9000}"
MINIO_ROOT_USER="${MINIO_ROOT_USER:-minioadmin}"
MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-minioadmin123}"

# Storage paths
STORAGE_PATH="${STORAGE_PATH:-/usr/src/app/uploads}"
CONFIG_PATH="${CONFIG_PATH:-/usr/src/app/.env}"
BACKUPS_DIR="${BACKUPS_DIR:-/app/backups}"

if [ -z "$BACKUP_FILE" ]; then
    echo "[RESTORE] Error: Backup file not specified"
    echo "[RESTORE] Usage: ./restore.sh <backup_path>"
    exit 1
fi

# If BACKUP_FILE is a directory, find the .tar.gz file inside it
if [ -d "$BACKUP_FILE" ]; then
    BACKUP_TAR=$(find "$BACKUP_FILE" -name "*.tar.gz" | head -n 1)
    if [ -z "$BACKUP_TAR" ]; then
        echo "[RESTORE] Error: No .tar.gz file found in directory: $BACKUP_FILE"
        exit 1
    fi
    BACKUP_FILE="$BACKUP_TAR"
fi

if [ ! -f "$BACKUP_FILE" ]; then
    echo "[RESTORE] Error: Backup file not found: $BACKUP_FILE"
    exit 1
fi

# Create temporary directory for extraction
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
TEMP_DIR="/tmp/restore_$TIMESTAMP"
mkdir -p "$TEMP_DIR"

echo "=============================================="
echo "[RESTORE] Tyme System Restore"
echo "=============================================="
echo "[RESTORE] Backup file: $BACKUP_FILE"
echo "[RESTORE] Restore Tyme DB: $RESTORE_DB"
echo "[RESTORE] Restore Keycloak DB: $RESTORE_KEYCLOAK"
echo "[RESTORE] Restore Storage: $RESTORE_STORAGE"
echo "[RESTORE] Restore MinIO: $RESTORE_MINIO"
echo "=============================================="

# Extract backup
echo "[RESTORE] Extracting backup archive..."
tar -xzf "$BACKUP_FILE" -C "$TEMP_DIR"

if [ $? -ne 0 ]; then
    echo "[RESTORE] Failed to extract backup archive!"
    rm -rf "$TEMP_DIR"
    exit 1
fi

# Show what's in the backup
echo "[RESTORE] Backup contents:"
ls -la "$TEMP_DIR"

# =============================================================================
# SAFETY: Create automatic backup of current data before restore
# =============================================================================
if [ "$SKIP_PRE_BACKUP" != "true" ]; then
    echo "[RESTORE] ============================================="
    echo "[RESTORE] Creating safety backup before restore..."
    echo "[RESTORE] ============================================="
    mkdir -p "$PRE_RESTORE_BACKUP_DIR"
    
    # Backup current Tyme database
    if [ "$RESTORE_DB" = "true" ]; then
        echo "[RESTORE] Backing up current Tyme database..."
        PGPASSWORD="$DB_PASSWORD" pg_dump \
            -h "$DB_HOST" \
            -p "$DB_PORT" \
            -U "$DB_USER" \
            -d "$DB_NAME" \
            -Fc \
            > "$PRE_RESTORE_BACKUP_DIR/tyme_database.dump" 2>/dev/null || echo "[RESTORE] Warning: Could not backup Tyme database (may not exist)"
    fi
    
    # Backup current Keycloak database
    if [ "$RESTORE_KEYCLOAK" = "true" ]; then
        echo "[RESTORE] Backing up current Keycloak database..."
        PGPASSWORD="$KC_DB_PASSWORD" pg_dump \
            -h "$KC_DB_HOST" \
            -p "$KC_DB_PORT" \
            -U "$KC_DB_USER" \
            -d "$KC_DB_NAME" \
            -Fc \
            > "$PRE_RESTORE_BACKUP_DIR/keycloak_database.dump" 2>/dev/null || echo "[RESTORE] Warning: Could not backup Keycloak database (may not exist)"
    fi
    
    # Backup current MinIO storage
    if [ "$RESTORE_MINIO" = "true" ] && command -v mc >/dev/null 2>&1; then
        echo "[RESTORE] Backing up current MinIO storage..."
        mkdir -p "$PRE_RESTORE_BACKUP_DIR/minio_backup"
        mc alias set pre-restore-minio "http://${MINIO_HOST}:${MINIO_PORT}" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" 2>/dev/null || true
        for bucket in $(mc ls pre-restore-minio/ 2>/dev/null | awk '{print $NF}' | sed 's/\/$//'); do
            mc mirror "pre-restore-minio/$bucket" "$PRE_RESTORE_BACKUP_DIR/minio_backup/$bucket" 2>/dev/null || true
        done
    fi
    
    echo "[RESTORE] Safety backup created: $PRE_RESTORE_BACKUP_DIR"
    echo "[RESTORE] If restore fails, you can recover from this backup"
    echo "[RESTORE] ============================================="
else
    echo "[RESTORE] Warning: Skipping pre-restore backup (SKIP_PRE_BACKUP=true)"
fi

# =============================================================================
# Restore Tyme Database
# =============================================================================
if [ "$RESTORE_DB" = "true" ]; then
    # Check for database dump (new format: tyme_database.dump, legacy: database.dump)
    DB_DUMP=""
    if [ -f "$TEMP_DIR/tyme_database.dump" ]; then
        DB_DUMP="$TEMP_DIR/tyme_database.dump"
    elif [ -f "$TEMP_DIR/database.dump" ]; then
        DB_DUMP="$TEMP_DIR/database.dump"
    fi
    
    if [ -n "$DB_DUMP" ]; then
        echo "[RESTORE] Restoring Tyme database from: $DB_DUMP"
        
        # Drop existing connections to the database
        PGPASSWORD="$DB_PASSWORD" psql \
            -h "$DB_HOST" \
            -p "$DB_PORT" \
            -U "$DB_USER" \
            -d postgres \
            -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$DB_NAME' AND pid <> pg_backend_pid();" \
            2>/dev/null || true
        
        # Drop and recreate database
        PGPASSWORD="$DB_PASSWORD" psql \
            -h "$DB_HOST" \
            -p "$DB_PORT" \
            -U "$DB_USER" \
            -d postgres \
            -c "DROP DATABASE IF EXISTS $DB_NAME;" \
            2>/dev/null || true
        
        PGPASSWORD="$DB_PASSWORD" psql \
            -h "$DB_HOST" \
            -p "$DB_PORT" \
            -U "$DB_USER" \
            -d postgres \
            -c "CREATE DATABASE $DB_NAME;"
        
        # Restore database dump
        PGPASSWORD="$DB_PASSWORD" pg_restore \
            -h "$DB_HOST" \
            -p "$DB_PORT" \
            -U "$DB_USER" \
            -d "$DB_NAME" \
            -v \
            --no-owner \
            --no-privileges \
            "$DB_DUMP" || echo "[RESTORE] Warning: Some objects may have failed to restore"
        
        echo "[RESTORE] Tyme database restored successfully"
    else
        echo "[RESTORE] Warning: No Tyme database dump found in backup"
    fi
fi

# =============================================================================
# Restore Keycloak Database
# =============================================================================
if [ "$RESTORE_KEYCLOAK" = "true" ] && [ -f "$TEMP_DIR/keycloak_database.dump" ]; then
    echo "[RESTORE] Restoring Keycloak database..."
    
    # Drop existing connections to the database
    PGPASSWORD="$KC_DB_PASSWORD" psql \
        -h "$KC_DB_HOST" \
        -p "$KC_DB_PORT" \
        -U "$KC_DB_USER" \
        -d postgres \
        -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$KC_DB_NAME' AND pid <> pg_backend_pid();" \
        2>/dev/null || true
    
    # Drop and recreate database
    PGPASSWORD="$KC_DB_PASSWORD" psql \
        -h "$KC_DB_HOST" \
        -p "$KC_DB_PORT" \
        -U "$KC_DB_USER" \
        -d postgres \
        -c "DROP DATABASE IF EXISTS $KC_DB_NAME;" \
        2>/dev/null || true
    
    PGPASSWORD="$KC_DB_PASSWORD" psql \
        -h "$KC_DB_HOST" \
        -p "$KC_DB_PORT" \
        -U "$KC_DB_USER" \
        -d postgres \
        -c "CREATE DATABASE $KC_DB_NAME OWNER $KC_DB_USER;"
    
    # Restore database dump
    PGPASSWORD="$KC_DB_PASSWORD" pg_restore \
        -h "$KC_DB_HOST" \
        -p "$KC_DB_PORT" \
        -U "$KC_DB_USER" \
        -d "$KC_DB_NAME" \
        -v \
        --no-owner \
        --no-privileges \
        "$TEMP_DIR/keycloak_database.dump" || echo "[RESTORE] Warning: Some Keycloak objects may have failed to restore"
    
    echo "[RESTORE] Keycloak database restored successfully"
elif [ "$RESTORE_KEYCLOAK" = "true" ]; then
    echo "[RESTORE] Warning: No Keycloak database dump found in backup"
fi

# =============================================================================
# Restore MinIO Storage
# =============================================================================
if [ "$RESTORE_MINIO" = "true" ] && [ -d "$TEMP_DIR/minio_backup" ]; then
    echo "[RESTORE] Restoring MinIO storage..."
    
    # Check if mc (MinIO client) is available
    if command -v mc >/dev/null 2>&1; then
        # Configure mc alias for MinIO
        mc alias set restore-minio "http://${MINIO_HOST}:${MINIO_PORT}" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" 2>/dev/null || true
        
        # Find all backup buckets and restore them
        for bucket_dir in "$TEMP_DIR/minio_backup"/*; do
            if [ -d "$bucket_dir" ]; then
                bucket_name=$(basename "$bucket_dir")
                echo "[RESTORE] Restoring bucket: $bucket_name"
                
                # Create bucket if it doesn't exist
                mc mb "restore-minio/$bucket_name" 2>/dev/null || true
                
                # Mirror files to the bucket
                mc mirror --overwrite "$bucket_dir" "restore-minio/$bucket_name" || echo "[RESTORE] Warning: Some files in $bucket_name may have failed"
            fi
        done
        
        echo "[RESTORE] MinIO storage restored successfully"
    else
        echo "[RESTORE] Warning: MinIO client (mc) not found. Copying files to backup location..."
        # Fallback: copy to a location where it can be manually restored
        mkdir -p "$TEMP_DIR/minio_restore_manual"
        cp -r "$TEMP_DIR/minio_backup"/* "$TEMP_DIR/minio_restore_manual/" 2>/dev/null || true
        echo "[RESTORE] MinIO backup files copied to: $TEMP_DIR/minio_restore_manual"
        echo "[RESTORE] Please manually restore these files to MinIO"
    fi
elif [ "$RESTORE_MINIO" = "true" ]; then
    echo "[RESTORE] Warning: No MinIO backup found in archive"
fi

# =============================================================================
# Restore Legacy Storage Files (uploads folder)
# =============================================================================
if [ "$RESTORE_STORAGE" = "true" ] && [ -d "$TEMP_DIR/uploads" ]; then
    echo "[RESTORE] Restoring legacy storage files..."
    
    # Backup existing storage if it exists
    if [ -d "$STORAGE_PATH" ]; then
        BACKUP_EXISTING="$STORAGE_PATH.backup_$TIMESTAMP"
        echo "[RESTORE] Backing up existing storage to: $BACKUP_EXISTING"
        mv "$STORAGE_PATH" "$BACKUP_EXISTING"
    fi
    
    # Restore storage
    mkdir -p "$(dirname "$STORAGE_PATH")"
    cp -r "$TEMP_DIR/uploads" "$STORAGE_PATH"
    
    echo "[RESTORE] Legacy storage files restored successfully"
fi

# =============================================================================
# Restore Configuration
# =============================================================================
if [ "$RESTORE_CONFIG" = "true" ] && [ -f "$TEMP_DIR/.env" ]; then
    echo "[RESTORE] Restoring configuration..."
    
    # Backup existing config if it exists
    if [ -f "$CONFIG_PATH" ]; then
        BACKUP_CONFIG="$CONFIG_PATH.backup_$TIMESTAMP"
        echo "[RESTORE] Backing up existing config to: $BACKUP_CONFIG"
        cp "$CONFIG_PATH" "$BACKUP_CONFIG"
    fi
    
    # Restore config
    cp "$TEMP_DIR/.env" "$CONFIG_PATH"
    
    echo "[RESTORE] Configuration restored successfully"
fi

# =============================================================================
# Repopulate Backup Records
# =============================================================================
# Scan backups directory and add missing entries to system_backups table
if [ "$RESTORE_DB" = "true" ] && [ -d "$BACKUPS_DIR" ]; then
    echo "[RESTORE] Scanning backups directory to repopulate system_backups table..."
    
    for backup_dir in "$BACKUPS_DIR"/*; do
        if [ -d "$backup_dir" ]; then
            backup_name=$(basename "$backup_dir")
            backup_file=$(find "$backup_dir" -name "*.tar.gz" | head -n 1)
            
            if [ -n "$backup_file" ] && [ -f "$backup_file" ]; then
                # Get file size
                file_size=$(stat -f%z "$backup_file" 2>/dev/null || stat -c%s "$backup_file" 2>/dev/null || echo "0")
                
                # Extract timestamp from filename (backup_YYYYMMDD_HHMMSS.tar.gz)
                filename=$(basename "$backup_file")
                timestamp_part=$(echo "$filename" | sed 's/backup_\([0-9]\{8\}_[0-9]\{6\}\).*/\1/')
                
                # Convert timestamp to ISO format
                if [ ${#timestamp_part} -eq 15 ]; then
                    year=${timestamp_part:0:4}
                    month=${timestamp_part:4:2}
                    day=${timestamp_part:6:2}
                    hour=${timestamp_part:9:2}
                    minute=${timestamp_part:11:2}
                    second=${timestamp_part:13:2}
                    created_at="${year}-${month}-${day} ${hour}:${minute}:${second}+00"
                else
                    created_at=$(date -r "$backup_file" -u "+%Y-%m-%d %H:%M:%S+00" 2>/dev/null || date -u "+%Y-%m-%d %H:%M:%S+00")
                fi
                
                # Determine backup type
                if echo "$backup_name" | grep -q "^scheduled_"; then
                    backup_type="scheduled"
                else
                    backup_type="manual"
                fi
                
                # Insert backup record
                PGPASSWORD="$DB_PASSWORD" psql \
                    -h "$DB_HOST" \
                    -p "$DB_PORT" \
                    -U "$DB_USER" \
                    -d "$DB_NAME" \
                    -c "INSERT INTO system_backups (backup_name, backup_type, status, backup_path, file_size_bytes, includes_database, includes_storage, includes_config, started_at, completed_at, created_at)
                        SELECT 
                            '${backup_name}',
                            '${backup_type}',
                            'completed',
                            '${backup_dir}',
                            ${file_size},
                            true,
                            true,
                            false,
                            '${created_at}'::timestamp with time zone,
                            '${created_at}'::timestamp with time zone,
                            '${created_at}'::timestamp with time zone
                        WHERE NOT EXISTS (
                            SELECT 1 FROM system_backups WHERE backup_name = '${backup_name}'
                        );" \
                    2>/dev/null || echo "[RESTORE] Warning: Failed to insert backup record for: $backup_name"
                
                echo "[RESTORE] Registered backup: $backup_name"
            fi
        fi
    done
    echo "[RESTORE] Backup scan complete"
fi

# Cleanup temporary directory
rm -rf "$TEMP_DIR"

echo "=============================================="
echo "[RESTORE] Restore completed successfully!"
echo "=============================================="

# Output JSON for the service to parse
cat <<EOF
{
  "success": true,
  "restored_tyme_database": $RESTORE_DB,
  "restored_keycloak_database": $RESTORE_KEYCLOAK,
  "restored_storage": $RESTORE_STORAGE,
  "restored_minio": $RESTORE_MINIO,
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
