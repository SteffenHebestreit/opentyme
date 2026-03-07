#!/bin/bash

# OpenTYME Backend Startup Script with Addon Installation
# This script runs when the backend container starts

set -e

echo "[Startup] OpenTYME Backend Starting..."

# Check if we're in development mode with volume mount
if [ -d "/usr/src/app/src" ]; then
    echo "[Startup] Development mode detected"
    
    # Create plugins directory if it doesn't exist
    mkdir -p /usr/src/app/src/plugins
    
    # Check if we should install addons
    if [ -f "/app-root/addons.config.json" ] && [ -f "/app-root/scripts/install-addons.sh" ]; then
        echo "[Startup] Installing addons..."
        cd /app-root
        chmod +x ./scripts/install-addons.sh

        # Pass through token/override env vars so the install script can access private repos
        # and honour OPENTYME_ADDONS for addons declared outside the config file.
        GITHUB_ADDON_TOKEN="${GITHUB_ADDON_TOKEN:-}" \
        GITLAB_ADDON_TOKEN="${GITLAB_ADDON_TOKEN:-}" \
        OPENTYME_ADDONS="${OPENTYME_ADDONS:-}" \
        ./scripts/install-addons.sh backend || echo "[Startup] Addon installation finished with errors"

        # Copy installed plugins to volume-mounted directory
        if [ -d "/app-root/backend/src/plugins" ]; then
            echo "[Startup] Copying plugins to application..."
            cp -r /app-root/backend/src/plugins/* /usr/src/app/src/plugins/ 2>/dev/null || true
        fi
    else
        echo "[Startup] No addon configuration found, skipping addon installation"
    fi
fi

# Return to app directory before starting the application
cd /usr/src/app

# Start the application
echo "[Startup] Starting application with: $@"
exec "$@"
