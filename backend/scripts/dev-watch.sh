#!/bin/sh

# Development watch script that restarts on crashes
# Runs node with ts-node and restarts on any exit

while true; do
  echo "[DEV-WATCH] Starting application..."
  # TS_NODE_FILES=true makes ts-node load ambient .d.ts files (e.g.
  # src/types/express.d.ts, which augments Request with .user/.kauth). Without
  # it, ts-node only checks files reachable via imports and fails to compile the
  # Keycloak middleware. Mirrors nodemon.json's env.
  TS_NODE_FILES=true node -r ts-node/register src/index.ts
  EXIT_CODE=$?
  
  echo "[DEV-WATCH] Process exited with code $EXIT_CODE"
  
  # Wait a moment before restarting
  sleep 2
  
  echo "[DEV-WATCH] Restarting..."
done
