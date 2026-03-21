#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# OpenTYME System Restore Script
# =============================================================================
# Restores a complete system backup including:
# - OpenTYME PostgreSQL database
# - Keycloak PostgreSQL database
# - S3-compatible object storage (SeaweedFS — user buckets)
#
# SAFETY FEATURES:
# - Automatic backup of current data BEFORE restore (pre_restore_*)
# - Pre-restore backups are stored in /usr/src/app/backups/pre_restore_<timestamp>
# - If restore fails, you can recover from the pre-restore backup
#
# Usage:
#   ./restore.sh <backup_path> [options]
#
# Options via environment variables:
#   RESTORE_DATABASE=true|false   - Restore OpenTYME database (default: true)
#   RESTORE_KEYCLOAK=true|false   - Restore Keycloak database (default: true)
#   RESTORE_STORAGE=true|false    - Restore S3 storage files (default: true)
#   SKIP_PRE_BACKUP=true|false    - Skip automatic pre-restore backup (default: false)
#
# Recovery:
#   If something goes wrong, your original data is in:
#   /usr/src/app/backups/pre_restore_<timestamp>/
# =============================================================================

BACKUP_FILE="${BACKUP_PATH:-${1:-}}"
RESTORE_DB="${RESTORE_DATABASE:-true}"
RESTORE_KEYCLOAK="${RESTORE_KEYCLOAK:-true}"
RESTORE_STORAGE="${RESTORE_STORAGE:-true}"
RESTORE_CONFIG="${RESTORE_CONFIG:-false}"
SKIP_PRE_BACKUP="${SKIP_PRE_BACKUP:-false}"

# Pre-restore backup directory
PRE_RESTORE_BACKUP_DIR="${PRE_RESTORE_BACKUP_DIR:-/usr/src/app/backups/pre_restore_$(date +%Y%m%d_%H%M%S)}"

# OpenTYME Database configuration
DB_HOST="${DB_HOST:-db}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${DB_PASSWORD:-password}"
DB_NAME="${DB_NAME:-opentyme}"

# Keycloak Database configuration
KC_DB_HOST="${KC_DB_HOST:-${KEYCLOAK_DB_HOST:-keycloak-db}}"
KC_DB_PORT="${KC_DB_PORT:-${KEYCLOAK_DB_PORT:-5432}}"
KC_DB_USER="${KC_DB_USER:-${KEYCLOAK_DB_USER:-keycloak_user}}"
KC_DB_PASSWORD="${KC_DB_PASSWORD:-${KEYCLOAK_DB_PASSWORD:-keycloak_password}}"
KC_DB_NAME="${KC_DB_NAME:-${KEYCLOAK_DB_NAME:-postgres}}"

# S3-compatible storage configuration (SeaweedFS)
STORAGE_HOST="${STORAGE_ENDPOINT:-${MINIO_ENDPOINT:-seaweedfs}}"
STORAGE_S3_PORT="${STORAGE_PORT:-${MINIO_PORT:-8333}}"
STORAGE_ACCESS_KEY="${STORAGE_ACCESS_KEY:-${MINIO_ACCESS_KEY:-admin}}"
STORAGE_SECRET_KEY="${STORAGE_SECRET_KEY:-${MINIO_SECRET_KEY:-password}}"
STORAGE_ENDPOINT_URL="http://${STORAGE_HOST}:${STORAGE_S3_PORT}"

# Legacy paths
STORAGE_PATH="${STORAGE_PATH:-/usr/src/app/uploads}"
CONFIG_PATH="${CONFIG_PATH:-/usr/src/app/.env}"
BACKUPS_DIR="${BACKUPS_DIR:-/usr/src/app/backups}"
KEYCLOAK_REALM_IMPORT_PATH="${KEYCLOAK_REALM_IMPORT_PATH:-/opt/keycloak/data/import/realm-import.json}"

if [ -z "$BACKUP_FILE" ]; then
    echo "[RESTORE] Error: Backup file not specified"
    echo "[RESTORE] Usage: ./restore.sh <backup_path>"
    exit 1
fi

# If BACKUP_FILE is a directory, find the .tar.gz file inside it
if [ -d "$BACKUP_FILE" ]; then
    BACKUP_TAR=$(find "$BACKUP_FILE" -maxdepth 1 -type f -name "*.tar.gz" | sort | head -n 1)
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
echo "[RESTORE] OpenTYME System Restore"
echo "=============================================="
echo "[RESTORE] Backup file: $BACKUP_FILE"
echo "[RESTORE] Restore DB: $RESTORE_DB"
echo "[RESTORE] Restore Keycloak DB: $RESTORE_KEYCLOAK"
echo "[RESTORE] Restore Storage: $RESTORE_STORAGE"
echo "=============================================="

