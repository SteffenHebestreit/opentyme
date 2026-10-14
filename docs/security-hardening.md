# Security hardening — secrets

The defaults shipped in `.env.example` (and likely still in a dev `.env`) are weak and
**must be rotated for any real deployment**:

| Secret | Default | Used by |
|---|---|---|
| `POSTGRES_PASSWORD` | `password` | app DB (Postgres) |
| `KEYCLOAK_ADMIN_PASSWORD` | `admin` | Keycloak admin |
| `JWT_SECRET` | `your-jwt-secret-here` | not read by the backend any more (legacy login removed) |
| `BACKEND_SECRET_KEY` | `your-super-secret-key-here` | not read by the backend (no server-side sessions) |
| `STORAGE_ACCESS_KEY` / `STORAGE_SECRET_KEY` | `admin` / `password` | SeaweedFS S3 |

Generate strong values:

```bash
openssl rand -base64 48
```

## Important: rotating on an already-running stack

Changing a value in `.env` is **not** enough for services that persist credentials on
first initialisation. In particular, **Postgres only applies `POSTGRES_PASSWORD` when the
data directory is first created** — editing the env var on an existing volume does nothing
(and can lock the app out if other consumers start using the new value). Rotate explicitly.

### App secrets
`JWT_SECRET`, `BACKEND_SECRET_KEY` — no longer read by the backend: sign-in is Keycloak
only and the backend keeps no server-side sessions. Set strong values anyway in case a
future version uses them again.

### API tokens
Personal access tokens (`oty_pat_…`) are stored only as SHA-256 hashes, so a database
dump can't be used to call the API. If one leaks: revoke it (Configuration → API tokens),
or regenerate it to keep its permissions under a new secret — the old one stops working
on its next request. Recent activity on that page shows each token's first use and every
new address it was used from. See [API_TOKENS.md](API_TOKENS.md).

### Postgres password (app DB and Keycloak DB)
1. Change the password **inside** the running cluster first:
   ```bash
   docker exec -it opentyme-db psql -U postgres -c "ALTER USER postgres WITH PASSWORD '<new>';"
   ```
2. Update `POSTGRES_PASSWORD` in `.env` to the same value.
3. `docker compose up -d backend db` (recreate so the app picks up the new value).
4. Repeat for the Keycloak DB (`opentyme-keycloak-db`, user `keycloak_user`) and update its env.
5. Verify the app + Keycloak reconnect (check logs); take a fresh backup first (see below).

### Keycloak admin password
Rotate via the Keycloak admin console (Users → admin → Credentials) or `kcadm`, then update
`KEYCLOAK_ADMIN_PASSWORD` in `.env` for consistency.

### SeaweedFS / S3 keys
Update `config/seaweedfs/s3.json` **and** `STORAGE_ACCESS_KEY` / `STORAGE_SECRET_KEY` in `.env`
together, then `docker compose up -d seaweedfs backend`. Existing stored objects are unaffected.

## Before rotating anything
Take a fresh backup/dump (the project's backup flow, or a manual `pg_dumpall`) so a
mis-step is recoverable. Consider moving secrets out of `.env` into Docker secrets or a
vault for production.
