#!/bin/bash

###############################################################################
# OpenTYME Backup Script (Host-side)
# Backs up:
# - OpenTYME PostgreSQL database
# - Keycloak PostgreSQL database
# - S3-compatible object storage (SeaweedFS — all user buckets)
# - Configuration files (optional)
#
# Usage: ./backup.sh [backup_name]
#
# Environment variables:
#   BACKUP_DIR          - Base backup directory (default: ./backups)
#   INCLUDE_DATABASE    - Include OpenTYME database (default: true)
#   INCLUDE_KEYCLOAK    - Include Keycloak database (default: true)
#   INCLUDE_STORAGE     - Include S3 storage (default: true)
#   INCLUDE_CONFIG      - Include configuration files (default: false)
###############################################################################

set -e
set -o pipefail

# Configuration from environment or defaults
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="${1:-backup_$TIMESTAMP}"
BACKUP_BASE_DIR="${BACKUP_DIR:-./backups}"
BACKUP_DIR="$BACKUP_BASE_DIR/$BACKUP_NAME"
INCLUDE_DATABASE="${INCLUDE_DATABASE:-true}"
INCLUDE_KEYCLOAK="${INCLUDE_KEYCLOAK:-true}"
INCLUDE_STORAGE="${INCLUDE_STORAGE:-true}"
INCLUDE_CONFIG="${INCLUDE_CONFIG:-false}"

# S3-compatible storage configuration (SeaweedFS)
STORAGE_HOST="${STORAGE_ENDPOINT:-seaweedfs}"
STORAGE_S3_PORT="${STORAGE_PORT:-8333}"
STORAGE_ACCESS_KEY="${STORAGE_ACCESS_KEY:-admin}"
STORAGE_SECRET_KEY="${STORAGE_SECRET_KEY:-password}"
STORAGE_ENDPOINT_URL="http://${STORAGE_HOST}:${STORAGE_S3_PORT}"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null && ! command -v docker &> /dev/null; then
    error "Docker or docker-compose is required"
    exit 1
fi

# Use docker compose if docker-compose is not available
DOCKER_COMPOSE="docker-compose"
if ! command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker compose"
fi

# Create backup directory
mkdir -p "$BACKUP_DIR"
log "=============================================="
log "OpenTYME System Backup"
log "=============================================="
log "Backup name: $BACKUP_NAME"
log "Backup directory: $BACKUP_DIR"
log "Include OpenTYME DB: $INCLUDE_DATABASE"
log "Include Keycloak DB: $INCLUDE_KEYCLOAK"
log "Include S3 Storage: $INCLUDE_STORAGE"
log "Include Config: $INCLUDE_CONFIG"
log "=============================================="

# Backup OpenTYME database
if [ "$INCLUDE_DATABASE" = "true" ]; then
    log "Backing up OpenTYME database..."
    DB_FILE="$BACKUP_DIR/opentyme_database.dump"

    $DOCKER_COMPOSE exec -T db pg_dump -U postgres -d opentyme -Fc > "$DB_FILE"

    if [ $? -eq 0 ] && [ -s "$DB_FILE" ]; then
        log "OpenTYME database backup completed: $(du -h "$DB_FILE" | cut -f1)"
    else
        error "OpenTYME database backup failed"
        rm -f "$DB_FILE"
        exit 1
    fi
fi

# Backup Keycloak database
if [ "$INCLUDE_KEYCLOAK" = "true" ]; then
    log "Backing up Keycloak database..."
    KC_DB_FILE="$BACKUP_DIR/keycloak_database.dump"

    $DOCKER_COMPOSE exec -T keycloak-db pg_dump -U keycloak_user -d keycloak -Fc > "$KC_DB_FILE"

    if [ $? -eq 0 ] && [ -s "$KC_DB_FILE" ]; then
        log "Keycloak database backup completed: $(du -h "$KC_DB_FILE" | cut -f1)"
    else
        warn "Keycloak database backup failed (container may not be running)"
        rm -f "$KC_DB_FILE"
    fi
