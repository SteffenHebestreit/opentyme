#!/bin/bash

###############################################################################
# OpenTYME Storage Migration Script
# Migrates object storage from MinIO to SeaweedFS (or any S3-compatible target)
#
# Usage:
#   ./scripts/migrate-storage.sh [OPTIONS]
#
# Options:
#   --delete-source   Delete source buckets after successful migration
#   --dry-run         Show what would be migrated without making changes
#   --verify-only     Only verify object counts (no migration)
#
# Required environment variables (source — MinIO):
#   SOURCE_ENDPOINT       MinIO endpoint (default: http://localhost:9000)
#   SOURCE_ACCESS_KEY     MinIO access key (default: minioadmin)
#   SOURCE_SECRET_KEY     MinIO secret key (default: minioadmin123)
#
# Required environment variables (target — SeaweedFS):
#   TARGET_ENDPOINT       SeaweedFS S3 endpoint (default: http://localhost:8333)
#   TARGET_ACCESS_KEY     SeaweedFS access key (default: admin)
#   TARGET_SECRET_KEY     SeaweedFS secret key (default: password)
#
# Database verification (optional):
#   DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
#   — when set, prints SQL verification queries after migration
###############################################################################

set -e

# Source (MinIO)
SOURCE_ENDPOINT="${SOURCE_ENDPOINT:-http://localhost:9000}"
SOURCE_ACCESS_KEY="${SOURCE_ACCESS_KEY:-minioadmin}"
SOURCE_SECRET_KEY="${SOURCE_SECRET_KEY:-minioadmin123}"

# Target (SeaweedFS)
TARGET_ENDPOINT="${TARGET_ENDPOINT:-http://localhost:8333}"
TARGET_ACCESS_KEY="${TARGET_ACCESS_KEY:-${STORAGE_ACCESS_KEY:-admin}}"
TARGET_SECRET_KEY="${TARGET_SECRET_KEY:-${STORAGE_SECRET_KEY:-password}}"

# Database (optional)
DB_HOST="${DB_HOST:-}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${DB_PASSWORD:-}"
DB_NAME="${DB_NAME:-opentyme}"

# Flags
DELETE_SOURCE=false
DRY_RUN=false
VERIFY_ONLY=false

for arg in "$@"; do
    case $arg in
        --delete-source) DELETE_SOURCE=true ;;
        --dry-run)       DRY_RUN=true ;;
        --verify-only)   VERIFY_ONLY=true ;;
    esac
