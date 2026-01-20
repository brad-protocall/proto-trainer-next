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

## Resume Context (2026-01-20)

### Current State: Ready for User Testing

All feature parity work is complete. The app is ready for user testing.

### Feature Parity Status (Complete)

| Issue | Phase | Description | Status | PR |
|-------|-------|-------------|--------|-----|
| #25 | 1 | Schema Migration & Type Cleanup | ✅ Merged | #31 |
| #26 | 2 | Free Practice Mode | ✅ Merged | (in #31) |
| #27 | 3 | Voice Training UI | ✅ Merged | #32 |
| #28 | 4 | Recording System | ✅ Merged | #33 |
| #29 | 5 | Bulk Import & Context Upload | ✅ Merged | #34 |
| #30 | 6 | Vector Store & One-Time Scenarios | ✅ Merged | #35 |

### Post-Merge Fixes Applied

- `1811eb4` - Fixed voice session ID mismatch and free practice persistence

---

## User Testing Checklist

### Prerequisites

1. **Environment Setup**
   ```bash
   # Ensure .env has required keys
   cp .env.example .env
   # Edit .env and add your OPENAI_API_KEY
   ```

2. **Required Environment Variables**
   ```env
   OPENAI_API_KEY=sk-...          # REQUIRED - for AI features
   DATABASE_URL="file:./dev.db"   # Default SQLite
   NEXT_PUBLIC_WS_URL=ws://localhost:3004  # WebSocket URL
   ```

3. **Start Both Servers**
   ```bash
   # Terminal 1 - Next.js app
   npm run dev

   # Terminal 2 - WebSocket server (for voice)
   npm run ws:dev
   ```

4. **Open Browser**
   ```
   http://localhost:3003
   ```

### Test Data Available

| Type | ID | Name |
|------|-----|------|
| Supervisor | `00000000-0000-0000-0000-000000000001` | Test Supervisor |
| Counselor | `32d86730-7a31-4a30-9b53-e6c238706bf6` | Test Counselor |
| Scenarios | 4 available | Various training scenarios |

### Test Flows

#### Counselor Flow
- [ ] Select "Counselor" on home page
- [ ] View Free Practice section
- [ ] Click "Practice by Voice" → microphone prompt → speak with AI
- [ ] Click "Practice by Text" → chat with AI
- [ ] View assigned training (if assignments exist)
- [ ] Complete training and click "Get Feedback"
- [ ] Review AI evaluation

#### Supervisor Flow
- [ ] Select "Supervisor" on home page
- [ ] View Scenarios tab
- [ ] Toggle Global / One-Time filter
- [ ] Click "Import Scenarios" → test bulk import
- [ ] Create a new scenario
- [ ] View Assignments tab
- [ ] Create assignment for counselor
- [ ] View recordings (if any exist)

#### Voice Training Specific
- [ ] Browser prompts for microphone access
- [ ] Connection status shows "Connected"
- [ ] Speaking shows transcript in real-time
- [ ] AI responds with voice
- [ ] "Get Feedback" generates evaluation
- [ ] Session is saved to database

### Known Limitations (Prototype)

1. **No real authentication** - Uses role selector, not login
2. **Microphone required** - Voice training needs browser mic access
3. **OpenAI API costs** - Each session uses API credits
4. **Missing logos** - Some image 404s (cosmetic only)

### Troubleshooting

| Issue | Solution |
|-------|----------|
| Voice training blank page | Check WebSocket server is running on :3004 |
| "Session not found" on evaluation | Verify OPENAI_API_KEY is set |
| 401 Unauthorized errors | Expected - prototype uses simplified auth |
| No scenarios showing | Run `npx prisma db seed` to populate data |

### Quick Commands

```bash
# Reset database
npx prisma migrate reset

# View database
npx prisma studio

# Check server logs
# (logs appear in terminal where servers are running)
```

### Key Files

| File | Purpose |
|------|---------|
| `plans/proto-training-guide-feature-parity.md` | Implementation plan |
| `docs/FEATURE-SPECIFICATIONS.md` | Original feature spec |
| `ws-server/realtime-session.ts` | Voice session handling |
| `src/app/training/voice/` | Voice training UI |