fi

# Backup S3 object storage (SeaweedFS)
if [ "$INCLUDE_STORAGE" = "true" ]; then
    log "Backing up S3 object storage (SeaweedFS)..."
    STORAGE_DIR="$BACKUP_DIR/storage"
    mkdir -p "$STORAGE_DIR"

    if command -v aws &> /dev/null; then
        # List and sync all buckets via AWS CLI against the SeaweedFS S3 endpoint
        BUCKETS=$(AWS_ACCESS_KEY_ID="$STORAGE_ACCESS_KEY" \
                  AWS_SECRET_ACCESS_KEY="$STORAGE_SECRET_KEY" \
                  aws s3 ls --endpoint-url "$STORAGE_ENDPOINT_URL" 2>/dev/null \
                  | awk '{print $3}') || true

        if [ -n "$BUCKETS" ]; then
            for bucket in $BUCKETS; do
                log "Syncing bucket: $bucket"
                AWS_ACCESS_KEY_ID="$STORAGE_ACCESS_KEY" \
                AWS_SECRET_ACCESS_KEY="$STORAGE_SECRET_KEY" \
                aws s3 sync "s3://$bucket" "$STORAGE_DIR/$bucket" \
                    --endpoint-url "$STORAGE_ENDPOINT_URL" \
                    --no-progress 2>/dev/null || warn "Could not sync bucket $bucket"
            done

            if [ -d "$STORAGE_DIR" ] && [ "$(ls -A "$STORAGE_DIR" 2>/dev/null)" ]; then
                log "S3 storage backup completed: $(du -sh "$STORAGE_DIR" | cut -f1)"
            else
                warn "S3 storage backup: No data found or backup failed"
            fi
        else
            warn "No buckets found or SeaweedFS not accessible at $STORAGE_ENDPOINT_URL"
        fi
    else
        warn "AWS CLI not found — skipping S3 storage backup"
        warn "Install awscli to enable storage backups: https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html"
    fi
fi

# Backup configuration
if [ "$INCLUDE_CONFIG" = "true" ]; then
    log "Backing up configuration..."
    CONFIG_FILE="$BACKUP_DIR/config.tar.gz"

    tar -czf "$CONFIG_FILE" \
        docker-compose.yml \
        init.sql \
        keycloak/realm-import.json \
        traefik/*.yml \
        config/seaweedfs/s3.json \
        .env \
        2>/dev/null || true

    if [ -f "$CONFIG_FILE" ]; then
        log "Configuration backup completed: $(du -h "$CONFIG_FILE" | cut -f1)"
    else
        warn "Configuration backup: Some files may be missing"
    fi
fi

# Create manifest
cat > "$BACKUP_DIR/manifest.json" <<EOF
{
  "backup_name": "$BACKUP_NAME",
  "timestamp": "$(date -Iseconds)",
  "storage_type": "seaweedfs_s3",
  "includes": {
    "opentyme_database": $INCLUDE_DATABASE,
    "keycloak_database": $INCLUDE_KEYCLOAK,
    "s3_storage": $INCLUDE_STORAGE,
    "config": $INCLUDE_CONFIG
  },
  "files": [
$(ls -1 "$BACKUP_DIR" | while read f; do echo "    \"$f\","; done | sed '$ s/,$//')
  ],
  "total_size": "$(du -sh "$BACKUP_DIR" | cut -f1)"
}
EOF

# Create tar archive
log "Creating backup archive..."
ARCHIVE_FILE="$BACKUP_DIR/backup_$TIMESTAMP.tar.gz"
cd "$BACKUP_DIR"
tar -czf "backup_$TIMESTAMP.tar.gz" --exclude="*.tar.gz" . 2>/dev/null || true
cd - > /dev/null

log "=============================================="
log "Backup completed successfully!"
log "=============================================="
log "Location: $BACKUP_DIR"
log "Archive: $ARCHIVE_FILE"
log "Total size: $(du -sh "$BACKUP_DIR" | cut -f1)"

echo "$BACKUP_DIR"
