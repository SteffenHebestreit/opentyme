#!/bin/bash

##########################################
# OpenTYME Addon Installation Script
##########################################
#
# Reads addon configuration and installs addon code into the
# backend and/or frontend plugins directories.
#
# Usage:
#   ./scripts/install-addons.sh [backend|frontend|all]
#
# ─── Configuration (highest to lowest priority) ────────────────────────────────
#
#   Environment variables:
#     OPENTYME_ADDONS_CONFIG    Path to config file (default: addons.config.json)
#
#     OPENTYME_ADDONS           Additional addons to install, comma-separated.
#                               These are MERGED with config-file addons; config
#                               entries take precedence on name collision.
#                               Format examples:
#                                 github:myorg/my-addon@main
#                                 gitlab:mygroup/my-addon@v2.1.0
#                                 local:./path/to/addon
#                               Multiple: "github:org/addon-a@main,local:./addon-b"
#
#     GITHUB_ADDON_TOKEN        OAuth/PAT token for private GitHub repos.
#                               Overrides privateRepoCredentials.github in config.
#
#     GITLAB_ADDON_TOKEN        OAuth token for private GitLab repos.
#                               Overrides privateRepoCredentials.gitlab in config.
#
#   Config file (addons.config.json, see schemas/addons-config.schema.json):
#     Standard declarative addon list with source objects.
#
# ───────────────────────────────────────────────────────────────────────────────

# Do NOT use set -e globally — we handle per-addon errors and want to continue
set -uo pipefail

# ─── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# ─── Configuration ─────────────────────────────────────────────────────────────
CONFIG_FILE="${OPENTYME_ADDONS_CONFIG:-addons.config.json}"
TEMP_DIR="/tmp/opentyme-addons"
BACKEND_PLUGINS_DIR="backend/src/plugins"
FRONTEND_PLUGINS_DIR="frontend/src/plugins"
TARGET="${1:-all}"
FAILED_ADDONS=()

# ─── Logging ───────────────────────────────────────────────────────────────────
log_info()    { echo -e "${BLUE}[INFO]${NC}    $1"; }
log_success() { echo -e "${GREEN}[OK]${NC}      $1"; }
log_warning() { echo -e "${YELLOW}[WARN]${NC}    $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC}   $1" >&2; }
log_section() { echo -e "\n${CYAN}━━━ $1 ━━━${NC}"; }

# ─── Preflight Checks ──────────────────────────────────────────────────────────
log_section "OpenTYME Addon Installer"
log_info "Config:  ${CONFIG_FILE}"
log_info "Target:  ${TARGET}"

if [ ! -f "$CONFIG_FILE" ]; then
    log_error "Configuration file not found: $CONFIG_FILE"
    log_error "Set OPENTYME_ADDONS_CONFIG to point to your config, or create $CONFIG_FILE"
    exit 1
fi

if ! command -v jq &>/dev/null; then
    log_error "jq is required but not installed."
    log_error "Install: apk add jq  |  apt-get install jq  |  brew install jq"
    exit 1
fi

if ! command -v git &>/dev/null; then
    log_warning "git not found — GitHub/GitLab sources will not work."
fi

# ─── Token Resolution ──────────────────────────────────────────────────────────
# Priority: explicit env var  >  config privateRepoCredentials.type=env  >  config type=file
resolve_token() {
    local host="$1"           # "github" or "gitlab"
    local env_override="$2"   # e.g. value of $GITHUB_ADDON_TOKEN

    if [ -n "$env_override" ]; then
        echo "$env_override"
        return
    fi

    local token_type
    token_type=$(jq -r ".privateRepoCredentials.${host}.type // empty" "$CONFIG_FILE" 2>/dev/null || true)

    case "$token_type" in
        env)
            local token_var
            token_var=$(jq -r ".privateRepoCredentials.${host}.variable // empty" "$CONFIG_FILE")
            # Bash indirect expansion: ${!var} reads the value of the variable named in $var
            echo "${!token_var:-}"
            ;;
        file)
            local token_file
            token_file=$(jq -r ".privateRepoCredentials.${host}.file // empty" "$CONFIG_FILE")
            [ -f "$token_file" ] && cat "$token_file" | tr -d '[:space:]' || true
            ;;
    esac
}

