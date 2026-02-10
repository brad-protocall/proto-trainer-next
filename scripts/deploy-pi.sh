#!/usr/bin/env bash
set -euo pipefail

# Deploy proto-trainer-next to Raspberry Pi
#
# SAFETY: .env is ALWAYS excluded. Pi has its own .env with different
# database credentials and service keys. This has caused outages twice.
#
# Usage:
#   ./scripts/deploy-pi.sh              # Dry run (preview only)
#   ./scripts/deploy-pi.sh --go         # Actually sync files
#   ./scripts/deploy-pi.sh --go --build # Sync + build on Pi
#   ./scripts/deploy-pi.sh --go --full  # Sync + build + restart service

PI_HOST="brad@pai-hub.local"
PI_DIR="~/apps/proto-trainer-next"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

DRY_RUN=true
DO_BUILD=false
DO_RESTART=false

for arg in "$@"; do
  case $arg in
    --go)      DRY_RUN=false ;;
    --build)   DO_BUILD=true ;;
    --full)    DO_BUILD=true; DO_RESTART=true ;;
    --help|-h)
      echo "Usage: ./scripts/deploy-pi.sh [--go] [--build] [--full]"
      echo ""
      echo "  (no flags)  Dry run — preview what would be synced"
      echo "  --go        Actually sync files to Pi"
      echo "  --build     After sync: npm install + prisma generate + npm run build"
      echo "  --full      After sync: build + sudo systemctl restart"
      echo ""
      echo "SAFETY: .env is ALWAYS excluded. Pi has its own credentials."
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown flag: $arg${NC}"
      echo "Run with --help for usage"
      exit 1
      ;;
  esac
done

# Files/dirs that should NEVER be synced to Pi
EXCLUDES=(
  # CRITICAL — Pi has different credentials. DO NOT REMOVE.
  ".env"
  ".env.local"
  ".env.*.local"

  # Build artifacts — Pi must build its own (different platform)
  ".next/"
  "out/"
  "dist/"

  # Dependencies — Pi needs its own platform-native modules
  "node_modules/"
  "livekit-agent/node_modules/"

  # Database — Pi uses PostgreSQL, not SQLite
  "*.db"
  "*.db-journal"
  "prisma/dev.db"
  "prisma/backups/"

  # Git — unnecessary, large
  ".git/"

  # OS / IDE junk
  ".DS_Store"
  ".idea/"
  ".vscode/"
  "*.swp"
  "*.swo"
  "Thumbs.db"

  # Test / coverage
  "coverage/"
  ".nyc_output/"

  # Local uploads — Pi has its own
  "uploads/"

  # Playwright artifacts
  ".playwright-mcp/"
  "*.png"
)

# Build rsync exclude flags
EXCLUDE_FLAGS=()
for pattern in "${EXCLUDES[@]}"; do
  EXCLUDE_FLAGS+=(--exclude="$pattern")
done

echo ""
echo -e "${GREEN}━━━ Proto-Trainer Pi Deploy ━━━${NC}"
echo ""
echo -e "  Source:  ${PROJECT_DIR}/"
echo -e "  Target:  ${PI_HOST}:${PI_DIR}/"
echo ""
echo -e "  ${YELLOW}⛔ .env EXCLUDED (always)${NC}"
echo ""

if $DRY_RUN; then
  echo -e "  ${YELLOW}DRY RUN — previewing changes (add --go to sync)${NC}"
  echo ""
  rsync -avz --dry-run "${EXCLUDE_FLAGS[@]}" "${PROJECT_DIR}/" "${PI_HOST}:${PI_DIR}/"
  echo ""
  echo -e "${YELLOW}This was a dry run. Run with --go to actually sync.${NC}"
  exit 0
fi

# Actual sync
echo -e "  ${GREEN}Syncing files...${NC}"
echo ""
rsync -avz "${EXCLUDE_FLAGS[@]}" "${PROJECT_DIR}/" "${PI_HOST}:${PI_DIR}/"
echo ""
echo -e "${GREEN}✓ Files synced${NC}"

# Post-sync: verify .env wasn't touched
echo ""
echo -e "  ${YELLOW}Verifying Pi .env is intact...${NC}"
PI_DB_URL=$(ssh "$PI_HOST" "grep DATABASE_URL ${PI_DIR}/.env | head -1")
if echo "$PI_DB_URL" | grep -q "Protocall"; then
  echo -e "  ${GREEN}✓ Pi .env has correct database credentials${NC}"
else
  echo -e "  ${RED}⚠ WARNING: Pi DATABASE_URL may be wrong! Check ${PI_DIR}/.env${NC}"
fi

# Build on Pi
if $DO_BUILD; then
  echo ""
  echo -e "  ${GREEN}Building on Pi...${NC}"
  ssh "$PI_HOST" "cd ${PI_DIR} && npm install && npx prisma generate && npm run build"
  echo -e "  ${GREEN}✓ Build complete${NC}"
fi

# Restart service
if $DO_RESTART; then
  echo ""
  echo -e "  ${YELLOW}Restarting service (requires sudo — you may need to enter password)...${NC}"
  ssh -t "$PI_HOST" "sudo systemctl restart proto-trainer-next"
  echo -e "  ${GREEN}✓ Service restarted${NC}"
fi

echo ""
echo -e "${GREEN}━━━ Deploy complete ━━━${NC}"
if ! $DO_BUILD; then
  echo ""
  echo "Next steps on Pi:"
  echo "  ssh ${PI_HOST}"
  echo "  cd ${PI_DIR}"
  echo "  npm install && npx prisma generate && npm run build"
  echo "  sudo systemctl restart proto-trainer-next"
fi
echo ""
