#!/bin/sh

# Development watch script that restarts on crashes
# Runs node with ts-node and restarts on any exit

while true; do
  echo "[DEV-WATCH] Starting application..."
  node -r ts-node/register src/index.ts
  EXIT_CODE=$?
  
  echo "[DEV-WATCH] Process exited with code $EXIT_CODE"
  
  # Wait a moment before restarting
  sleep 2
  
  echo "[DEV-WATCH] Restarting..."
done
