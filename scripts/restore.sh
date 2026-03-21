#!/usr/bin/env bash

###############################################################################
# OpenTYME Restore Script (Host-side)
# Restores:
# - OpenTYME PostgreSQL database
# - Keycloak PostgreSQL database
# - S3-compatible object storage (SeaweedFS — all user buckets)
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
#   RESTORE_STORAGE     - Restore S3 storage (default: true)
#   RESTORE_CONFIG      - Restore configuration files (default: false)
#   SKIP_PRE_BACKUP     - Skip automatic pre-restore backup (default: false)
#   DRY_RUN             - Show what would be restored without changes (default: false)
###############################################################################

set -euo pipefail

# Configuration from environment
BACKUP_PATH="${BACKUP_PATH:-${1:-}}"
RESTORE_DATABASE="${RESTORE_DATABASE:-true}"
RESTORE_KEYCLOAK="${RESTORE_KEYCLOAK:-true}"
RESTORE_STORAGE="${RESTORE_STORAGE:-true}"
RESTORE_CONFIG="${RESTORE_CONFIG:-false}"
SKIP_PRE_BACKUP="${SKIP_PRE_BACKUP:-false}"
DRY_RUN="${DRY_RUN:-false}"
KEYCLOAK_DATABASE_NAME="${KEYCLOAK_DATABASE_NAME:-${KEYCLOAK_DB_NAME:-postgres}}"

if [ -n "${HOME:-}" ] && [ -d "$HOME/.local/bin" ]; then
    export PATH="$HOME/.local/bin:$PATH"
fi

# Pre-restore backup directory
PRE_RESTORE_BACKUP_DIR="./backups/pre_restore_$(date +%Y%m%d_%H%M%S)"

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

# Validate backup path
if [ -z "$BACKUP_PATH" ]; then
    error "Backup path is required"
    echo "Usage: ./restore.sh <backup_path>"
    exit 1
fi

MIGRATION_RESTORE_SCRIPT="$(dirname "$0")/restore-migration-bundle.sh"

if [ ! -d "$BACKUP_PATH" ] && [ ! -f "$BACKUP_PATH" ]; then
    error "Backup path not found: $BACKUP_PATH"
    exit 1
fi

if [ -f "$BACKUP_PATH" ]; then
    case "$(basename "$BACKUP_PATH")" in
        system_migration_*.zip|system_migration_*.tar.gz|system_migration_*.tgz)
            log "Detected migration bundle archive, delegating to $MIGRATION_RESTORE_SCRIPT"
            exec bash "$MIGRATION_RESTORE_SCRIPT" "$BACKUP_PATH"
            ;;
    esac
fi

if [ -d "$BACKUP_PATH" ] && [ -d "$BACKUP_PATH/docker-volumes" ] && [ -f "$BACKUP_PATH/README-RESTORE.md" ]; then
    log "Detected migration bundle directory, delegating to $MIGRATION_RESTORE_SCRIPT"
    exec bash "$MIGRATION_RESTORE_SCRIPT" "$BACKUP_PATH"
fi

EXTRACTED_BACKUP_DIR=""

cleanup() {
    if [ -n "$EXTRACTED_BACKUP_DIR" ] && [ -d "$EXTRACTED_BACKUP_DIR" ]; then
        rm -rf "$EXTRACTED_BACKUP_DIR"
    fi
}

trap cleanup EXIT

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null && ! command -v docker &> /dev/null; then
    error "Docker or docker-compose is required"
    exit 1
fi

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
log "Restore S3 Storage: $RESTORE_STORAGE"
log "Restore Config: $RESTORE_CONFIG"
log "=============================================="

warn "⚠️  This will overwrite existing data!"
warn "⚠️  Make sure you have a recent backup before proceeding"
echo ""

# Dry run mode
if [ "$DRY_RUN" = "true" ]; then
    warn "DRY RUN MODE - No changes will be made"
    log "Would restore from: $BACKUP_PATH"
        if [ -d "$BACKUP_PATH" ]; then
                { [ -f "$BACKUP_PATH/opentyme_database.dump" ] || \
                    [ -f "$BACKUP_PATH/tyme_database.dump" ] || \
                    [ -f "$BACKUP_PATH/database.dump" ]; } && log "  - OpenTYME database: YES"
                [ -f "$BACKUP_PATH/keycloak_database.dump" ] && log "  - Keycloak database: YES"
                { [ -d "$BACKUP_PATH/storage" ] || [ -d "$BACKUP_PATH/minio_backup" ]; } && log "  - S3 storage: YES"
        else
                log "  - Archive file: YES"
        fi
    exit 0
