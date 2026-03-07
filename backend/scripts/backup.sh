#!/bin/bash
set -e

# Backup script for OpenTYME application
# This script backs up all critical data needed to restore the system:
# - PostgreSQL main database (opentyme)
# - PostgreSQL Keycloak database (authentication)
# - S3-compatible object storage (SeaweedFS — receipts, documents, user files)

BACKUP_DIR="${BACKUP_DIR:-/usr/src/app/backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="${1:-backup_$TIMESTAMP}"
INCLUDE_DB="${INCLUDE_DATABASE:-true}"
INCLUDE_STORAGE="${INCLUDE_STORAGE:-true}"
INCLUDE_CONFIG="${INCLUDE_CONFIG:-false}"

# Main Database configuration
DB_HOST="${DB_HOST:-db}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${POSTGRES_PASSWORD:-password}"
DB_NAME="${POSTGRES_DB:-opentyme}"

# Keycloak Database configuration
KEYCLOAK_DB_HOST="${KEYCLOAK_DB_HOST:-keycloak-db}"
KEYCLOAK_DB_PORT="${KEYCLOAK_DB_PORT:-5432}"
KEYCLOAK_DB_USER="${KEYCLOAK_DB_USER:-keycloak_user}"
KEYCLOAK_DB_PASSWORD="${KEYCLOAK_DB_PASSWORD:-keycloak_password}"
KEYCLOAK_DB_NAME="${KEYCLOAK_DB_NAME:-postgres}"

# S3-compatible storage configuration (SeaweedFS)
STORAGE_HOST="${STORAGE_ENDPOINT:-${MINIO_ENDPOINT:-seaweedfs}}"
STORAGE_S3_PORT="${STORAGE_PORT:-${MINIO_PORT:-8333}}"
STORAGE_ACCESS_KEY="${STORAGE_ACCESS_KEY:-${MINIO_ACCESS_KEY:-admin}}"
STORAGE_SECRET_KEY="${STORAGE_SECRET_KEY:-${MINIO_SECRET_KEY:-password}}"
STORAGE_ENDPOINT_URL="http://${STORAGE_HOST}:${STORAGE_S3_PORT}"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Create temporary directory for this backup
TEMP_DIR="$BACKUP_DIR/temp_$TIMESTAMP"
mkdir -p "$TEMP_DIR"

BACKUP_FILE="$BACKUP_DIR/${BACKUP_NAME}.tar.gz"

echo "[BACKUP] ============================================"
echo "[BACKUP] Starting full system backup: $BACKUP_NAME"
echo "[BACKUP] ============================================"
echo "[BACKUP] Backup directory: $BACKUP_DIR"
echo "[BACKUP] Include Databases: $INCLUDE_DB"
echo "[BACKUP] Include Storage (SeaweedFS): $INCLUDE_STORAGE"
echo "[BACKUP] Include Config: $INCLUDE_CONFIG"
echo "[BACKUP] ============================================"

# Backup main opentyme database
if [ "$INCLUDE_DB" = "true" ]; then
    echo ""
    echo "[BACKUP] === Main Database (opentyme) ==="
    echo "[BACKUP] Host: $DB_HOST:$DB_PORT"

    PGPASSWORD="$DB_PASSWORD" pg_dump \
        -h "$DB_HOST" \
        -p "$DB_PORT" \
        -U "$DB_USER" \
        -d "$DB_NAME" \
        -F c \
        -f "$TEMP_DIR/opentyme_database.dump" 2>&1

    if [ $? -eq 0 ]; then
        OPENTYME_DB_SIZE=$(stat -c%s "$TEMP_DIR/opentyme_database.dump" 2>/dev/null || stat -f%z "$TEMP_DIR/opentyme_database.dump" 2>/dev/null || echo "0")
        echo "[BACKUP] ✓ Main database backup completed ($OPENTYME_DB_SIZE bytes)"
    else
        echo "[BACKUP] ✗ Main database backup failed!"
        rm -rf "$TEMP_DIR"
        exit 1
    fi

    # Backup Keycloak database
    echo ""
    echo "[BACKUP] === Keycloak Database ==="
    echo "[BACKUP] Host: $KEYCLOAK_DB_HOST:$KEYCLOAK_DB_PORT"

    PGPASSWORD="$KEYCLOAK_DB_PASSWORD" pg_dump \
        -h "$KEYCLOAK_DB_HOST" \
        -p "$KEYCLOAK_DB_PORT" \
        -U "$KEYCLOAK_DB_USER" \
        -d "$KEYCLOAK_DB_NAME" \
        -F c \
        -f "$TEMP_DIR/keycloak_database.dump" 2>&1

    if [ $? -eq 0 ]; then
        KC_DB_SIZE=$(stat -c%s "$TEMP_DIR/keycloak_database.dump" 2>/dev/null || stat -f%z "$TEMP_DIR/keycloak_database.dump" 2>/dev/null || echo "0")
        echo "[BACKUP] ✓ Keycloak database backup completed ($KC_DB_SIZE bytes)"
    else
        echo "[BACKUP] ✗ Keycloak database backup failed!"
        rm -rf "$TEMP_DIR"
        exit 1
    fi
