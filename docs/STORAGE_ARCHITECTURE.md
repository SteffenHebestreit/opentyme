# Storage Architecture

> S3-compatible object storage (SeaweedFS) with per-user bucket isolation for GDPR compliance and data security.

## Table of Contents

- [Overview](#overview)
- [Bucket Structure](#bucket-structure)
- [Benefits](#benefits)
- [User Initialization](#user-initialization)
- [Configuration](#configuration)
- [API Usage](#api-usage)
- [Security](#security)
- [Operations](#operations)
- [Backup & Restore](#backup--restore)
- [Kubernetes Deployment](#kubernetes-deployment)
- [Troubleshooting](#troubleshooting)
- [Related Documentation](#related-documentation)

---

## Overview

OpenTYME uses **SeaweedFS** as its S3-compatible object storage backend with a **per-user bucket architecture**. Each user gets their own isolated bucket for data isolation, GDPR compliance, and simplified management.

The storage layer is implemented via `@aws-sdk/client-s3` (AWS SDK v3), making it compatible with any S3-compatible endpoint — including SeaweedFS (local/Docker), AWS S3, and SeaweedFS on Kubernetes backed by Longhorn PVCs.

**Storage service:** `backend/src/services/storage/storage.service.ts`

---

## Bucket Structure

```
SeaweedFS Buckets:
  user-{userId1}/
    receipts/           # Expense receipts
    logos/              # Company / client logos
    documents/          # General documents
    invoices/           # Generated invoice PDFs
    exports/            # Report exports

  user-{userId2}/
    receipts/
    logos/
    ...
```

### Naming Convention

- Bucket name: `user-{sanitizedUserId}`
- User ID is sanitized to be S3-compatible (lowercase, alphanumeric, hyphens only)
- Example: `user-a1b2c3d4-e5f6-7890-abcd-ef1234567890`

---

## Benefits

| Benefit | Description |
|---------|-------------|
| **Data Isolation** | Each user has their own isolated bucket — no cross-user data leaks |
| **GDPR Compliance** | Delete all user data by deleting their bucket |
| **Simple Permissions** | Bucket-level policies instead of object-level ACLs |
| **Easy Backup/Restore** | Per-user backup and restore operations via `aws s3 sync` |
| **Vendor-neutral** | AWS SDK v3 works with SeaweedFS, AWS S3, MinIO, Ceph, etc. |

---

## User Initialization

### Automatic (On Startup)

When the backend starts, it automatically:
1. Fetches all users from Keycloak
2. Creates SeaweedFS buckets for each user
3. Sets private bucket policies

```
[Startup] Found 5 users in Keycloak
[Storage] Created user bucket: user-abc-123-def
[Startup] User initialization complete: 5 succeeded, 0 failed
```

### Lazy (On First Upload)

If a bucket does not exist when a user uploads a file, it is created automatically.

### Manual (API)

```bash
# Initialize all users
curl -X POST http://localhost:8000/api/system/initialize-users \
  -H "Authorization: Bearer ADMIN_TOKEN"

# Initialize a specific user
curl -X POST http://localhost:8000/api/system/initialize-user/{userId} \
  -H "Authorization: Bearer ADMIN_TOKEN"

# Check initialization stats
curl http://localhost:8000/api/system/initialization-stats \
  -H "Authorization: Bearer TOKEN"
```

---

## Configuration

### Environment Variables

```bash
# S3-compatible storage endpoint (SeaweedFS by default in Docker)
STORAGE_ENDPOINT=seaweedfs      # hostname of the S3 endpoint
STORAGE_PORT=8333               # S3 API port
STORAGE_ACCESS_KEY=admin        # access key
STORAGE_SECRET_KEY=password     # secret key
STORAGE_USE_SSL=false           # set true for HTTPS endpoints

# Enable/disable automatic user initialization on startup
RUN_STARTUP_INITIALIZATION=true
```

> When running outside Docker, override `STORAGE_ENDPOINT=localhost`.

### Service Access (Local Docker)

| Service | URL |
|---------|-----|
| SeaweedFS S3 API | http://localhost:8333 |
| SeaweedFS Master | http://localhost:9333 |

---

## API Usage

The `storageService` exposes a clean S3-compatible API:

### Upload File

```typescript
import { storageService } from '../storage/storage.service';

await storageService.putObject(
  'user-abc123',            // bucket
  'receipts/invoice.pdf',   // key
  fileBuffer,               // Buffer
  'application/pdf',        // content type
  { 'X-User-ID': userId }  // optional metadata
);
```

### Get Presigned Download URL

```typescript
const url = await storageService.presignedGetUrl(
  'user-abc123',
  'receipts/invoice.pdf',
  3600  // expiry in seconds (default: 1 hour)
);
```

### List Objects

```typescript
const objects = await storageService.listObjects('user-abc123', 'receipts/');
```

### Delete Object

```typescript
await storageService.deleteObject('user-abc123', 'receipts/invoice.pdf');
```

### Delete Multiple Objects

```typescript
await storageService.deleteObjects('user-abc123', ['key1', 'key2']);
```

### Bucket Management

```typescript
await storageService.bucketExists('user-abc123');
await storageService.makeBucket('user-abc123');
await storageService.removeBucket('user-abc123');
```

---

## Security

- All buckets use **private access** by default
- File access requires **presigned URLs** (1-hour expiry)
- User authentication is validated before URLs are generated
- Bucket ownership is validated per request

### File Metadata

Each uploaded file includes object metadata:

| Key | Value |
|-----|-------|
| `X-User-ID` | Owner user ID |
| `X-Original-Filename` | Original filename |
| `X-Category` | File category |

---

## Operations

### List All User Buckets

```bash
AWS_ACCESS_KEY_ID=admin AWS_SECRET_ACCESS_KEY=password \
  aws s3 ls --endpoint-url http://localhost:8333
```

### List Files in a Bucket

```bash
AWS_ACCESS_KEY_ID=admin AWS_SECRET_ACCESS_KEY=password \
  aws s3 ls s3://user-{userId}/ --endpoint-url http://localhost:8333 --recursive
```

### Check Bucket Size

```bash
AWS_ACCESS_KEY_ID=admin AWS_SECRET_ACCESS_KEY=password \
  aws s3 ls s3://user-{userId}/ --endpoint-url http://localhost:8333 \
  --recursive --summarize | tail -2
```

### Delete User Bucket (GDPR erasure)

```bash
AWS_ACCESS_KEY_ID=admin AWS_SECRET_ACCESS_KEY=password \
  aws s3 rb s3://user-{userId}/ --force --endpoint-url http://localhost:8333
```

---

## Backup & Restore

The backup scripts use `aws s3 sync` to back up all user buckets.

```bash
# Full backup (DB + storage)
docker compose exec backend /usr/src/app/scripts/backup.sh

# Backup storage only
docker compose exec backend \
  env INCLUDE_DATABASE=false /usr/src/app/scripts/backup.sh my_storage_backup

# Restore
docker compose exec backend /usr/src/app/scripts/restore.sh ./backups/my_backup.tar.gz
```

Backups include:
- PostgreSQL dump (opentyme + keycloak databases)
- All SeaweedFS bucket contents (via `aws s3 sync`)
- `manifest.json` with metadata and version info

---

## Kubernetes Deployment

On Kubernetes, SeaweedFS is deployed as a StatefulSet backed by Longhorn PVCs:

```
k8s/storage/
  longhorn-pvc.yaml     # PersistentVolumeClaims (master, volume, filer)
  seaweedfs.yaml        # StatefulSets + Services + ConfigMap + Secret
```

The four SeaweedFS components on K8s:

| Component | Role |
|-----------|------|
| `seaweedfs-master` | Cluster metadata / volume allocation |
| `seaweedfs-volume` | Actual file data (backed by Longhorn PVC) |
| `seaweedfs-filer` | Metadata store for the S3 gateway |
| `seaweedfs-s3` | S3-compatible API gateway (port 8333) |

The `STORAGE_ENDPOINT` env var points at the `seaweedfs-s3` service; no application code changes are needed between Docker Compose and Kubernetes.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Bucket creation fails | Check `STORAGE_ACCESS_KEY` / `STORAGE_SECRET_KEY` match SeaweedFS config |
| Files not found (404) | Verify the bucket exists, check presigned URL has not expired |
| Permission denied | Verify user authentication, confirm bucket ownership |
| SeaweedFS unhealthy | Check master port 9333: `curl http://localhost:9333/cluster/status` |
| Connection refused | Ensure `STORAGE_ENDPOINT` and `STORAGE_PORT` are correct for your environment |

---

## Related Documentation

- [README](../README.md) — Main project documentation
- [AI Features](./AI_FEATURES.md) — AI-powered receipt analysis and extraction
- [Depreciation Feature](./DEPRECIATION_FEATURE.md) — German tax law depreciation
