#!/usr/bin/env bash

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

set -euo pipefail

# Configuration from environment or defaults
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="${BACKUP_NAME:-${1:-backup_$TIMESTAMP}}"
BACKUP_BASE_DIR="${BACKUP_DIR:-$PROJECT_ROOT/backups}"
case "$BACKUP_BASE_DIR" in
    /*) ;;
    *) BACKUP_BASE_DIR="$PROJECT_ROOT/${BACKUP_BASE_DIR#./}" ;;
esac
BACKUP_DIR="$BACKUP_BASE_DIR/$BACKUP_NAME"
INCLUDE_DATABASE="${INCLUDE_DATABASE:-true}"
INCLUDE_KEYCLOAK="${INCLUDE_KEYCLOAK:-true}"
INCLUDE_STORAGE="${INCLUDE_STORAGE:-true}"
INCLUDE_CONFIG="${INCLUDE_CONFIG:-false}"
KEYCLOAK_DATABASE_NAME="${KEYCLOAK_DATABASE_NAME:-${KEYCLOAK_DB_NAME:-postgres}}"

if [ -n "${HOME:-}" ] && [ -d "$HOME/.local/bin" ]; then
    export PATH="$HOME/.local/bin:$PATH"
fi

# S3-compatible storage configuration (SeaweedFS)
STORAGE_HOST="${STORAGE_ENDPOINT:-localhost}"
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

fail() {
    error "$1"
    exit 1
}

json_escape() {
    printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
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
find "$BACKUP_DIR" -maxdepth 1 -type d -name "temp_${BACKUP_NAME}.*" -exec rm -rf {} + 2>/dev/null || true
TEMP_DIR="$(mktemp -d "$BACKUP_DIR/temp_${BACKUP_NAME}.XXXXXX")"
ARCHIVE_FILE="$BACKUP_DIR/${BACKUP_NAME}.tar.gz"
SUCCESS=0

cleanup() {
    rm -rf "$TEMP_DIR"

    if [ "$SUCCESS" -ne 1 ] && [ -f "$ARCHIVE_FILE" ]; then
        rm -f "$ARCHIVE_FILE"
    fi
}

trap cleanup EXIT

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

if [ "$INCLUDE_DATABASE" != "true" ] && [ "$INCLUDE_KEYCLOAK" != "true" ] && [ "$INCLUDE_STORAGE" != "true" ] && [ "$INCLUDE_CONFIG" != "true" ]; then
    fail "Nothing selected for backup"
fi

# Backup OpenTYME database
if [ "$INCLUDE_DATABASE" = "true" ]; then
    log "Backing up OpenTYME database..."
    DB_FILE="$TEMP_DIR/opentyme_database.dump"

    $DOCKER_COMPOSE exec -T db pg_dump -U postgres -d opentyme -Fc > "$DB_FILE"

    [ -s "$DB_FILE" ] || fail "OpenTYME database backup failed"
    log "OpenTYME database backup completed: $(du -h "$DB_FILE" | cut -f1)"
fi

# Backup Keycloak database
if [ "$INCLUDE_KEYCLOAK" = "true" ]; then
    log "Backing up Keycloak database..."
    KC_DB_FILE="$TEMP_DIR/keycloak_database.dump"

    $DOCKER_COMPOSE exec -T keycloak-db pg_dump -U keycloak_user -d "$KEYCLOAK_DATABASE_NAME" -Fc > "$KC_DB_FILE"

    if [ -s "$KC_DB_FILE" ]; then
        log "Keycloak database backup completed: $(du -h "$KC_DB_FILE" | cut -f1)"
    else
        warn "Keycloak database backup failed (container may not be running)"
        rm -f "$KC_DB_FILE"
    fi
fi

# Backup S3 object storage (SeaweedFS)
if [ "$INCLUDE_STORAGE" = "true" ]; then
    log "Backing up S3 object storage (SeaweedFS)..."
    STORAGE_DIR="$TEMP_DIR/storage"
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
                rmdir "$STORAGE_DIR" 2>/dev/null || true
            fi
        else
            warn "No buckets found or SeaweedFS not accessible at $STORAGE_ENDPOINT_URL"
            rmdir "$STORAGE_DIR" 2>/dev/null || true
        fi
    else
        warn "AWS CLI not found — skipping S3 storage backup"
        warn "Install awscli to enable storage backups: https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html"
        rmdir "$STORAGE_DIR" 2>/dev/null || true
    fi
fi

# Backup configuration
if [ "$INCLUDE_CONFIG" = "true" ]; then
    log "Backing up configuration..."
        CONFIG_DIR="$TEMP_DIR/config"
        mkdir -p "$CONFIG_DIR"

        for source_file in docker-compose.yml init.sql keycloak/realm-import.json config/seaweedfs/s3.json .env backend/.env backend/.env.production frontend/.env; do
            if [ -f "$PROJECT_ROOT/$source_file" ]; then
                        mkdir -p "$CONFIG_DIR/$(dirname "$source_file")"
                cp "$PROJECT_ROOT/$source_file" "$CONFIG_DIR/$source_file"
                fi
        done

        for traefik_file in "$PROJECT_ROOT"/traefik/*.yml; do
            if [ -f "$traefik_file" ]; then
                        mkdir -p "$CONFIG_DIR/traefik"
                cp "$traefik_file" "$CONFIG_DIR/traefik/"
                fi
        done

        if [ -n "$(find "$CONFIG_DIR" -mindepth 1 -print -quit 2>/dev/null)" ]; then
                log "Configuration backup completed: $(du -sh "$CONFIG_DIR" | cut -f1)"
    else
        warn "Configuration backup: Some files may be missing"
                rmdir "$CONFIG_DIR" 2>/dev/null || true
    fi
fi

# Create manifest
cat > "$TEMP_DIR/manifest.json" <<EOF
{
  "backup_name": "$BACKUP_NAME",
  "timestamp": "$(date -Iseconds)",
    "backup_version": "2.2",
  "storage_type": "seaweedfs_s3",
  "includes": {
    "opentyme_database": $INCLUDE_DATABASE,
    "keycloak_database": $INCLUDE_KEYCLOAK,
    "s3_storage": $INCLUDE_STORAGE,
    "config": $INCLUDE_CONFIG
  },
    "contents": {
        "opentyme_database_dump": $(if [ -f "$TEMP_DIR/opentyme_database.dump" ]; then echo true; else echo false; fi),
        "keycloak_database_dump": $(if [ -f "$TEMP_DIR/keycloak_database.dump" ]; then echo true; else echo false; fi),
        "storage_directory": $(if [ -d "$TEMP_DIR/storage" ]; then echo true; else echo false; fi),
        "config_directory": $(if [ -d "$TEMP_DIR/config" ]; then echo true; else echo false; fi)
    }
}
EOF

# Create tar archive
log "Creating backup archive..."
cd "$TEMP_DIR"
tar -czf "$ARCHIVE_FILE" .
cd - > /dev/null

[ -s "$ARCHIVE_FILE" ] || fail "Backup archive was not created"

SUCCESS=1

log "=============================================="
log "Backup completed successfully!"
log "=============================================="
log "Location: $BACKUP_DIR"
log "Archive: $ARCHIVE_FILE"
log "Total size: $(du -h "$ARCHIVE_FILE" | cut -f1)"

cat <<EOF
{
    "success": true,
    "backup_dir": "$(json_escape "$BACKUP_DIR")",
    "file_path": "$(json_escape "$ARCHIVE_FILE")",
    "file_size": $(stat -c%s "$ARCHIVE_FILE" 2>/dev/null || stat -f%z "$ARCHIVE_FILE" 2>/dev/null || echo 0),
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
