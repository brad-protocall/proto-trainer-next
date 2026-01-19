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

## Resume Context (2026-01-19)

### Current State: Ready for User Testing

All code review findings have been resolved. The application is ready for end-to-end testing.

### What Was Completed

1. **All PRs Merged** - #20, #21, #22, #23 merged to main
2. **All P1 Issues Fixed** (10 total)
   - WebSocket authentication (userId parameter)
   - HTTP authentication (x-user-id headers via `authFetch`)
   - Type alignment (TranscriptTurn snake_case, ApiError fields)
   - Build errors resolved
3. **All P2 Issues Fixed** (11 total)
   - Performance: Base64 encoding O(n²) → chunked processing
   - Memory: Audio handler cleanup, transcript limits (MAX_MESSAGES=200)
   - Audio: Removed mic-to-speaker feedback loop
   - Reliability: WebSocket auto-reconnect (3 attempts, 2s delay)
   - Security: UUID validation for scenarioId (prevents injection)
   - Testing: Added vitest + 11 WebSocket server tests
   - Architecture: Created reusable UI components, shared utilities
4. **Documentation Created**
   - `docs/solutions/integration-issues/auth-type-consistency-fixes.md`

### New Files Created

| File | Purpose |
|------|---------|
| `src/lib/format.ts` | Shared formatting utilities (formatDate, getStatusColor, etc.) |
| `src/lib/fetch.ts` | Authenticated fetch helper (authFetch, createAuthFetch) |
| `src/components/ui/` | Reusable UI components (StatusBadge, DetailModal, DropdownMenu) |
| `vitest.config.ts` | Test configuration |
| `ws-server/index.test.ts` | WebSocket server tests (11 tests) |

### Testing Commands

```bash
# Start the application
npm run dev              # Next.js on port 3003
npm run ws:dev           # WebSocket server on port 3004

# Run tests
npm test                 # Run all tests
npm run test:watch       # Watch mode

# Build verification
npm run build            # Production build (should pass)
```

### User Testing Checklist

1. **Supervisor Dashboard** (`http://localhost:3003/supervisor`)
   - [ ] Create a new scenario
   - [ ] Assign scenario to counselor
   - [ ] View assignments list

2. **Counselor Dashboard** (`http://localhost:3003/counselor`)
   - [ ] View assigned scenarios
   - [ ] Start chat training session
   - [ ] Complete conversation and get feedback

3. **Voice Training** (requires WebSocket server)
   - [ ] Start voice session
   - [ ] Verify audio capture works
   - [ ] Test disconnect/reconnect

### Known Limitations

- Authentication uses simple x-user-id header (no JWT)
- SQLite database (dev only, not for production)
- Voice training requires headphones to avoid feedback

### Quick Commands

```bash
npm test                       # Run 11 WebSocket tests
npm run build                  # Verify build passes
ls todos/*-complete-*.md       # View completed todos
cat docs/solutions/**/*.md     # View solution documentation
```