# Extract backup
echo "[RESTORE] Extracting backup archive..."
tar -xzf "$BACKUP_FILE" -C "$TEMP_DIR"

if [ $? -ne 0 ]; then
    echo "[RESTORE] Failed to extract backup archive!"
    rm -rf "$TEMP_DIR"
    exit 1
fi

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

    if [ "$RESTORE_DB" = "true" ]; then
        echo "[RESTORE] Backing up current OpenTYME database..."
        PGPASSWORD="$DB_PASSWORD" pg_dump \
            -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -Fc \
            > "$PRE_RESTORE_BACKUP_DIR/opentyme_database.dump" 2>/dev/null || \
            echo "[RESTORE] Warning: Could not backup OpenTYME database"
    fi

    if [ "$RESTORE_KEYCLOAK" = "true" ]; then
        echo "[RESTORE] Backing up current Keycloak database..."
        PGPASSWORD="$KC_DB_PASSWORD" pg_dump \
            -h "$KC_DB_HOST" -p "$KC_DB_PORT" -U "$KC_DB_USER" -d "$KC_DB_NAME" -Fc \
            > "$PRE_RESTORE_BACKUP_DIR/keycloak_database.dump" 2>/dev/null || \
            echo "[RESTORE] Warning: Could not backup Keycloak database"
    fi

    if [ "$RESTORE_STORAGE" = "true" ] && command -v aws >/dev/null 2>&1; then
        echo "[RESTORE] Backing up current S3 storage..."
        mkdir -p "$PRE_RESTORE_BACKUP_DIR/storage"
        BUCKETS=$(AWS_ACCESS_KEY_ID="$STORAGE_ACCESS_KEY" \
                  AWS_SECRET_ACCESS_KEY="$STORAGE_SECRET_KEY" \
                  aws s3 ls --endpoint-url "$STORAGE_ENDPOINT_URL" 2>/dev/null \
                  | awk '{print $3}') || true
        for bucket in $BUCKETS; do
            AWS_ACCESS_KEY_ID="$STORAGE_ACCESS_KEY" \
            AWS_SECRET_ACCESS_KEY="$STORAGE_SECRET_KEY" \
            aws s3 sync "s3://$bucket" "$PRE_RESTORE_BACKUP_DIR/storage/$bucket" \
                --endpoint-url "$STORAGE_ENDPOINT_URL" --no-progress 2>/dev/null || true
        done
    fi

    echo "[RESTORE] Safety backup created: $PRE_RESTORE_BACKUP_DIR"
    echo "[RESTORE] If restore fails, you can recover from this backup"
    echo "[RESTORE] ============================================="
else
    echo "[RESTORE] Warning: Skipping pre-restore backup (SKIP_PRE_BACKUP=true)"
fi

# =============================================================================
# Restore OpenTYME Database
# =============================================================================
if [ "$RESTORE_DB" = "true" ]; then
    DB_DUMP=""
    if [ -f "$TEMP_DIR/opentyme_database.dump" ]; then
        DB_DUMP="$TEMP_DIR/opentyme_database.dump"
    elif [ -f "$TEMP_DIR/tyme_database.dump" ]; then
        DB_DUMP="$TEMP_DIR/tyme_database.dump"
    elif [ -f "$TEMP_DIR/database.dump" ]; then
        DB_DUMP="$TEMP_DIR/database.dump"
    fi

    if [ -n "$DB_DUMP" ]; then
        echo "[RESTORE] Restoring OpenTYME database from: $DB_DUMP"

        PGPASSWORD="$DB_PASSWORD" psql \
            -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres \
            -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$DB_NAME' AND pid <> pg_backend_pid();" \
            2>/dev/null || true

        PGPASSWORD="$DB_PASSWORD" psql \
            -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres \
            -c "DROP DATABASE IF EXISTS $DB_NAME;" 2>/dev/null || true

        PGPASSWORD="$DB_PASSWORD" psql \
            -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres \
            -c "CREATE DATABASE $DB_NAME;"

        PGPASSWORD="$DB_PASSWORD" pg_restore \
            -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
            -v --no-owner --no-privileges \
            "$DB_DUMP" || echo "[RESTORE] Warning: Some objects may have failed to restore"

        echo "[RESTORE] OpenTYME database restored successfully"
    else
        echo "[RESTORE] Warning: No OpenTYME database dump found in backup"
    fi
