# Proto Trainer Next

Next.js migration of Proto Training Guide - crisis counselor training with voice roleplay and AI evaluation.

## Project Status: Overnight Automation In Progress

**Last Updated:** 2026-01-18
**Status:** Issues 1-8 complete, PRs ready for review, Issues 9-12 in queue

---

## Quick Start

```bash
# Start dev server (port 3003)
npm run dev

# Start WebSocket server (port 3004) - when implemented
npm run ws:dev
```

## Architecture

Migrating from React (CRA) + FastAPI (Python) to Next.js (TypeScript) + Prisma.

| Component | Old Stack | New Stack |
|-----------|-----------|-----------|
| Frontend | React CRA | Next.js 14+ App Router |
| Backend | FastAPI | Next.js Route Handlers |
| Database | SQLAlchemy + PostgreSQL | Prisma + SQLite (dev) |
| Voice Training | Python WebSocket relay | Node.js WebSocket server |
| Chat Training | FastAPI + OpenAI | Route Handlers + OpenAI |

## Port Assignments

| Port | Service |
|------|---------|
| 3000 | Ralph-UI (monitoring) |
| 3001 | Basic PTG (existing legacy) |
| 3002 | Agent-Native PTG (existing) |
| **3003** | **proto-trainer-next (Next.js)** |
| **3004** | **proto-trainer-next WebSocket** |

---

## Overnight Automation

### Running the Automation

```bash
# Keep laptop awake
caffeinate -dims &

# Start monitoring UI
cd ../ralph-loop-ui && npm run dev

# Start overnight loop
./scripts/overnight-loop.sh
```

### Monitoring

- **Ralph-UI:** http://localhost:3000
- **Logs:** `logs/overnight-YYYY-MM-DD.log`
- **Issue logs:** `logs/overnight-YYYY-MM-DD/issue-N.log`

### GitHub Labels

| Label | Meaning |
|-------|---------|
| `auto:ready` | Queued for processing |
| `auto:in-progress` | Currently being worked on |
| `auto:completed` | PR created successfully |
| `auto:failed` | Failed after 3 retries |

### Script Fixes Applied

1. **Issue ordering:** Added `sort_by(.number)` to process issues 1→12 (not newest first)
2. **Limit increased:** Changed MAX_ISSUES from 10 to 50 to capture all issues

---

## Current Session: 2026-01-18

### Issues Created (12 total)

| # | Phase | Description | Status |
|---|-------|-------------|--------|
| 1 | 1a | Project scaffold (Next.js + Tailwind + TypeScript) | ✅ PR #13 |
| 2 | 1b | Prisma schema + SQLite setup | ✅ PR #14 |
| 3 | 1c | Type definitions + API helpers | ✅ PR #15 |
| 4 | 2a | User and Account API routes | ✅ PR #16 |
| 5 | 2b | Scenario API routes | ✅ PR #17 |
| 6 | 2c | Assignment API routes | ✅ PR #18 |
| 7 | 2d | Session API routes (chat + evaluation) | ✅ PR #19 |
| 8 | 3a | UI Components migration | ✅ PR #20 |
| 9 | 3b | useChat hook | 🔄 In queue |
| 10 | 3c | useRealtimeVoice hook | 🔄 In queue |
| 11 | 4 | WebSocket relay server | 🔄 In queue |
| 12 | 5 | Integration testing | 🔄 In queue |

### PRs Ready for Review

```bash
# Review all PRs
/workflows:review 13 14 15 16 17 18 19 20

# Or review in batches
/workflows:review 13 14 15 16  # Phase 1-2a
/workflows:review 17 18 19 20  # Phase 2b-3a
```

### Files Created

```
proto-trainer-next/
├── .claude/settings.json    # Automation permissions
├── .env                     # PORT=3003, WS_PORT=3004
├── .env.example             # Template
├── .gitignore
├── scripts/
│   └── overnight-loop.sh    # Automation script
├── src/
│   ├── app/                 # Next.js App Router
│   ├── components/          # Migrated React components
│   ├── hooks/               # useChat, useRealtimeVoice
│   ├── lib/                 # Prisma, OpenAI, API helpers
│   └── types/               # TypeScript definitions
├── prisma/
│   ├── schema.prisma        # Database schema
│   └── dev.db               # SQLite database
└── ws-server/               # WebSocket relay (Phase 4)
```

---

## Migration Plan

Full plan at: `../plans/proto-training-guide-nextjs-migration.md`

### Key Decisions

1. **SQLite for dev** - No server dependency for overnight automation
2. **Port 3003** - Avoids conflicts with other projects
3. **Flat component structure** - Matches original app complexity
4. **Query params for WebSocket auth** - Feature parity (no JWT)
5. **Discriminated union API responses** - Type-safe error handling

### What Was Simplified (YAGNI)

- No JWT tokens (query params like current app)
- No React Query/SWR (fetch like current app)
- No virtual scrolling (lists <100 items)
- No loading skeletons (simple spinners)
- No route groups (only 4 pages)
- No pagination (current loads all)

---

## References

- **GitHub Repo:** https://github.com/brad-protocall/proto-trainer-next
- **Original App:** `../Proto Training Guide/`
- **Migration Plan:** `../plans/proto-training-guide-nextjs-migration.md`
- **Ralph-UI:** `../ralph-loop-ui/`

---

## To Resume

1. Check overnight automation status:
   ```bash
   gh issue list --state open
   gh pr list --state open
   ```

2. Review completed PRs:
   ```bash
   claude
   /workflows:review <pr-numbers>
   ```

3. If automation stopped, restart:
   ```bash
   caffeinate -dims &
   ./scripts/overnight-loop.sh
   ```