fi

read -p "Continue with restore? (y/N) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    log "Restore cancelled"
    exit 0
fi

if [ -f "$BACKUP_PATH" ]; then
    EXTRACTED_BACKUP_DIR="$(mktemp -d ./backups/restore_extract_XXXXXX)"
    tar -xzf "$BACKUP_PATH" -C "$EXTRACTED_BACKUP_DIR"
    BACKUP_PATH="$EXTRACTED_BACKUP_DIR"
fi

# =============================================================================
# SAFETY: Create automatic backup of current data before restore
# =============================================================================
if [ "$SKIP_PRE_BACKUP" != "true" ]; then
    log "============================================="
    log "Creating safety backup before restore..."
    log "============================================="
    mkdir -p "$PRE_RESTORE_BACKUP_DIR"

    if [ "$RESTORE_DATABASE" = "true" ]; then
        log "Backing up current OpenTYME database..."
        $DOCKER_COMPOSE exec -T db pg_dump -U postgres -d opentyme -Fc \
            > "$PRE_RESTORE_BACKUP_DIR/opentyme_database.dump" 2>/dev/null || \
            warn "Could not backup OpenTYME database (may not exist)"
    fi

    if [ "$RESTORE_KEYCLOAK" = "true" ]; then
        log "Backing up current Keycloak database..."
        $DOCKER_COMPOSE exec -T keycloak-db pg_dump -U keycloak_user -d "$KEYCLOAK_DATABASE_NAME" -Fc \
            > "$PRE_RESTORE_BACKUP_DIR/keycloak_database.dump" 2>/dev/null || \
            warn "Could not backup Keycloak database (may not exist)"
    fi

    log "Safety backup created: $PRE_RESTORE_BACKUP_DIR"
    log "If restore fails, you can recover from this backup"
    log "============================================="
else
    warn "Skipping pre-restore backup (SKIP_PRE_BACKUP=true)"
fi

# Restore OpenTYME database
if [ "$RESTORE_DATABASE" = "true" ]; then
    DB_FILE=""
    if [ -f "$BACKUP_PATH/opentyme_database.dump" ]; then
        DB_FILE="$BACKUP_PATH/opentyme_database.dump"
    elif [ -f "$BACKUP_PATH/tyme_database.dump" ]; then
        DB_FILE="$BACKUP_PATH/tyme_database.dump"
    elif [ -f "$BACKUP_PATH/database.dump" ]; then
        DB_FILE="$BACKUP_PATH/database.dump"
    elif [ -f "$BACKUP_PATH/database.sql.gz" ]; then
        DB_FILE="$BACKUP_PATH/database.sql.gz"
    fi

    if [ -n "$DB_FILE" ] && [ -f "$DB_FILE" ]; then
        log "Restoring OpenTYME database from: $DB_FILE"

        $DOCKER_COMPOSE exec -T db psql -U postgres \
            -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='opentyme' AND pid <> pg_backend_pid();" 2>/dev/null || true
        $DOCKER_COMPOSE exec -T db psql -U postgres -c "DROP DATABASE IF EXISTS opentyme;" 2>/dev/null || true
        $DOCKER_COMPOSE exec -T db psql -U postgres -c "CREATE DATABASE opentyme;"

        if [[ "$DB_FILE" == *.sql.gz ]]; then
            gunzip -c "$DB_FILE" | $DOCKER_COMPOSE exec -T db psql -U postgres -d opentyme
        else
            cat "$DB_FILE" | $DOCKER_COMPOSE exec -T db pg_restore \
                -U postgres -d opentyme -v --no-owner --no-privileges 2>&1 || true
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

        if [ "$KEYCLOAK_DATABASE_NAME" = "postgres" ]; then
            $DOCKER_COMPOSE exec -T keycloak-db psql -U keycloak_user -d postgres \
                -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public AUTHORIZATION keycloak_user; GRANT ALL ON SCHEMA public TO keycloak_user;" >/dev/null
        else
            $DOCKER_COMPOSE exec -T keycloak-db psql -U keycloak_user -d postgres \
                -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${KEYCLOAK_DATABASE_NAME}' AND pid <> pg_backend_pid();" 2>/dev/null || true
            $DOCKER_COMPOSE exec -T keycloak-db psql -U keycloak_user -d postgres \
                -c "DROP DATABASE IF EXISTS ${KEYCLOAK_DATABASE_NAME};" 2>/dev/null || true
            $DOCKER_COMPOSE exec -T keycloak-db psql -U keycloak_user -d postgres \
                -c "CREATE DATABASE ${KEYCLOAK_DATABASE_NAME} OWNER keycloak_user;"
        fi

        cat "$KC_DB_FILE" | $DOCKER_COMPOSE exec -T keycloak-db pg_restore \
            -U keycloak_user -d "$KEYCLOAK_DATABASE_NAME" -v --no-owner --no-privileges 2>&1 || true

        log "Keycloak database restored successfully"
    else
        warn "Keycloak database backup file not found: $KC_DB_FILE"
    fi