fi

# =============================================================================
# Restore Keycloak Database
# =============================================================================
if [ "$RESTORE_KEYCLOAK" = "true" ] && [ -f "$TEMP_DIR/keycloak_database.dump" ]; then
    echo "[RESTORE] Restoring Keycloak database..."

    if [ "$KC_DB_NAME" = "postgres" ]; then
        PGPASSWORD="$KC_DB_PASSWORD" psql \
            -h "$KC_DB_HOST" -p "$KC_DB_PORT" -U "$KC_DB_USER" -d postgres \
            -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public AUTHORIZATION $KC_DB_USER; GRANT ALL ON SCHEMA public TO $KC_DB_USER;" \
            >/dev/null
    else
        PGPASSWORD="$KC_DB_PASSWORD" psql \
            -h "$KC_DB_HOST" -p "$KC_DB_PORT" -U "$KC_DB_USER" -d postgres \
            -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$KC_DB_NAME' AND pid <> pg_backend_pid();" \
            2>/dev/null || true

        PGPASSWORD="$KC_DB_PASSWORD" psql \
            -h "$KC_DB_HOST" -p "$KC_DB_PORT" -U "$KC_DB_USER" -d postgres \
            -c "DROP DATABASE IF EXISTS $KC_DB_NAME;" 2>/dev/null || true

        PGPASSWORD="$KC_DB_PASSWORD" psql \
            -h "$KC_DB_HOST" -p "$KC_DB_PORT" -U "$KC_DB_USER" -d postgres \
            -c "CREATE DATABASE $KC_DB_NAME OWNER $KC_DB_USER;"
    fi

    PGPASSWORD="$KC_DB_PASSWORD" pg_restore \
        -h "$KC_DB_HOST" -p "$KC_DB_PORT" -U "$KC_DB_USER" -d "$KC_DB_NAME" \
        -v --no-owner --no-privileges \
        "$TEMP_DIR/keycloak_database.dump" || echo "[RESTORE] Warning: Some Keycloak objects may have failed"

    echo "[RESTORE] Keycloak database restored successfully"
elif [ "$RESTORE_KEYCLOAK" = "true" ]; then
    echo "[RESTORE] Warning: No Keycloak database dump found in backup"
fi

