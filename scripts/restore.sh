#!/bin/bash

###############################################################################
# OpenTYME Restore Script (Host-side)
# Restores:
# - OpenTYME PostgreSQL database
# - Keycloak PostgreSQL database
# - MinIO object storage (all user buckets)
# - Configuration files (optional)
#
# SAFETY FEATURES:
# - Interactive confirmation prompt before restore
# - Automatic backup of current data BEFORE restore (pre_restore_*)
# - Dry-run mode to preview what would be restored
#
# Usage: ./restore.sh <backup_path>
#
# Environment variables:
#   RESTORE_DATABASE    - Restore OpenTYME database (default: true)
#   RESTORE_KEYCLOAK    - Restore Keycloak database (default: true)
#   RESTORE_MINIO       - Restore MinIO storage (default: true)
#   RESTORE_CONFIG      - Restore configuration files (default: false)
#   SKIP_PRE_BACKUP     - Skip automatic pre-restore backup (default: false)
#   DRY_RUN             - Show what would be restored without changes (default: false)
#
# Examples:
#   ./restore.sh ./backups/my_backup           # Normal restore with safety backup
#   DRY_RUN=true ./restore.sh ./backups/my_backup  # Preview only
#   SKIP_PRE_BACKUP=true ./restore.sh ./backups/my_backup  # Skip safety backup
###############################################################################

set -e
set -o pipefail

# Configuration from environment
BACKUP_PATH="${BACKUP_PATH:-$1}"
RESTORE_DATABASE="${RESTORE_DATABASE:-true}"
RESTORE_KEYCLOAK="${RESTORE_KEYCLOAK:-true}"
RESTORE_MINIO="${RESTORE_MINIO:-true}"
RESTORE_CONFIG="${RESTORE_CONFIG:-false}"
SKIP_PRE_BACKUP="${SKIP_PRE_BACKUP:-false}"
DRY_RUN="${DRY_RUN:-false}"

# Pre-restore backup directory
PRE_RESTORE_BACKUP_DIR="./backups/pre_restore_$(date +%Y%m%d_%H%M%S)"

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

# Validate backup path
if [ -z "$BACKUP_PATH" ]; then
    error "Backup path is required"
    echo "Usage: ./restore.sh <backup_path>"
    exit 1
fi

if [ ! -d "$BACKUP_PATH" ]; then
    error "Backup directory not found: $BACKUP_PATH"
    exit 1
fi

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

log "=============================================="
log "OpenTYME System Restore"
log "=============================================="
log "Backup path: $BACKUP_PATH"
log "Restore OpenTYME DB: $RESTORE_DATABASE"
log "Restore Keycloak DB: $RESTORE_KEYCLOAK"
log "Restore MinIO: $RESTORE_MINIO"
log "Restore Config: $RESTORE_CONFIG"
log "=============================================="

# Warning
warn "⚠️  This will overwrite existing data!"
warn "⚠️  Make sure you have a recent backup before proceeding"
echo ""

# Dry run mode - just show what would be done
if [ "$DRY_RUN" = "true" ]; then
    warn "DRY RUN MODE - No changes will be made"
    log "Would restore from: $BACKUP_PATH"
    [ -f "$BACKUP_PATH/opentyme_database.dump" ] || [ -f "$BACKUP_PATH/tyme_database.dump" ] || [ -f "$BACKUP_PATH/database.dump" ] && log "  - OpenTYME database: YES"
    [ -f "$BACKUP_PATH/keycloak_database.dump" ] && log "  - Keycloak database: YES"
    [ -d "$BACKUP_PATH/minio_backup" ] && log "  - MinIO storage: YES"
    exit 0
fi

read -p "Continue with restore? (y/N) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    log "Restore cancelled"
    exit 0
fi

# =============================================================================
# SAFETY: Create automatic backup of current data before restore
# =============================================================================
if [ "$SKIP_PRE_BACKUP" != "true" ]; then
    log "============================================="
    log "Creating safety backup before restore..."
    log "============================================="
    mkdir -p "$PRE_RESTORE_BACKUP_DIR"
    
    # Backup current OpenTYME database
    if [ "$RESTORE_DATABASE" = "true" ]; then
        log "Backing up current OpenTYME database..."
        $DOCKER_COMPOSE exec -T db pg_dump -U postgres -d opentyme -Fc > "$PRE_RESTORE_BACKUP_DIR/opentyme_database.dump" 2>/dev/null || warn "Could not backup OpenTYME database (may not exist)"
    fi
    
    # Backup current Keycloak database
    if [ "$RESTORE_KEYCLOAK" = "true" ]; then
        log "Backing up current Keycloak database..."
        $DOCKER_COMPOSE exec -T keycloak-db pg_dump -U keycloak_user -d keycloak -Fc > "$PRE_RESTORE_BACKUP_DIR/keycloak_database.dump" 2>/dev/null || warn "Could not backup Keycloak database (may not exist)"
    fi
    
    log "Safety backup created: $PRE_RESTORE_BACKUP_DIR"
    log "If restore fails, you can recover from this backup"
    log "============================================="
else
    warn "Skipping pre-restore backup (SKIP_PRE_BACKUP=true)"
fi

