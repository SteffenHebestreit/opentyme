#!/bin/bash

###############################################################################
# tyme Backup Script (Host-side)
# Backs up:
# - Tyme PostgreSQL database
# - Keycloak PostgreSQL database
# - MinIO object storage (all user buckets)
# - Configuration files (optional)
#
# Usage: ./backup.sh [backup_name]
#
# Environment variables:
#   BACKUP_DIR          - Base backup directory (default: ./backups)
#   INCLUDE_DATABASE    - Include Tyme database (default: true)
#   INCLUDE_KEYCLOAK    - Include Keycloak database (default: true)
#   INCLUDE_MINIO       - Include MinIO storage (default: true)
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
INCLUDE_MINIO="${INCLUDE_MINIO:-true}"
INCLUDE_CONFIG="${INCLUDE_CONFIG:-false}"

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
log "Tyme System Backup"
log "=============================================="
log "Backup name: $BACKUP_NAME"
log "Backup directory: $BACKUP_DIR"
log "Include Tyme DB: $INCLUDE_DATABASE"
log "Include Keycloak DB: $INCLUDE_KEYCLOAK"
log "Include MinIO: $INCLUDE_MINIO"
log "Include Config: $INCLUDE_CONFIG"
log "=============================================="

# Backup Tyme database
if [ "$INCLUDE_DATABASE" = "true" ]; then
    log "Backing up Tyme database..."
    DB_FILE="$BACKUP_DIR/tyme_database.dump"
    
    $DOCKER_COMPOSE exec -T db pg_dump -U postgres -d tyme -Fc > "$DB_FILE"
    
    if [ $? -eq 0 ] && [ -s "$DB_FILE" ]; then
        log "Tyme database backup completed: $(du -h "$DB_FILE" | cut -f1)"
    else
        error "Tyme database backup failed"
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

# Backup MinIO storage
if [ "$INCLUDE_MINIO" = "true" ]; then
    log "Backing up MinIO storage..."
    MINIO_DIR="$BACKUP_DIR/minio_backup"
    mkdir -p "$MINIO_DIR"
    
    # Configure mc inside the backend container (which has mc installed)
    $DOCKER_COMPOSE exec -T backend sh -c '
        if command -v mc >/dev/null 2>&1; then
            mc alias set backup-minio http://minio:9000 minioadmin minioadmin123 2>/dev/null || true
            # List and export all buckets
            for bucket in $(mc ls backup-minio/ 2>/dev/null | awk "{print \$NF}" | sed "s/\/$//"); do
                echo "Exporting bucket: $bucket"
                mc mirror backup-minio/$bucket /tmp/minio_backup/$bucket 2>/dev/null || true
            done
        else
            echo "MinIO client not available in backend container"
        fi
    ' 2>/dev/null || true
    
    # Copy the exported data from container
    docker cp $(docker-compose ps -q backend):/tmp/minio_backup/. "$MINIO_DIR/" 2>/dev/null || true
    
    if [ -d "$MINIO_DIR" ] && [ "$(ls -A "$MINIO_DIR" 2>/dev/null)" ]; then
        log "MinIO storage backup completed: $(du -sh "$MINIO_DIR" | cut -f1)"
    else
        warn "MinIO storage backup: No data found or backup failed"
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
  "includes": {
    "tyme_database": $INCLUDE_DATABASE,
    "keycloak_database": $INCLUDE_KEYCLOAK,
    "minio_storage": $INCLUDE_MINIO,
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