GITHUB_TOKEN=$(resolve_token "github" "${GITHUB_ADDON_TOKEN:-}")
GITLAB_TOKEN=$(resolve_token "gitlab" "${GITLAB_ADDON_TOKEN:-}")

[ -n "$GITHUB_TOKEN" ] && log_info "GitHub token: found"
[ -n "$GITLAB_TOKEN" ] && log_info "GitLab token: found"

# ─── Parse OPENTYME_ADDONS env var ─────────────────────────────────────────────
# Format: "github:owner/repo@ref,local:./path,gitlab:group/project@v1.2"
parse_env_addons() {
    local env_val="${OPENTYME_ADDONS:-}"
    [ -z "$env_val" ] && echo "[]" && return

    local json_array="[]"
    IFS=',' read -ra ENTRIES <<< "$env_val"

    for entry in "${ENTRIES[@]}"; do
        entry="$(echo "$entry" | xargs)"   # trim leading/trailing whitespace
        [ -z "$entry" ] && continue

        local src_type rest addon_json
        src_type="${entry%%:*}"
        rest="${entry#*:}"

        case "$src_type" in
            github|gitlab)
                local repo ref
                if [[ "$rest" == *@* ]]; then
                    repo="${rest%@*}"
                    ref="${rest##*@}"
                else
                    repo="$rest"
                    ref="main"
                fi
                local name; name="$(basename "$repo")"
                addon_json=$(jq -n \
                    --arg name "$name" \
                    --arg type "$src_type" \
                    --arg repo "$repo" \
                    --arg ref  "$ref"  \
                    '{"name":$name,"enabled":true,"source":{"type":$type,"repo":$repo,"ref":$ref}}')
                ;;
            local)
                local name; name="$(basename "$rest")"
                addon_json=$(jq -n \
                    --arg name "$name" \
                    --arg path "$rest" \
                    '{"name":$name,"enabled":true,"source":{"type":"local","path":$path}}')
                ;;
            *)
                log_warning "Unknown source type in OPENTYME_ADDONS: '$src_type' (entry: $entry)"
                continue
                ;;
        esac

        json_array=$(echo "$json_array" | jq ". + [$addon_json]")
    done

    echo "$json_array"
}

# ─── Build combined addon list ─────────────────────────────────────────────────
CONFIG_ADDONS=$(jq '.addons // []' "$CONFIG_FILE")
ENV_ADDONS=$(parse_env_addons)

if [ "$(echo "$ENV_ADDONS" | jq 'length')" -gt 0 ]; then
    log_info "OPENTYME_ADDONS: $(echo "$ENV_ADDONS" | jq 'length') additional addon(s) from env"
fi

# Merge: config entries first; env entries appended only if no same-named entry exists in config
ALL_ADDONS=$(jq -n \
    --argjson config "$CONFIG_ADDONS" \
    --argjson env    "$ENV_ADDONS"    \
    '$config + ($env | map(. as $e | if ($config | any(.name == $e.name)) then empty else . end))')

ADDON_COUNT=$(echo "$ALL_ADDONS" | jq 'length')
log_info "Total:   $ADDON_COUNT addon(s) to process"

# ─── Setup directories ─────────────────────────────────────────────────────────
mkdir -p "$TEMP_DIR" "$BACKEND_PLUGINS_DIR" "$FRONTEND_PLUGINS_DIR"