done

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()    { echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"; }
warn()   { echo -e "${YELLOW}[WARN]${NC} $1"; }
error()  { echo -e "${RED}[ERROR]${NC} $1" >&2; }
header() { echo -e "${CYAN}$1${NC}"; }

# Wrapper: run aws s3 command against source
src_aws() {
    AWS_ACCESS_KEY_ID="$SOURCE_ACCESS_KEY" \
    AWS_SECRET_ACCESS_KEY="$SOURCE_SECRET_KEY" \
    aws "$@" --endpoint-url "$SOURCE_ENDPOINT"
}

# Wrapper: run aws s3 command against target
tgt_aws() {
    AWS_ACCESS_KEY_ID="$TARGET_ACCESS_KEY" \
    AWS_SECRET_ACCESS_KEY="$TARGET_SECRET_KEY" \
    aws "$@" --endpoint-url "$TARGET_ENDPOINT"
}

# =============================================================================
# Prerequisites
# =============================================================================
header "=============================================="
header " OpenTYME Storage Migration"
header " MinIO → SeaweedFS (S3-compatible)"
header "=============================================="
echo ""
log "Source : $SOURCE_ENDPOINT"
log "Target : $TARGET_ENDPOINT"
[ "$DRY_RUN"       = "true" ] && warn "DRY RUN — no changes will be made"
[ "$DELETE_SOURCE" = "true" ] && warn "DELETE SOURCE enabled — source buckets will be removed after migration"
echo ""

if ! command -v aws &> /dev/null; then
    error "AWS CLI is required. Install: https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html"
    exit 1
fi

# =============================================================================
# Step 1: Verify connectivity
# =============================================================================
log "Step 1/5: Verifying connectivity..."

if ! src_aws s3 ls 2>/dev/null | head -1 > /dev/null; then
    error "Cannot connect to source MinIO at $SOURCE_ENDPOINT"
    error "Check SOURCE_ACCESS_KEY / SOURCE_SECRET_KEY and make sure MinIO is running"
    exit 1
fi
log "  ✓ Source MinIO reachable"

if ! tgt_aws s3 ls 2>/dev/null | head -1 > /dev/null; then
    error "Cannot connect to target SeaweedFS at $TARGET_ENDPOINT"
    error "Check TARGET_ACCESS_KEY / TARGET_SECRET_KEY and make sure SeaweedFS is running"
    exit 1
fi
log "  ✓ Target SeaweedFS reachable"

# =============================================================================
# Step 2: List source buckets
# =============================================================================
log "Step 2/5: Listing source buckets..."
BUCKETS=$(src_aws s3 ls 2>/dev/null | awk '{print $3}') || true

if [ -z "$BUCKETS" ]; then
    warn "No buckets found in source. Nothing to migrate."
    exit 0
fi

BUCKET_COUNT=$(echo "$BUCKETS" | wc -l | tr -d ' ')
log "  Found $BUCKET_COUNT bucket(s): $BUCKETS"

# =============================================================================
# Step 3: Migrate buckets
# =============================================================================
if [ "$VERIFY_ONLY" != "true" ]; then
    log "Step 3/5: Migrating buckets..."

    TOTAL_OBJECTS=0
    TOTAL_BYTES=0

    for bucket in $BUCKETS; do
        echo ""
        log "  Processing bucket: $bucket"

        if [ "$DRY_RUN" = "true" ]; then
            SRC_COUNT=$(src_aws s3 ls "s3://$bucket" --recursive 2>/dev/null | wc -l | tr -d ' ')
            log "  [DRY RUN] Would migrate $SRC_COUNT objects from s3://$bucket"
            continue
        fi

        # Create bucket on target if it doesn't exist
        if ! tgt_aws s3 ls "s3://$bucket" > /dev/null 2>&1; then
            tgt_aws s3 mb "s3://$bucket" 2>/dev/null || true
            log "    Created bucket on target: $bucket"
        fi

        # Sync objects: source → target
        # Uses aws s3 sync which only copies changed/missing objects
        BEFORE=$(tgt_aws s3 ls "s3://$bucket" --recursive 2>/dev/null | wc -l | tr -d ' ')

        AWS_ACCESS_KEY_ID="$SOURCE_ACCESS_KEY" \
        AWS_SECRET_ACCESS_KEY="$SOURCE_SECRET_KEY" \
        aws s3 sync "s3://$bucket" /tmp/migration_scratch_$bucket \
            --endpoint-url "$SOURCE_ENDPOINT" \
            --no-progress --quiet 2>/dev/null

        AWS_ACCESS_KEY_ID="$TARGET_ACCESS_KEY" \
        AWS_SECRET_ACCESS_KEY="$TARGET_SECRET_KEY" \
        aws s3 sync /tmp/migration_scratch_$bucket "s3://$bucket" \
            --endpoint-url "$TARGET_ENDPOINT" \
            --no-progress --quiet 2>/dev/null

        rm -rf /tmp/migration_scratch_$bucket

        AFTER=$(tgt_aws s3 ls "s3://$bucket" --recursive 2>/dev/null | wc -l | tr -d ' ')
        SRC=$(src_aws s3 ls "s3://$bucket" --recursive 2>/dev/null | wc -l | tr -d ' ')

        log "    Objects: source=$SRC  target(before)=$BEFORE  target(after)=$AFTER"

        if [ "$SRC" != "$AFTER" ]; then
            warn "    Object count mismatch! source=$SRC  target=$AFTER"
        else
            log "    ✓ Bucket $bucket migrated successfully ($SRC objects)"
        fi

        TOTAL_OBJECTS=$((TOTAL_OBJECTS + SRC))
    done

    echo ""
    log "Migration summary: $TOTAL_OBJECTS total objects across $BUCKET_COUNT buckets"
fi

# =============================================================================
# Step 4: Verification
# =============================================================================
log "Step 4/5: Verifying object counts..."
echo ""

MISMATCH=false
for bucket in $BUCKETS; do
    SRC=$(src_aws s3 ls "s3://$bucket" --recursive 2>/dev/null | wc -l | tr -d ' ')
    TGT=$(tgt_aws s3 ls "s3://$bucket" --recursive 2>/dev/null | wc -l | tr -d ' ')

    if [ "$SRC" = "$TGT" ]; then
        log "  ✓ $bucket: source=$SRC  target=$TGT  [MATCH]"
    else
        warn "  ✗ $bucket: source=$SRC  target=$TGT  [MISMATCH]"
        MISMATCH=true
    fi
done

if [ "$MISMATCH" = "true" ]; then
    warn ""
    warn "Some buckets have mismatched object counts."
    warn "Re-run the migration to retry failed objects."
    [ "$DELETE_SOURCE" = "true" ] && warn "Skipping source deletion due to mismatch."
    DELETE_SOURCE=false
fi

# =============================================================================
# Step 5: Database path verification
# =============================================================================
log "Step 5/5: Database storage path verification..."
echo ""
echo "  The following SQL query verifies that existing DB paths are intact."
echo "  Run against your PostgreSQL database after migration:"
echo ""
echo "  ┌─ Verify storage paths in DB ──────────────────────────────────┐"
echo "  │"
echo "  │  SELECT COUNT(*) AS total,   COUNT(receipt_url) AS with_path  │"
echo "  │  FROM expenses                                                 │"
echo "  │  WHERE receipt_url IS NOT NULL;                               │"
echo "  │                                                                │"
echo "  │  -- Sample paths (format should be /user-{id}/cat/file):      │"
echo "  │  SELECT id, receipt_url FROM expenses                         │"
echo "  │  WHERE receipt_url IS NOT NULL LIMIT 10;                      │"
echo "  │                                                                │"
echo "  │  -- If bucket naming changed, update paths with:              │"
echo "  │  -- UPDATE expenses                                           │"
echo "  │  -- SET receipt_url = replace(receipt_url,                    │"
echo "  │  --     '/old-prefix/', '/new-prefix/')                        │"
echo "  │  -- WHERE receipt_url LIKE '/old-prefix/%';                   │"
echo "  │"
echo "  └────────────────────────────────────────────────────────────────┘"
echo ""

# Run SQL verification automatically if DB credentials are provided
if [ -n "$DB_HOST" ] && [ -n "$DB_PASSWORD" ]; then
    log "  Running DB verification..."
    PGPASSWORD="$DB_PASSWORD" psql \
        -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        -c "SELECT COUNT(*) AS total_expenses, COUNT(receipt_url) AS with_receipt_path FROM expenses;" \
        2>/dev/null || warn "Could not connect to database for verification"
fi

# =============================================================================
# Step 6 (optional): Delete source buckets
# =============================================================================
if [ "$DELETE_SOURCE" = "true" ] && [ "$DRY_RUN" != "true" ] && [ "$MISMATCH" != "true" ]; then
    echo ""
    warn "Deleting source MinIO buckets..."

    for bucket in $BUCKETS; do
        log "  Deleting source bucket: $bucket"
        src_aws s3 rm "s3://$bucket" --recursive 2>/dev/null || true
        src_aws s3 rb "s3://$bucket" 2>/dev/null || true
        log "  ✓ Deleted: $bucket"
    done

    log "Source cleanup complete."
fi

# =============================================================================
# Done
# =============================================================================
echo ""
header "=============================================="
if [ "$DRY_RUN" = "true" ]; then
    header " DRY RUN COMPLETE — no changes were made"
elif [ "$VERIFY_ONLY" = "true" ]; then
    header " VERIFICATION COMPLETE"
else
    header " MIGRATION COMPLETE"
fi
header "=============================================="
echo ""
log "Next steps:"
log "  1. Update docker-compose.yml — MinIO service is already replaced with SeaweedFS"
log "  2. Update .env — rename MINIO_* vars to STORAGE_* (see .env.example)"
log "  3. Restart services: docker compose down && docker compose up -d"
log "  4. Verify receipts load in the UI"
