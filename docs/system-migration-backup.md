# System Migration Backup

This backup flow creates a transportable bundle for moving the OpenTYME stack to another server.

What the bundle includes:

- A workspace snapshot with the current project files, including ignored runtime config such as `.env`, `backend/.env`, and `frontend/.env`
- Docker named volumes for the `opentyme_*` stack, including PostgreSQL, Keycloak PostgreSQL, Redis, SeaweedFS, and detected cache volumes
- Traefik and Let's Encrypt material if they exist inside the workspace
- Metadata with the current compose state, Git revision, and discovered env files
- A restore script copied into the bundle root

What it intentionally excludes:

- Existing backup archives in `backups/` and `backend/backups/`
- `node_modules`, build outputs, coverage output, and Playwright artifacts

Create a migration bundle:

```bash
./scripts/create-migration-bundle.sh
```

Optional environment flags:

```bash
INCLUDE_CACHE_VOLUMES=false ./scripts/create-migration-bundle.sh my_server_move
BACKUP_DIR=/path/to/output ./scripts/create-migration-bundle.sh my_server_move
```

Restore on another server:

```bash
tar -xzf system_migration_YYYYMMDD_HHMMSS.tar.gz
cd system_migration_YYYYMMDD_HHMMSS
./restore-migration-bundle.sh .
cd restored-opentyme
docker compose up -d --build
```

Notes:

- Stop the target stack before restoring Docker volumes.
- If the target already has Docker volumes with the same names, set `OVERWRITE_VOLUMES=true` when running the restore script.
- The restore script recreates the Docker volumes exactly as they were backed up. Keep the same service and image versions when bringing the stack back up.