# ─── Process a single addon ────────────────────────────────────────────────────
process_addon() {
    local ADDON="$1"
    local ADDON_NAME ADDON_ENABLED SOURCE_TYPE SOURCE_PATH SOURCE_REPO SOURCE_VERSION

    ADDON_NAME=$(echo "$ADDON"    | jq -r '.name')
    ADDON_ENABLED=$(echo "$ADDON" | jq -r 'if .enabled == false then "false" else "true" end')
    SOURCE_TYPE=$(echo "$ADDON"   | jq -r '.source.type // "local"')
    SOURCE_PATH=$(echo "$ADDON"   | jq -r '.source.path // ""')
    SOURCE_REPO=$(echo "$ADDON"   | jq -r '.source.repo // ""')
    SOURCE_VERSION=$(echo "$ADDON"| jq -r '.source.ref // "main"')

    if [ "$ADDON_ENABLED" = "false" ]; then
        log_info "  Disabled — skipping"
        return 0
    fi

    local ADDON_TEMP_DIR="$TEMP_DIR/$ADDON_NAME"
    rm -rf "$ADDON_TEMP_DIR"

    # ── Source acquisition ──────────────────────────────────────────────────────
    case "$SOURCE_TYPE" in
        github)
            local clone_url="https://github.com/${SOURCE_REPO}.git"
            [ -n "$GITHUB_TOKEN" ] && clone_url="https://${GITHUB_TOKEN}@github.com/${SOURCE_REPO}.git"
            log_info "  Cloning github.com/${SOURCE_REPO}@${SOURCE_VERSION}"
            if ! git clone --quiet --depth 1 --branch "$SOURCE_VERSION" "$clone_url" "$ADDON_TEMP_DIR" 2>&1; then
                log_error "  Failed to clone: github.com/${SOURCE_REPO}"
                [ -z "$GITHUB_TOKEN" ] && log_warning "  No GitHub token — private repos require GITHUB_ADDON_TOKEN"
                return 1
            fi
            ;;
        gitlab)
            local clone_url="https://gitlab.com/${SOURCE_REPO}.git"
            [ -n "$GITLAB_TOKEN" ] && clone_url="https://oauth2:${GITLAB_TOKEN}@gitlab.com/${SOURCE_REPO}.git"
            log_info "  Cloning gitlab.com/${SOURCE_REPO}@${SOURCE_VERSION}"
            if ! git clone --quiet --depth 1 --branch "$SOURCE_VERSION" "$clone_url" "$ADDON_TEMP_DIR" 2>&1; then
                log_error "  Failed to clone: gitlab.com/${SOURCE_REPO}"
                [ -z "$GITLAB_TOKEN" ] && log_warning "  No GitLab token — private repos require GITLAB_ADDON_TOKEN"
                return 1
            fi
            ;;
        local)
            if [ ! -d "$SOURCE_PATH" ]; then
                log_error "  Local path not found: $SOURCE_PATH"
                return 1
            fi
            log_info "  Copying from: $SOURCE_PATH"
            cp -r "$SOURCE_PATH" "$ADDON_TEMP_DIR"
            ;;
        *)
            log_error "  Unsupported source type: $SOURCE_TYPE (expected: github, gitlab, local)"
            return 1
            ;;
    esac

    # ── Manifest validation ─────────────────────────────────────────────────────
    local MANIFEST_FILE="$ADDON_TEMP_DIR/addon-manifest.json"
    if [ ! -f "$MANIFEST_FILE" ]; then
        log_error "  addon-manifest.json not found"
        return 1
    fi

    local MF_NAME MF_VERSION MF_DISPLAY MF_COMPAT BE_TYPE FE_TYPE
    MF_NAME=$(jq -r '.name'                        "$MANIFEST_FILE")
    MF_VERSION=$(jq -r '.version // empty'          "$MANIFEST_FILE")
    MF_DISPLAY=$(jq -r '.displayName // empty'      "$MANIFEST_FILE")
    MF_COMPAT=$(jq -r '.compatibility.opentyme // empty' "$MANIFEST_FILE")
    BE_TYPE=$(jq -r 'if .backend then (.backend | type) else "absent" end' "$MANIFEST_FILE")
    FE_TYPE=$(jq -r 'if .frontend then (.frontend | type) else "absent" end' "$MANIFEST_FILE")

    [ "$MF_NAME" != "$ADDON_NAME" ] && \
        log_warning "  Name mismatch: manifest='$MF_NAME', config='$ADDON_NAME'"
    [ -z "$MF_VERSION" ] && { log_error "  Manifest missing: version";                     return 1; }
    [ -z "$MF_DISPLAY" ] && { log_error "  Manifest missing: displayName";                 return 1; }
    [ -z "$MF_COMPAT"  ] && { log_error "  Manifest missing: compatibility.opentyme";      return 1; }
    [ "$BE_TYPE" = "boolean" ] && { log_error "  'backend' must be an object, not boolean"; return 1; }
    [ "$FE_TYPE" = "boolean" ] && { log_error "  'frontend' must be an object, not boolean";return 1; }

    log_success "  Manifest valid — $ADDON_NAME v$MF_VERSION"

    # ── Copy backend files ──────────────────────────────────────────────────────
    if [[ "$TARGET" == "backend" || "$TARGET" == "all" ]]; then
        if [ -d "$ADDON_TEMP_DIR/backend" ]; then
            local BE_DEST="$BACKEND_PLUGINS_DIR/$ADDON_NAME"
            rm -rf "$BE_DEST"
            mkdir -p "$BE_DEST"
            cp -r "$ADDON_TEMP_DIR/backend/"* "$BE_DEST/"
            cp "$MANIFEST_FILE" "$BE_DEST/addon-manifest.json"
            log_success "  Backend  → $BE_DEST"
        else
            log_info "  Backend  — no backend/ directory, skipping"
        fi
    fi

    # ── Copy frontend files ─────────────────────────────────────────────────────
    if [[ "$TARGET" == "frontend" || "$TARGET" == "all" ]]; then
        if [ -d "$ADDON_TEMP_DIR/frontend" ]; then
            local FE_DEST="$FRONTEND_PLUGINS_DIR/$ADDON_NAME"
            rm -rf "$FE_DEST"
            mkdir -p "$FE_DEST"
            cp -r "$ADDON_TEMP_DIR/frontend/"* "$FE_DEST/"
            cp "$MANIFEST_FILE" "$FE_DEST/addon-manifest.json"
            log_success "  Frontend → $FE_DEST"
        else
            log_info "  Frontend — no frontend/ directory, skipping"
        fi
    fi

    return 0
}

