#!/bin/bash
set -e

# Backup script for OpenTYME application
# This script backs up all critical data needed to restore the system:
# - PostgreSQL main database (opentyme)
# - PostgreSQL Keycloak database (authentication)
# - MinIO object storage (receipts, documents, user files)

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

# MinIO configuration
MINIO_HOST="${MINIO_ENDPOINT:-minio}"
MINIO_PORT="${MINIO_PORT:-9000}"
MINIO_ACCESS_KEY="${MINIO_ACCESS_KEY:-minioadmin}"
MINIO_SECRET_KEY="${MINIO_SECRET_KEY:-minioadmin123}"

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
echo "[BACKUP] Include Storage (MinIO): $INCLUDE_STORAGE"
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

# Backup MinIO storage
if [ "$INCLUDE_STORAGE" = "true" ]; then
    echo ""
    echo "[BACKUP] === MinIO Object Storage ==="
    echo "[BACKUP] Host: $MINIO_HOST:$MINIO_PORT"
    
    mkdir -p "$TEMP_DIR/minio"
    
    # Configure mc (MinIO client) alias
    mc alias set backup_minio http://$MINIO_HOST:$MINIO_PORT $MINIO_ACCESS_KEY $MINIO_SECRET_KEY --api S3v4 2>/dev/null || true
    
    # List and backup all buckets
    BUCKETS=$(mc ls backup_minio 2>/dev/null | awk '{print $NF}' | tr -d '/')
    
    if [ -n "$BUCKETS" ]; then
        for bucket in $BUCKETS; do
            echo "[BACKUP] Backing up bucket: $bucket"
            mc cp --recursive backup_minio/$bucket "$TEMP_DIR/minio/$bucket" 2>/dev/null || {
                echo "[BACKUP] Warning: Could not backup bucket $bucket"
            }
        done
        
        MINIO_SIZE=$(du -sb "$TEMP_DIR/minio" 2>/dev/null | cut -f1 || echo "0")
        echo "[BACKUP] ✓ MinIO storage backup completed ($MINIO_SIZE bytes)"
    else
        echo "[BACKUP] Warning: No MinIO buckets found or MinIO not accessible"
    fi
fi

# Backup configuration
if [ "$INCLUDE_CONFIG" = "true" ]; then
    echo ""
    echo "[BACKUP] === Configuration Files ==="
    
    mkdir -p "$TEMP_DIR/config"
    
    # Backup .env if exists
    if [ -f "/usr/src/app/.env" ]; then
        cp "/usr/src/app/.env" "$TEMP_DIR/config/.env"
        echo "[BACKUP] ✓ Backed up .env"
    fi
    
    # Backup keycloak realm export if exists
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
  "backup_version": "2.0",
  "includes": {
    "opentyme_database": $INCLUDE_DB,
    "keycloak_database": $INCLUDE_DB,
    "minio_storage": $INCLUDE_STORAGE,
    "config_files": $INCLUDE_CONFIG
  },
  "databases": {
    "opentyme": {
      "host": "$DB_HOST",
      "name": "$DB_NAME"
    },
    "keycloak": {
      "host": "$KEYCLOAK_DB_HOST",
      "name": "$KEYCLOAK_DB_NAME"
    }
  },
  "minio": {
    "host": "$MINIO_HOST",
    "port": "$MINIO_PORT"
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

