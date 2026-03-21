#!/usr/bin/env bash

###############################################################################
# OpenTYME Migration Bundle Restore Script
# Restores a full system migration bundle created from Docker named volumes.
# Supports bundle directories, .tar.gz archives, and .zip archives.
###############################################################################

set -euo pipefail

INPUT_PATH="${1:-}"
RESTORE_ROOT="${RESTORE_ROOT:-$PWD/restored-opentyme}"
RESTORE_WORKSPACE="${RESTORE_WORKSPACE:-true}"
RESTORE_VOLUMES="${RESTORE_VOLUMES:-true}"
OVERWRITE_VOLUMES="${OVERWRITE_VOLUMES:-false}"
TARGET_VOLUME_PREFIX="${TARGET_VOLUME_PREFIX:-}"
VOLUME_HELPER_IMAGE="${VOLUME_HELPER_IMAGE:-postgres:17-alpine}"
KEEP_TEMP_DIR="${KEEP_TEMP_DIR:-false}"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

TEMP_DIR=""
BUNDLE_MODE=""
BUNDLE_ROOT=""

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
    RESTORE_ROOT=<path>         Target directory for the workspace snapshot
    RESTORE_WORKSPACE=true      Restore the workspace files
    RESTORE_VOLUMES=true        Restore Docker named volumes
    OVERWRITE_VOLUMES=false     Replace existing Docker volumes with the same name
    TARGET_VOLUME_PREFIX=<name> Rewrite opentyme_* volumes to <name>_*
    KEEP_TEMP_DIR=false         Keep temporary extraction directory for inspection
EOF
}

cleanup() {
    if [ -n "$TEMP_DIR" ] && [ -d "$TEMP_DIR" ] && [ "$KEEP_TEMP_DIR" != "true" ]; then
        rm -rf "$TEMP_DIR"
    fi
}

trap cleanup EXIT

require_command() {
    if ! command -v "$1" >/dev/null 2>&1; then
        error "Required command not found: $1"
        exit 1
    fi
}