# ─── Main loop ─────────────────────────────────────────────────────────────────
log_section "Installing Addons"

for ((i=0; i<ADDON_COUNT; i++)); do
    ADDON=$(echo "$ALL_ADDONS" | jq -c ".[$i]")
    ADDON_NAME=$(echo "$ADDON" | jq -r '.name')

    echo ""
    log_info "[$((i+1))/$ADDON_COUNT] $ADDON_NAME"

    if ! process_addon "$ADDON"; then
        log_error "  ✗ Failed: $ADDON_NAME"
        FAILED_ADDONS+=("$ADDON_NAME")
    else
        log_success "  ✓ Done: $ADDON_NAME"
    fi
done

# ─── Cleanup ───────────────────────────────────────────────────────────────────
rm -rf "$TEMP_DIR"

# ─── Summary ───────────────────────────────────────────────────────────────────
log_section "Summary"

INSTALLED_COUNT=$(( ADDON_COUNT - ${#FAILED_ADDONS[@]} ))

if [ ${#FAILED_ADDONS[@]} -gt 0 ]; then
    log_error "Installed $INSTALLED_COUNT/$ADDON_COUNT addon(s)"
    log_error "Failed:   ${FAILED_ADDONS[*]}"
    exit 1
else
    log_success "All $ADDON_COUNT addon(s) installed"
    log_info "Addons will be loaded at application startup"
fi