fi

# Backup S3 object storage (SeaweedFS)
if [ "$INCLUDE_STORAGE" = "true" ]; then
    echo ""
    echo "[BACKUP] === S3 Object Storage (SeaweedFS) ==="
    echo "[BACKUP] Endpoint: $STORAGE_ENDPOINT_URL"

    mkdir -p "$TEMP_DIR/storage"

    if command -v aws >/dev/null 2>&1; then
        # List all buckets
        BUCKETS=$(AWS_ACCESS_KEY_ID="$STORAGE_ACCESS_KEY" \
                  AWS_SECRET_ACCESS_KEY="$STORAGE_SECRET_KEY" \
                  aws s3 ls --endpoint-url "$STORAGE_ENDPOINT_URL" 2>/dev/null \
                  | awk '{print $3}') || true

        if [ -n "$BUCKETS" ]; then
            for bucket in $BUCKETS; do
                echo "[BACKUP] Syncing bucket: $bucket"
                AWS_ACCESS_KEY_ID="$STORAGE_ACCESS_KEY" \
                AWS_SECRET_ACCESS_KEY="$STORAGE_SECRET_KEY" \
                aws s3 sync "s3://$bucket" "$TEMP_DIR/storage/$bucket" \
                    --endpoint-url "$STORAGE_ENDPOINT_URL" \
                    --no-progress 2>/dev/null || {
                    echo "[BACKUP] Warning: Could not sync bucket $bucket"
                }
            done

            STORAGE_SIZE=$(du -sb "$TEMP_DIR/storage" 2>/dev/null | cut -f1 || echo "0")
            echo "[BACKUP] ✓ Storage backup completed ($STORAGE_SIZE bytes)"
        else
            echo "[BACKUP] Warning: No storage buckets found or endpoint not accessible"
        fi
    else
        echo "[BACKUP] Warning: AWS CLI not found — skipping storage backup"
        echo "[BACKUP] Install awscli in the backend image to enable storage backups"
    fi
fi

# Backup configuration
if [ "$INCLUDE_CONFIG" = "true" ]; then
    echo ""
    echo "[BACKUP] === Configuration Files ==="

    mkdir -p "$TEMP_DIR/config"

    if [ -f "/usr/src/app/.env" ]; then
        cp "/usr/src/app/.env" "$TEMP_DIR/config/.env"
        echo "[BACKUP] ✓ Backed up .env"
    fi

    if [ -f "/keycloak/realm-import.json" ]; then
        cp "/keycloak/realm-import.json" "$TEMP_DIR/config/realm-import.json"
        echo "[BACKUP] ✓ Backed up Keycloak realm config"
    fi

    echo "[BACKUP] ✓ Configuration backup completed"
fi

# Create backup manifest
echo ""
echo "[BACKUP] === Creating Backup Manifest ==="
cat > "$TEMP_DIR/manifest.json" << EOF
{
  "backup_name": "$BACKUP_NAME",
  "backup_timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "backup_version": "2.1",
  "storage_type": "seaweedfs_s3",
  "includes": {
    "opentyme_database": $INCLUDE_DB,
    "keycloak_database": $INCLUDE_DB,
    "s3_storage": $INCLUDE_STORAGE,
    "config_files": $INCLUDE_CONFIG
  },
  "databases": {
    "opentyme": { "host": "$DB_HOST", "name": "$DB_NAME" },
    "keycloak": { "host": "$KEYCLOAK_DB_HOST", "name": "$KEYCLOAK_DB_NAME" }
  },
  "storage": {
    "endpoint": "$STORAGE_ENDPOINT_URL"
  }
}
EOF

# Create tarball
echo ""
echo "[BACKUP] === Creating Backup Archive ==="
cd "$TEMP_DIR"
tar -czf "$BACKUP_FILE" .
cd - > /dev/null

# Cleanup temporary directory
rm -rf "$TEMP_DIR"

# Get file size
BACKUP_SIZE=$(stat -c%s "$BACKUP_FILE" 2>/dev/null || stat -f%z "$BACKUP_FILE" 2>/dev/null || echo "0")
BACKUP_SIZE_MB=$((BACKUP_SIZE / 1024 / 1024))

echo ""
echo "[BACKUP] ============================================"
echo "[BACKUP] ✓ BACKUP COMPLETED SUCCESSFULLY"
echo "[BACKUP] ============================================"
echo "[BACKUP] File: $BACKUP_FILE"
echo "[BACKUP] Size: $BACKUP_SIZE bytes (~${BACKUP_SIZE_MB} MB)"
echo "[BACKUP] ============================================"

# Output JSON for the service to parse
cat <<EOF
{
  "success": true,
  "file_path": "$BACKUP_FILE",
  "file_size": $BACKUP_SIZE,
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
