#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_NAME="${1:-system_migration_${TIMESTAMP}}"
BACKUP_ROOT="${BACKUP_DIR:-${ROOT_DIR}/backups}"
BUNDLE_DIR="${BACKUP_ROOT}/${BACKUP_NAME}"
VOLUME_DIR="${BUNDLE_DIR}/docker-volumes"
META_DIR="${BUNDLE_DIR}/metadata"
WORKSPACE_ARCHIVE="${BUNDLE_DIR}/workspace-snapshot.tar.gz"
ARCHIVE_PATH="${BACKUP_ROOT}/${BACKUP_NAME}.tar.gz"
CHECKSUM_PATH="${ARCHIVE_PATH}.sha256"
INCLUDE_WORKSPACE="${INCLUDE_WORKSPACE:-true}"
INCLUDE_VOLUMES="${INCLUDE_VOLUMES:-true}"
INCLUDE_CACHE_VOLUMES="${INCLUDE_CACHE_VOLUMES:-true}"
VOLUME_HELPER_IMAGE="${VOLUME_HELPER_IMAGE:-postgres:17-alpine}"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
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

require_command() {
    if ! command -v "$1" >/dev/null 2>&1; then
        error "Required command not found: $1"
        exit 1
    fi
}

sha256_file() {
    local file_path="$1"

    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum "$file_path" > "$CHECKSUM_PATH"
        return
    fi

    if command -v shasum >/dev/null 2>&1; then
        shasum -a 256 "$file_path" > "$CHECKSUM_PATH"
        return
    fi

    warn "No SHA-256 utility found; checksum file was not created"
}

is_cache_volume() {
    case "$1" in
        *whisper_cache|*qwen3_asr_cache)
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

collect_env_files() {
    find "$ROOT_DIR" -maxdepth 2 \
        \( -name '.env' -o -name '.env.local' -o -name '.env.production' -o -name '.env.staging' \) \
        -print | sort
}

export_workspace_snapshot() {
    log "Creating workspace snapshot..."

    (
        cd "$ROOT_DIR"
        tar -czf "$WORKSPACE_ARCHIVE" \
            --exclude-vcs \
            --exclude='./backups' \
            --exclude='./backend/backups' \
            --exclude='./backend/coverage' \
            --exclude='./frontend/playwright-report' \
            --exclude='./frontend/test-results' \
            --exclude='./node_modules' \
            --exclude='./backend/node_modules' \
            --exclude='./frontend/node_modules' \
            --exclude='*/.git' \
            --exclude='*/node_modules' \
            --exclude='*/dist' \
            --exclude='*/build' \
            --exclude='*/coverage' \
            --exclude='*/playwright-report' \
            --exclude='*/test-results' \
            .
    )

    cp "$ROOT_DIR/scripts/restore-migration-bundle.sh" "$BUNDLE_DIR/restore-migration-bundle.sh"
    chmod +x "$BUNDLE_DIR/restore-migration-bundle.sh"
}

discover_volumes() {
    docker volume ls --format '{{.Name}}' | grep '^opentyme_' || true
}

export_volume() {
    local volume_name="$1"
    local archive_name="${volume_name}.tar.gz"

    log "Exporting Docker volume: ${volume_name}"
    docker run --rm \
        -v "${volume_name}:/source:ro" \
        -v "${VOLUME_DIR}:/backup" \
    "${VOLUME_HELPER_IMAGE}" \
        sh -c "set -e; cd /source; tar -czf /backup/${archive_name} ."
}

write_metadata() {
    local env_list_file="${META_DIR}/env-files.txt"
    local volume_list_file="${META_DIR}/docker-volumes.txt"
    local compose_state_file="${META_DIR}/docker-compose-ps.txt"
    local git_status_file="${META_DIR}/git-status.txt"
    local git_head_file="${META_DIR}/git-head.txt"

    collect_env_files | sed "s#^${ROOT_DIR}/##" > "$env_list_file"
    discover_volumes > "$volume_list_file"

    if docker compose version >/dev/null 2>&1; then
        (cd "$ROOT_DIR" && docker compose ps -a > "$compose_state_file") || true
    elif command -v docker-compose >/dev/null 2>&1; then
        (cd "$ROOT_DIR" && docker-compose ps -a > "$compose_state_file") || true
    fi

    if git -C "$ROOT_DIR" rev-parse HEAD >/dev/null 2>&1; then
        git -C "$ROOT_DIR" rev-parse HEAD > "$git_head_file"
        git -C "$ROOT_DIR" status --short > "$git_status_file"
    fi

    cat > "${META_DIR}/manifest.txt" <<EOF
Backup name: ${BACKUP_NAME}
Created at: $(date -u +%Y-%m-%dT%H:%M:%SZ)
Project root: ${ROOT_DIR}
Archive path: ${ARCHIVE_PATH}
Workspace snapshot: $(basename "$WORKSPACE_ARCHIVE")
Included Docker volumes:
$(sed 's/^/  - /' "$volume_list_file")

Included env files:
$(sed 's/^/  - /' "$env_list_file")
EOF
}

main() {
    require_command docker
    require_command tar
    require_command find
    require_command grep

    mkdir -p "$BUNDLE_DIR" "$VOLUME_DIR" "$META_DIR"

    log "=============================================="
    log "Creating OpenTYME migration bundle"
    log "=============================================="
    log "Bundle directory: ${BUNDLE_DIR}"
    log "Archive path: ${ARCHIVE_PATH}"
    log "Include workspace snapshot: ${INCLUDE_WORKSPACE}"
    log "Include Docker volumes: ${INCLUDE_VOLUMES}"
    log "Include cache volumes: ${INCLUDE_CACHE_VOLUMES}"
    log "Volume helper image: ${VOLUME_HELPER_IMAGE}"
    log "=============================================="

    if [ "$INCLUDE_WORKSPACE" = "true" ]; then
        export_workspace_snapshot
    fi

    if [ "$INCLUDE_VOLUMES" = "true" ]; then
        while IFS= read -r volume_name; do
            [ -n "$volume_name" ] || continue

            if is_cache_volume "$volume_name" && [ "$INCLUDE_CACHE_VOLUMES" != "true" ]; then
                warn "Skipping cache volume: ${volume_name}"
                continue
            fi

            export_volume "$volume_name"
        done < <(discover_volumes)
    fi

    write_metadata
    cp "$ROOT_DIR/docs/system-migration-backup.md" "$BUNDLE_DIR/README-RESTORE.md"

    log "Creating final archive..."
    tar -czf "$ARCHIVE_PATH" -C "$BACKUP_ROOT" "$BACKUP_NAME"
    sha256_file "$ARCHIVE_PATH"

    log "=============================================="
    log "Migration bundle completed"
    log "=============================================="
    log "Bundle directory: ${BUNDLE_DIR}"
    log "Archive: ${ARCHIVE_PATH}"
    [ -f "$CHECKSUM_PATH" ] && log "Checksum: ${CHECKSUM_PATH}"
    log "=============================================="

    printf '%s\n' "$ARCHIVE_PATH"
}

main "$@"