fi

# Restore S3 object storage (SeaweedFS)
if [ "$RESTORE_STORAGE" = "true" ]; then
    # Try new-format directory first, then legacy MinIO format
    STORAGE_DIR=""
    if [ -d "$BACKUP_PATH/storage" ] && [ "$(ls -A "$BACKUP_PATH/storage" 2>/dev/null)" ]; then
        STORAGE_DIR="$BACKUP_PATH/storage"
    elif [ -d "$BACKUP_PATH/minio_backup" ] && [ "$(ls -A "$BACKUP_PATH/minio_backup" 2>/dev/null)" ]; then
        STORAGE_DIR="$BACKUP_PATH/minio_backup"
    fi

    if [ -n "$STORAGE_DIR" ] && command -v aws &> /dev/null; then
        log "Restoring S3 storage from: $STORAGE_DIR"

        for bucket_dir in "$STORAGE_DIR"/*/; do
            if [ -d "$bucket_dir" ]; then
                bucket=$(basename "$bucket_dir")
                log "Restoring bucket: $bucket"

                # Create bucket if it doesn't exist
                AWS_ACCESS_KEY_ID="$STORAGE_ACCESS_KEY" \
                AWS_SECRET_ACCESS_KEY="$STORAGE_SECRET_KEY" \
                aws s3 mb "s3://$bucket" \
                    --endpoint-url "$STORAGE_ENDPOINT_URL" 2>/dev/null || true

                # Sync files into bucket
                AWS_ACCESS_KEY_ID="$STORAGE_ACCESS_KEY" \
                AWS_SECRET_ACCESS_KEY="$STORAGE_SECRET_KEY" \
                aws s3 sync "$bucket_dir" "s3://$bucket" \
                    --endpoint-url "$STORAGE_ENDPOINT_URL" \
                    --no-progress 2>/dev/null || warn "Some files in $bucket may have failed"
            fi
        done

        log "S3 storage restored successfully"
    elif [ -n "$STORAGE_DIR" ]; then
        warn "AWS CLI not found — cannot restore S3 storage automatically"
        warn "Storage backup files are at: $STORAGE_DIR"
        warn "Install awscli and re-run: https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html"
    else
        warn "S3 storage backup directory not found or empty: $BACKUP_PATH/storage"
    fi
fi

# Restore configuration
if [ "$RESTORE_CONFIG" = "true" ]; then
    CONFIG_DIR=""

    if [ -d "$BACKUP_PATH/config" ]; then
        CONFIG_DIR="$BACKUP_PATH/config"
    elif [ -f "$BACKUP_PATH/config.tar.gz" ]; then
        CONFIG_DIR="$(mktemp -d ./backups/config_restore_XXXXXX)"
        tar -xzf "$BACKUP_PATH/config.tar.gz" -C "$CONFIG_DIR"
    fi

    if [ -n "$CONFIG_DIR" ]; then
        log "Restoring configuration..."
        warn "Configuration restore requires manual review"

        log "Configuration files extracted to: $CONFIG_DIR"
        log "Please review and apply configuration changes manually"
    else
        warn "Configuration backup files not found"
    fi
fi

log "=============================================="
log "Restore completed successfully!"
log "=============================================="
warn "⚠️  Please restart services: $DOCKER_COMPOSE restart"