find_bundle_root() {
    local extracted_root="$1"
    local candidate

    for candidate in "$extracted_root"/*; do
        if [ -d "$candidate" ] && [ -d "$candidate/docker-volumes" ]; then
            printf '%s\n' "$candidate"
            return 0
        fi
    done

    if [ -d "$extracted_root/docker-volumes" ]; then
        printf '%s\n' "$extracted_root"
        return 0
    fi

    return 1
}

find_zip_bundle_root() {
    local archive_path="$1"

    ARCHIVE_PATH="$archive_path" python3 - <<'PY'
import os
import sys
import zipfile

archive = os.environ['ARCHIVE_PATH']

with zipfile.ZipFile(archive) as zf:
    names = zf.namelist()

for name in names:
    marker = '/docker-volumes/'
    if marker in name:
        print(name.split(marker, 1)[0])
        sys.exit(0)

for name in names:
    if name.endswith('/docker-volumes/'):
        print(name[:-len('/docker-volumes/')])
        sys.exit(0)

sys.exit(1)
PY
}

zip_extract_entry() {
    local archive_path="$1"
    local entry_name="$2"
    local destination_path="$3"

    mkdir -p "$(dirname "$destination_path")"
    ARCHIVE_PATH="$archive_path" ENTRY_NAME="$entry_name" DESTINATION_PATH="$destination_path" python3 - <<'PY'
import os
import shutil
import zipfile

archive = os.environ['ARCHIVE_PATH']
entry = os.environ['ENTRY_NAME']
destination = os.environ['DESTINATION_PATH']

with zipfile.ZipFile(archive) as zf, zf.open(entry) as src, open(destination, 'wb') as dst:
    shutil.copyfileobj(src, dst)
PY
}

zip_list_volume_entries() {
    local archive_path="$1"
    local bundle_root="$2"

    ARCHIVE_PATH="$archive_path" BUNDLE_ROOT="$bundle_root" python3 - <<'PY'
import os
import zipfile

archive = os.environ['ARCHIVE_PATH']
bundle_root = os.environ['BUNDLE_ROOT'].rstrip('/')
prefix = f"{bundle_root}/docker-volumes/"

with zipfile.ZipFile(archive) as zf:
    for name in zf.namelist():
        if name.startswith(prefix) and name.endswith('.tar.gz'):
            print(name)
PY
}

prepare_bundle_source() {
    local input_path="$1"

    if [ -d "$input_path" ]; then
        BUNDLE_MODE="directory"
        BUNDLE_ROOT="$input_path"
        return
    fi

    if [ ! -f "$input_path" ]; then
        error "Bundle not found: $input_path"
        exit 1
    fi

    case "$input_path" in
        *.tar.gz|*.tgz)
            TEMP_DIR="$(mktemp -d)"
            require_command tar
            tar -xzf "$input_path" -C "$TEMP_DIR"
            BUNDLE_ROOT="$(find_bundle_root "$TEMP_DIR")"
            BUNDLE_MODE="directory"
            ;;
        *.zip)
            require_command python3
            BUNDLE_ROOT="$(find_zip_bundle_root "$input_path")"
            BUNDLE_MODE="zip"
            ;;
        *)
            error "Unsupported bundle format: $input_path"
            exit 1
            ;;
    esac

    if [ -z "$BUNDLE_ROOT" ]; then
        error "Could not locate a migration bundle root in: $input_path"
        exit 1
    fi
}

map_volume_name() {
    local source_name="$1"

    if [ -n "$TARGET_VOLUME_PREFIX" ] && [[ "$source_name" == opentyme_* ]]; then
        printf '%s\n' "${TARGET_VOLUME_PREFIX}_${source_name#opentyme_}"
        return 0
    fi

    printf '%s\n' "$source_name"
}

restore_workspace() {
    local workspace_archive

    require_command tar
    mkdir -p "$RESTORE_ROOT"

    if [ "$BUNDLE_MODE" = "zip" ]; then
        TEMP_DIR="${TEMP_DIR:-$(mktemp -d)}"
        workspace_archive="$TEMP_DIR/workspace-snapshot.tar.gz"
        zip_extract_entry "$INPUT_PATH" "$BUNDLE_ROOT/workspace-snapshot.tar.gz" "$workspace_archive"
    else
        workspace_archive="$BUNDLE_ROOT/workspace-snapshot.tar.gz"
        if [ ! -f "$workspace_archive" ]; then
            warn "Workspace snapshot not found; skipping workspace restore"
            return
        fi
    fi

    log "Restoring workspace snapshot to $RESTORE_ROOT"
    tar -xzf "$workspace_archive" -C "$RESTORE_ROOT"
}

restore_volume_archive() {
    local archive_path="$1"
    local source_volume_name
    local target_volume_name

    source_volume_name="$(basename "$archive_path" .tar.gz)"
    target_volume_name="$(map_volume_name "$source_volume_name")"

    if docker volume inspect "$target_volume_name" >/dev/null 2>&1; then
        if [ "$OVERWRITE_VOLUMES" != "true" ]; then
            warn "Docker volume already exists, skipping: $target_volume_name"
            return
        fi

        warn "Replacing existing Docker volume: $target_volume_name"
        docker volume rm -f "$target_volume_name" >/dev/null
    fi

    docker volume create "$target_volume_name" >/dev/null

    log "Restoring Docker volume: $source_volume_name -> $target_volume_name"
    docker run --rm \
        -v "$target_volume_name:/target" \
        -v "$(dirname "$archive_path"):/backup:ro" \
        "$VOLUME_HELPER_IMAGE" \
        sh -c "set -e; find /target -mindepth 1 -maxdepth 1 -exec rm -rf {} +; tar -xzf /backup/$(basename "$archive_path") -C /target"
}

restore_volumes_from_directory() {
    local volume_dir="$BUNDLE_ROOT/docker-volumes"
    local archive_path

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

restore_volumes_from_zip() {
    local restored_any=false
    local entry_name
    local archive_path

    TEMP_DIR="${TEMP_DIR:-$(mktemp -d)}"

    while IFS= read -r entry_name; do
        [ -n "$entry_name" ] || continue
        restored_any=true
        archive_path="$TEMP_DIR/$(basename "$entry_name")"
        zip_extract_entry "$INPUT_PATH" "$entry_name" "$archive_path"
        restore_volume_archive "$archive_path"
        rm -f "$archive_path"
    done <<EOF
$(zip_list_volume_entries "$INPUT_PATH" "$BUNDLE_ROOT")
EOF

    if [ "$restored_any" = false ]; then
        warn "No Docker volume archives found in $INPUT_PATH"
    fi
}

restore_volumes() {
    if [ "$BUNDLE_MODE" = "zip" ]; then
        restore_volumes_from_zip
        return
    fi

    restore_volumes_from_directory
}

main() {
    if [ -z "$INPUT_PATH" ]; then
        usage
        exit 1
    fi

    prepare_bundle_source "$INPUT_PATH"

    log "=============================================="
    log "OpenTYME Migration Bundle Restore"
    log "=============================================="
    log "Bundle: $BUNDLE_ROOT"
    log "Workspace target: ${RESTORE_ROOT}"
    log "Restore workspace: $RESTORE_WORKSPACE"
    log "Restore volumes: $RESTORE_VOLUMES"
    log "Volume helper image: ${VOLUME_HELPER_IMAGE}"
    log "Overwrite volumes: $OVERWRITE_VOLUMES"
    if [ -n "$TARGET_VOLUME_PREFIX" ]; then
        log "Target volume prefix: $TARGET_VOLUME_PREFIX"
    fi
    log "=============================================="

    if [ "$RESTORE_WORKSPACE" = "true" ]; then
        restore_workspace
    fi

    if [ "$RESTORE_VOLUMES" = "true" ]; then
        require_command docker
        restore_volumes
    fi

    if [ "$KEEP_TEMP_DIR" = "true" ] && [ -n "$TEMP_DIR" ]; then
        log "Kept temporary data at: $TEMP_DIR"
    fi

    log "Restore finished"
    log "Next step: review ${BUNDLE_ROOT}/README-RESTORE.md and start the stack from ${RESTORE_ROOT} with docker compose up -d --build"
}

main "$@"