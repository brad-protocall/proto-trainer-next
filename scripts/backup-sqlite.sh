#!/bin/bash
set -euo pipefail

BACKUP_DIR="prisma/backups"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="$BACKUP_DIR/dev.db.backup-$TIMESTAMP"

mkdir -p "$BACKUP_DIR"
cp prisma/dev.db "$BACKUP_FILE"
echo "Database backed up to: $BACKUP_FILE"

sqlite3 prisma/dev.db "
SELECT 'scenarios' as tbl, COUNT(*) as cnt FROM scenarios
UNION ALL SELECT 'users', COUNT(*) FROM users
UNION ALL SELECT 'accounts', COUNT(*) FROM accounts
UNION ALL SELECT 'assignments', COUNT(*) FROM assignments;
"
