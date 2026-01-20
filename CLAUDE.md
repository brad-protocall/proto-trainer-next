# Proto Trainer Next

Next.js migration of Proto Training Guide - crisis counselor training with voice roleplay and AI evaluation.

## Quick Start

```bash
# Install dependencies
npm install

# Setup database
npx prisma migrate deploy
npx prisma db seed

# Start dev server (port 3003)
npm run dev

# Start WebSocket server (port 3004) - for voice training
npm run ws:dev
```

## Architecture

This is a Next.js 14+ application using the App Router with TypeScript and Prisma ORM.

| Component | Stack |
|-----------|-------|
| Frontend | Next.js 14+ App Router |
| Backend | Next.js Route Handlers |
| Database | Prisma + SQLite (dev) |
| AI Chat | OpenAI Chat Completions API |
| AI Voice | OpenAI Realtime API (via WebSocket relay) |
| Styling | Tailwind CSS |

## Port Assignments

| Port | Service |
|------|---------|
| 3000 | Ralph-UI (monitoring) |
| 3001 | Basic PTG (existing legacy) |
| 3002 | Agent-Native PTG (existing) |
| **3003** | **proto-trainer-next (Next.js)** |
| **3004** | **proto-trainer-next WebSocket** |

## Environment Variables

Copy `.env.example` to `.env` and configure:

```env
# Server ports
PORT=3003
WS_PORT=3004
NEXT_PUBLIC_WS_URL=ws://localhost:3004

# Database
DATABASE_URL="file:./dev.db"

# OpenAI API
OPENAI_API_KEY=sk-...

# Models (optional, have defaults)
CHAT_MODEL=gpt-4o
EVALUATOR_MODEL=gpt-4o
REALTIME_MODEL=gpt-4o-realtime-preview
REALTIME_VOICE=shimmer
```

## Project Structure

```
proto-trainer-next/
├── prisma/
│   ├── schema.prisma    # Database schema
│   ├── seed.ts          # Seed data
│   └── dev.db           # SQLite database
├── src/
│   ├── app/
│   │   ├── api/         # API route handlers
│   │   │   ├── users/
│   │   │   ├── accounts/
│   │   │   ├── scenarios/
│   │   │   ├── assignments/
│   │   │   └── sessions/
│   │   ├── supervisor/  # Supervisor dashboard
│   │   ├── counselor/   # Counselor dashboard
│   │   └── page.tsx     # Home (role selector)
│   ├── components/      # React components
│   ├── hooks/           # Custom React hooks
│   ├── lib/             # Utilities
│   │   ├── api.ts       # API response helpers
│   │   ├── auth.ts      # Authentication helpers
│   │   ├── env.ts       # Environment validation
│   │   ├── openai.ts    # OpenAI client
│   │   ├── prisma.ts    # Prisma client singleton
│   │   └── validators.ts # Zod schemas
│   └── types/           # TypeScript definitions
└── ws-server/           # WebSocket relay for voice
```

## API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/users` | GET, POST | List users, create user |
| `/api/accounts` | GET, POST | List accounts, create account |
| `/api/scenarios` | GET, POST | List scenarios, create scenario |
| `/api/scenarios/[id]` | GET, PUT, DELETE | CRUD single scenario |
| `/api/scenarios/import` | POST | Bulk import from CSV |
| `/api/assignments` | GET, POST | List assignments, create (single/bulk) |
| `/api/assignments/[id]` | GET, PATCH, DELETE | CRUD single assignment |
| `/api/sessions` | POST | Create chat session |
| `/api/sessions/[id]` | GET | Get session with transcript |
| `/api/sessions/[id]/message` | POST | Send message, get AI response |
| `/api/sessions/[id]/evaluate` | POST | Generate evaluation |

## Database Models

- **User**: Supervisors and counselors
- **Account**: Organization accounts
- **Scenario**: Training scenarios with prompts
- **Assignment**: Scenario assigned to counselor
- **Session**: Chat training session
- **TranscriptTurn**: Conversation turns
- **Evaluation**: AI-generated evaluation
- **Recording**: Voice training recordings

## Key Decisions

1. **SQLite for dev** - No database server dependency
2. **Port 3003** - Avoids conflicts with other local projects
3. **ApiResponse<T>** - Discriminated union for type-safe API responses
4. **Query params for auth** - Feature parity with original (no JWT)
5. **Prisma ORM** - Type-safe database queries

## Commands

```bash
# Development
npm run dev          # Start Next.js on port 3003
npm run ws:dev       # Start WebSocket server on port 3004

# Build
npm run build        # Production build
npm run lint         # ESLint

# Database
npx prisma migrate dev --name <name>  # Create migration
npx prisma migrate deploy             # Apply migrations
npx prisma db seed                    # Seed data
npx prisma studio                     # GUI browser
```

## References

- Original App: `../Proto Training Guide/`
- Migration Plan: `../plans/proto-training-guide-nextjs-migration.md`

---

## Resume Context (2026-01-20 Morning)

### Current State: Feature Parity PRs Ready for Review

All 6 feature parity issues have been processed by Ralph. 4 PRs are open and ready for review/merge.

### What Happened This Session

1. **Investigated Ralph overnight crash** - Script stopped after issue #28
   - Root cause: `add_comment` function lacked error handling
   - Script uses `set -euo pipefail`, so failed comment crashed everything
   - Issues #29 and #30 were never processed

2. **Fixed the bug** - Added error handling to `scripts/overnight-loop.sh` line 119
   - Committed fix to main: `a350205`

3. **Restarted overnight loop** - Successfully processed remaining issues #29, #30

### Feature Parity Status

| Issue | Phase | Description | Status | PR |
|-------|-------|-------------|--------|-----|
| #25 | 1 | Schema Migration & Type Cleanup | ✅ Merged | #31 |
| #26 | 2 | Free Practice Mode | ✅ Merged | (in #31) |
| #27 | 3 | Voice Training UI | 🔄 Open | #32 |
| #28 | 4 | Recording System | 🔄 Open | #33 |
| #29 | 5 | Bulk Import & Context Upload | 🔄 Open | #34 |
| #30 | 6 | Vector Store & One-Time Scenarios | 🔄 Open | #35 |

### Next Steps

1. **Review open PRs** - Run `/compound-engineering:workflows:review` on PRs #32-35
2. **Merge PRs** - After review approval
3. **Integration test** - Verify all features work together
4. **User testing** - Test the full counselor and supervisor flows

### Quick Commands

```bash
# List open PRs
gh pr list --state open

# Review a specific PR
gh pr view 32

# Merge a PR
gh pr merge 32 --squash

# Run the app
npm run dev        # Next.js on port 3003
npm run ws:dev     # WebSocket on port 3004
```

### Key Files

| File | Purpose |
|------|---------|
| `plans/proto-training-guide-feature-parity.md` | Implementation plan |
| `docs/FEATURE-SPECIFICATIONS.md` | Original feature spec |
| `scripts/overnight-loop.sh` | Ralph automation (now with fix) |
| `logs/overnight-2026-01-20/` | Today's processing logs |