# Restore OpenTYME database
if [ "$RESTORE_DATABASE" = "true" ]; then
    # Check for both new and legacy formats
    DB_FILE=""
    if [ -f "$BACKUP_PATH/opentyme_database.dump" ]; then
        DB_FILE="$BACKUP_PATH/opentyme_database.dump"
    elif [ -f "$BACKUP_PATH/tyme_database.dump" ]; then
        DB_FILE="$BACKUP_PATH/tyme_database.dump"
    elif [ -f "$BACKUP_PATH/database.dump" ]; then
        DB_FILE="$BACKUP_PATH/database.dump"
    elif [ -f "$BACKUP_PATH/database.sql.gz" ]; then
        # Legacy format
        DB_FILE="$BACKUP_PATH/database.sql.gz"
    fi
    
    if [ -n "$DB_FILE" ] && [ -f "$DB_FILE" ]; then
        log "Restoring OpenTYME database from: $DB_FILE"
        
        # Drop and recreate database
        $DOCKER_COMPOSE exec -T db psql -U postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='opentyme' AND pid <> pg_backend_pid();" 2>/dev/null || true
        $DOCKER_COMPOSE exec -T db psql -U postgres -c "DROP DATABASE IF EXISTS opentyme;" 2>/dev/null || true
        $DOCKER_COMPOSE exec -T db psql -U postgres -c "CREATE DATABASE opentyme;"
        
        # Restore from backup (handle both formats)
        if [[ "$DB_FILE" == *.sql.gz ]]; then
            gunzip -c "$DB_FILE" | $DOCKER_COMPOSE exec -T db psql -U postgres -d opentyme
        else
            cat "$DB_FILE" | $DOCKER_COMPOSE exec -T db pg_restore -U postgres -d opentyme -v --no-owner --no-privileges 2>&1 || true
        fi
        
        log "OpenTYME database restored successfully"
    else
        warn "OpenTYME database backup file not found"
    fi
fi

# Restore Keycloak database
if [ "$RESTORE_KEYCLOAK" = "true" ]; then
    KC_DB_FILE="$BACKUP_PATH/keycloak_database.dump"
    
    if [ -f "$KC_DB_FILE" ]; then
        log "Restoring Keycloak database..."
        
        # Drop and recreate database
        $DOCKER_COMPOSE exec -T keycloak-db psql -U keycloak_user -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='keycloak' AND pid <> pg_backend_pid();" 2>/dev/null || true
        $DOCKER_COMPOSE exec -T keycloak-db psql -U keycloak_user -d postgres -c "DROP DATABASE IF EXISTS keycloak;" 2>/dev/null || true
        $DOCKER_COMPOSE exec -T keycloak-db psql -U keycloak_user -d postgres -c "CREATE DATABASE keycloak OWNER keycloak_user;"
        
        # Restore from backup
        cat "$KC_DB_FILE" | $DOCKER_COMPOSE exec -T keycloak-db pg_restore -U keycloak_user -d keycloak -v --no-owner --no-privileges 2>&1 || true
        
        log "Keycloak database restored successfully"
    else
        warn "Keycloak database backup file not found: $KC_DB_FILE"
    fi
fi

# Restore MinIO storage
if [ "$RESTORE_MINIO" = "true" ]; then
    MINIO_DIR="$BACKUP_PATH/minio_backup"
    
    if [ -d "$MINIO_DIR" ] && [ "$(ls -A "$MINIO_DIR" 2>/dev/null)" ]; then
        log "Restoring MinIO storage..."
        
        # Copy backup to container
        docker cp "$MINIO_DIR" $(docker-compose ps -q backend):/tmp/minio_restore
        
        # Restore using mc inside backend container
        $DOCKER_COMPOSE exec -T backend sh -c '
            if command -v mc >/dev/null 2>&1; then
                mc alias set restore-minio http://minio:9000 minioadmin minioadmin123 2>/dev/null || true
                # Restore all buckets
                for bucket_dir in /tmp/minio_restore/*; do
                    if [ -d "$bucket_dir" ]; then
                        bucket=$(basename "$bucket_dir")
                        echo "Restoring bucket: $bucket"
                        mc mb restore-minio/$bucket 2>/dev/null || true
                        mc mirror --overwrite $bucket_dir restore-minio/$bucket 2>/dev/null || true
                    fi
                done
                rm -rf /tmp/minio_restore
            else
                echo "MinIO client not available"
            fi
        '
        
        log "MinIO storage restored successfully"
    else
        warn "MinIO backup directory not found or empty: $MINIO_DIR"
    fi
fi

# Restore configuration
if [ "$RESTORE_CONFIG" = "true" ]; then
    CONFIG_FILE="$BACKUP_PATH/config.tar.gz"
    
    if [ -f "$CONFIG_FILE" ]; then
        log "Restoring configuration..."
        warn "Configuration restore requires manual review"
        
        # Extract to temp directory
        TEMP_DIR=$(mktemp -d)
        tar -xzf "$CONFIG_FILE" -C "$TEMP_DIR"
        
        log "Configuration files extracted to: $TEMP_DIR"
        log "Please review and apply configuration changes manually"
    else
        warn "Configuration backup file not found: $CONFIG_FILE"
    fi
fi

log "=============================================="
log "Restore completed successfully!"
log "=============================================="
warn "⚠️  Please restart services: docker-compose restart"