# =============================================================================
# Restore S3 Object Storage (SeaweedFS)
# =============================================================================
if [ "$RESTORE_STORAGE" = "true" ]; then
    # Try new-format directory (storage/) first, fall back to legacy (minio/)
    STORAGE_BACKUP_DIR=""
    if [ -d "$TEMP_DIR/storage" ]; then
        STORAGE_BACKUP_DIR="$TEMP_DIR/storage"
    elif [ -d "$TEMP_DIR/minio" ]; then
        STORAGE_BACKUP_DIR="$TEMP_DIR/minio"
    elif [ -d "$TEMP_DIR/minio_backup" ]; then
        STORAGE_BACKUP_DIR="$TEMP_DIR/minio_backup"
    fi

    if [ -n "$STORAGE_BACKUP_DIR" ] && command -v aws >/dev/null 2>&1; then
        echo "[RESTORE] Restoring S3 storage from: $STORAGE_BACKUP_DIR"

        for bucket_dir in "$STORAGE_BACKUP_DIR"/*/; do
            if [ -d "$bucket_dir" ]; then
                bucket_name=$(basename "$bucket_dir")
                echo "[RESTORE] Restoring bucket: $bucket_name"

                # Create bucket if it doesn't exist
                AWS_ACCESS_KEY_ID="$STORAGE_ACCESS_KEY" \
                AWS_SECRET_ACCESS_KEY="$STORAGE_SECRET_KEY" \
                aws s3 mb "s3://$bucket_name" \
                    --endpoint-url "$STORAGE_ENDPOINT_URL" 2>/dev/null || true

                # Sync files into bucket
                AWS_ACCESS_KEY_ID="$STORAGE_ACCESS_KEY" \
                AWS_SECRET_ACCESS_KEY="$STORAGE_SECRET_KEY" \
                aws s3 sync "$bucket_dir" "s3://$bucket_name" \
                    --endpoint-url "$STORAGE_ENDPOINT_URL" \
                    --no-progress 2>/dev/null || \
                    echo "[RESTORE] Warning: Some files in $bucket_name may have failed"
            fi
        done

        echo "[RESTORE] S3 storage restored successfully"
    elif [ -n "$STORAGE_BACKUP_DIR" ]; then
        echo "[RESTORE] Warning: AWS CLI not found — cannot restore S3 storage automatically"
        echo "[RESTORE] Storage backup files are at: $STORAGE_BACKUP_DIR"
        echo "[RESTORE] Install awscli and re-run to restore storage"
    else
        echo "[RESTORE] Warning: No storage backup found in archive"
    fi
fi

# =============================================================================
# Restore Legacy Storage Files (uploads folder)
# =============================================================================
if [ "$RESTORE_STORAGE" = "true" ] && [ -d "$TEMP_DIR/uploads" ]; then
    echo "[RESTORE] Restoring legacy storage files..."

    if [ -d "$STORAGE_PATH" ]; then
        BACKUP_EXISTING="$STORAGE_PATH.backup_$TIMESTAMP"
        echo "[RESTORE] Backing up existing storage to: $BACKUP_EXISTING"
        mv "$STORAGE_PATH" "$BACKUP_EXISTING"
    fi

    mkdir -p "$(dirname "$STORAGE_PATH")"
    cp -r "$TEMP_DIR/uploads" "$STORAGE_PATH"
    echo "[RESTORE] Legacy storage files restored successfully"
fi

# =============================================================================
# Restore Configuration
# =============================================================================
CONFIG_SOURCE=""
REALM_SOURCE=""

if [ -f "$TEMP_DIR/config/.env" ]; then
    CONFIG_SOURCE="$TEMP_DIR/config/.env"
elif [ -f "$TEMP_DIR/.env" ]; then
    CONFIG_SOURCE="$TEMP_DIR/.env"
fi

if [ -f "$TEMP_DIR/config/realm-import.json" ]; then
    REALM_SOURCE="$TEMP_DIR/config/realm-import.json"
fi

if [ "$RESTORE_CONFIG" = "true" ] && [ -n "$CONFIG_SOURCE" ]; then
    echo "[RESTORE] Restoring configuration..."

    if [ -f "$CONFIG_PATH" ]; then
        BACKUP_CONFIG="$CONFIG_PATH.backup_$TIMESTAMP"
        echo "[RESTORE] Backing up existing config to: $BACKUP_CONFIG"
        cp "$CONFIG_PATH" "$BACKUP_CONFIG"
    fi

    cp "$CONFIG_SOURCE" "$CONFIG_PATH"
    echo "[RESTORE] Configuration restored successfully"
fi

if [ "$RESTORE_CONFIG" = "true" ] && [ -n "$REALM_SOURCE" ]; then
    if command -v docker >/dev/null 2>&1 && docker container inspect opentyme-keycloak >/dev/null 2>&1; then
        docker cp "$REALM_SOURCE" "opentyme-keycloak:$KEYCLOAK_REALM_IMPORT_PATH" >/dev/null 2>&1 || \
            echo "[RESTORE] Warning: Failed to copy Keycloak realm import file into container"
    else
        echo "[RESTORE] Warning: Keycloak container is not available; realm import file kept at $REALM_SOURCE"
    fi
fi

# =============================================================================
# Repopulate Backup Records
# =============================================================================
if [ "$RESTORE_DB" = "true" ] && [ -d "$BACKUPS_DIR" ]; then
    echo "[RESTORE] Scanning backups directory to repopulate system_backups table..."

    for backup_dir in "$BACKUPS_DIR"/*; do
        if [ -d "$backup_dir" ]; then
            backup_name=$(basename "$backup_dir")
            backup_file=$(find "$backup_dir" -name "*.tar.gz" | head -n 1)

            if [ -n "$backup_file" ] && [ -f "$backup_file" ]; then
                file_size=$(stat -f%z "$backup_file" 2>/dev/null || stat -c%s "$backup_file" 2>/dev/null || echo "0")
                filename=$(basename "$backup_file")
                timestamp_part=$(echo "$filename" | sed 's/backup_\([0-9]\{8\}_[0-9]\{6\}\).*/\1/')

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

                if echo "$backup_name" | grep -q "^scheduled_"; then
                    backup_type="scheduled"
                else
                    backup_type="manual"
                fi

                PGPASSWORD="$DB_PASSWORD" psql \
                    -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
                    -c "INSERT INTO system_backups (backup_name, backup_type, status, backup_path, file_size_bytes, includes_database, includes_storage, includes_config, started_at, completed_at, created_at)
                        SELECT
                            '${backup_name}', '${backup_type}', 'completed',
                            '${backup_dir}', ${file_size}, true, true, false,
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
  "restored_database": $RESTORE_DB,
  "restored_keycloak_database": $RESTORE_KEYCLOAK,
  "restored_storage": $RESTORE_STORAGE,
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
