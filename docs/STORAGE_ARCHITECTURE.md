# Storage Architecture

> MinIO-based object storage with per-user bucket isolation for GDPR compliance and data security.

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
- [Troubleshooting](#troubleshooting)
- [Related Documentation](#related-documentation)

---

## Overview

The OpenTYME application uses **MinIO** (S3-compatible object storage) with a **per-user bucket architecture** for file storage. Each user gets their own isolated bucket for better data isolation, GDPR compliance, and simplified management.

## Bucket Structure

```
MinIO Buckets:
  user-{userId1}/
    ├── receipts/           # Expense receipts
    ├── logos/              # Company/client logos
    ├── documents/          # General documents
    ├── invoices/           # Generated invoice PDFs
    └── exports/            # Report exports
  
  user-{userId2}/
    ├── receipts/
    ├── logos/
    └── ...
```

### Naming Convention
- Bucket name: `user-{sanitizedUserId}`
- User ID is sanitized to be S3-compatible (lowercase, alphanumeric, hyphens)
- Example: `user-a1b2c3d4-e5f6-7890-abcd-ef1234567890`

## Benefits

| Benefit | Description |
|---------|-------------|
| **Data Isolation** | Each user has their own isolated bucket, no cross-user data leaks |
| **GDPR Compliance** | Easy to delete all user data: just delete their bucket |
| **Simple Permissions** | Bucket-level policies instead of object-level |
| **Easy Backup/Restore** | Per-user backup and restore operations |
| **Scalability** | Distribute buckets across storage nodes |

## User Initialization

### Automatic (On Startup)
When the backend starts, it automatically:
1. Fetches all users from Keycloak
2. Creates MinIO buckets for each user
3. Sets private bucket policies

```bash
# Logs show:
[Startup] Found 5 users in Keycloak
[MinIO] Created user bucket: user-abc-123-def
[Startup] User initialization complete: 5 succeeded, 0 failed
```

### Lazy (On First Upload)
If a bucket doesn't exist when a user uploads a file, it's created automatically.

### Manual (API)
```bash
# Initialize all users
curl -X POST http://localhost:8000/api/system/initialize-users \
  -H "Authorization: Bearer ADMIN_TOKEN"

# Initialize specific user
curl -X POST http://localhost:8000/api/system/initialize-user/{userId} \
  -H "Authorization: Bearer ADMIN_TOKEN"

# Check initialization stats
curl http://localhost:8000/api/system/initialization-stats \
  -H "Authorization: Bearer TOKEN"
```

## Configuration

### Environment Variables
```bash
# Enable/disable automatic initialization on startup
RUN_STARTUP_INITIALIZATION=true  # default: true

# MinIO configuration
MINIO_ENDPOINT=minio
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin123
```

## API Usage

### Upload File
```typescript
const result = await minioService.uploadFile(
  userId,
  fileBuffer,
  'receipt.pdf',
  'application/pdf',
  'receipts'  // category
);
// Returns: { url: '/user-abc123/receipts/1729320000000-receipt.pdf', ... }
```

### Get Download URL
```typescript
const downloadUrl = await minioService.getPresignedUrlFromPath(
  '/user-abc123/receipts/1729320000000-receipt.pdf'
);
```

### List User Files
```typescript
const allFiles = await minioService.listUserFiles(userId);
const receipts = await minioService.listUserFiles(userId, 'receipts');
```

### Delete User Data (GDPR)
```typescript
await minioService.deleteUserBucket(userId);
```

## Security

- All buckets have **private policies** by default
- File access requires **presigned URLs** (1 hour expiry)
- User authentication validated before generating URLs
- Bucket ownership validated: `minioService.validateUserAccess(userId, bucket)`

### File Metadata
Each file includes:
- `X-User-ID`: Owner user ID
- `X-Original-Filename`: Original file name
- `X-Category`: File category

## Operations

### List User Buckets
```bash
docker exec opentyme-minio mc ls minio/ | grep "user-"
```

### Check Bucket Size
```bash
docker exec opentyme-minio mc du minio/user-{userId}
```

### Delete User Bucket
```bash
docker exec opentyme-minio mc rb --force minio/user-{userId}
```

## Backward Compatibility

The service handles both old and new URL formats transparently:

| Format | Example |
|--------|---------|
| Old | `/receipts/{userId}/receipts/file.pdf` |
| New | `/user-{userId}/receipts/file.pdf` |

No database migrations required - both formats work automatically.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Bucket creation fails | Check MinIO permissions, ensure `s3:CreateBucket` permission |
| Files not found (404) | Verify URL format, check bucket exists, ensure presigned URL not expired |
| Permission denied | Verify user authentication, check bucket ownership |

## Backup & Restore

The backup scripts include MinIO storage:

```bash
# Backup includes all user buckets
./scripts/backup.sh my_backup

# Restore includes MinIO data
./scripts/restore.sh ./backups/my_backup
```

See `scripts/backup.sh` and `scripts/restore.sh` for details.

---

## Related Documentation

- [AI Features](./AI_FEATURES.md) - AI-powered receipt analysis and extraction
- [Depreciation Feature](./DEPRECIATION_FEATURE.md) - German tax law depreciation
- [README](../README.md) - Main project documentation
