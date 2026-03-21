#!/usr/bin/env bash
set -euo pipefail

INPUT_PATH="${1:-}"
RESTORE_ROOT="${RESTORE_ROOT:-$PWD/restored-opentyme}"
RESTORE_WORKSPACE="${RESTORE_WORKSPACE:-true}"
RESTORE_VOLUMES="${RESTORE_VOLUMES:-true}"
OVERWRITE_VOLUMES="${OVERWRITE_VOLUMES:-false}"
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

usage() {
    cat <<EOF
Usage: $(basename "$0") <bundle-archive-or-directory>

Environment variables:
  RESTORE_ROOT=<path>       Target directory for the workspace snapshot
  RESTORE_WORKSPACE=true    Restore the workspace files
  RESTORE_VOLUMES=true      Restore Docker named volumes
  OVERWRITE_VOLUMES=false   Replace existing Docker volumes with the same name
EOF
}

require_command() {
    if ! command -v "$1" >/dev/null 2>&1; then
        error "Required command not found: $1"
        exit 1
    fi
}

prepare_bundle_dir() {
    local input_path="$1"

    if [ -d "$input_path" ]; then
        printf '%s\n' "$input_path"
        return
    fi

    if [ ! -f "$input_path" ]; then
        error "Bundle not found: $input_path"
        exit 1
    fi

    local temp_dir
    temp_dir="$(mktemp -d)"
    tar -xzf "$input_path" -C "$temp_dir"

    find "$temp_dir" -mindepth 1 -maxdepth 1 -type d | head -n 1
}

restore_workspace() {
    local bundle_dir="$1"
    local workspace_archive="${bundle_dir}/workspace-snapshot.tar.gz"

    if [ ! -f "$workspace_archive" ]; then
        warn "Workspace snapshot not found; skipping workspace restore"
        return
    fi

    mkdir -p "$RESTORE_ROOT"
    log "Restoring workspace snapshot to ${RESTORE_ROOT}"
    tar -xzf "$workspace_archive" -C "$RESTORE_ROOT"
}

restore_volume_archive() {
    local archive_path="$1"
    local volume_name
    volume_name="$(basename "$archive_path" .tar.gz)"

    if docker volume inspect "$volume_name" >/dev/null 2>&1; then
        if [ "$OVERWRITE_VOLUMES" != "true" ]; then
            warn "Docker volume already exists, skipping: ${volume_name}"
            return
        fi

        warn "Replacing existing Docker volume: ${volume_name}"
        docker volume rm -f "$volume_name" >/dev/null
    fi

    docker volume create "$volume_name" >/dev/null

    log "Restoring Docker volume: ${volume_name}"
    docker run --rm \
        -v "${volume_name}:/target" \
        -v "$(dirname "$archive_path"):/backup:ro" \
        "${VOLUME_HELPER_IMAGE}" \
        sh -c "set -e; find /target -mindepth 1 -maxdepth 1 -exec rm -rf {} +; tar -xzf /backup/$(basename "$archive_path") -C /target"
}

restore_volumes() {
    local bundle_dir="$1"
    local volume_dir="${bundle_dir}/docker-volumes"

    if [ ! -d "$volume_dir" ]; then
        warn "Docker volume archive directory not found; skipping volume restore"
        return
    fi

    shopt -s nullglob
    for archive_path in "$volume_dir"/*.tar.gz; do
        restore_volume_archive "$archive_path"
    done
    shopt -u nullglob
}

main() {
    if [ -z "$INPUT_PATH" ]; then
        usage
        exit 1
    fi

    require_command tar

    local bundle_dir
    bundle_dir="$(prepare_bundle_dir "$INPUT_PATH")"

    log "=============================================="
    log "Restoring OpenTYME migration bundle"
    log "=============================================="
    log "Bundle: ${bundle_dir}"
    log "Workspace target: ${RESTORE_ROOT}"
    log "Restore workspace: ${RESTORE_WORKSPACE}"
    log "Restore volumes: ${RESTORE_VOLUMES}"
    log "Volume helper image: ${VOLUME_HELPER_IMAGE}"
    log "=============================================="

    if [ "$RESTORE_WORKSPACE" = "true" ]; then
        restore_workspace "$bundle_dir"
    fi

    if [ "$RESTORE_VOLUMES" = "true" ]; then
        require_command docker
        restore_volumes "$bundle_dir"
    fi

    log "Restore finished"
    log "Next step: review ${bundle_dir}/README-RESTORE.md and start the stack from ${RESTORE_ROOT} with docker compose up -d --build"
}

main "$@"