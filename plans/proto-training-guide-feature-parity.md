# feat: Proto Training Guide Feature Parity Implementation

Complete implementation of missing features to achieve parity with the original Proto Training Guide application.

**Execution Mode**: Ralph overnight automation via GitHub Issues labeled `auto:ready`

---

## Overview

The proto-trainer-next migration is missing several critical features. This plan addresses all gaps while incorporating reviewer feedback to avoid over-engineering.

**Scope**: 6 phases across schema changes, endpoint modifications, WebSocket enhancements, and UI components.

---

## Issue Creation Summary

| Issue # | Phase | Title | Dependencies |
|---------|-------|-------|--------------|
| 1 | 1 | Schema Migration & Type Cleanup | None |
| 2 | 2 | Extend Session Endpoint for Free Practice | Issue 1 |
| 3 | 3 | Voice Training UI | Issue 2 |
| 4 | 4 | Recording System | Issue 3 |
| 5 | 5 | Bulk Import & Context Upload | Issue 1 |
| 6 | 6 | Vector Store & One-Time Scenarios | Issue 5 |

---

## Phase 1: Schema Migration & Type Cleanup

**Objective**: Update data model with proper constraints and consolidate type definitions.

### Tasks with Verification

#### Task 1.1: Update Prisma Schema

**Files to modify**: `prisma/schema.prisma`

```prisma
model Session {
  id           String    @id @default(uuid())
  userId       String?   @map("user_id")
  scenarioId   String?   @map("scenario_id")
  assignmentId String?   @unique @map("assignment_id")
  modelType    String    @default("chat") @map("model_type")
  status       String    @default("active")
  startedAt    DateTime  @default(now()) @map("started_at")
  endedAt      DateTime? @map("ended_at")

  user         User?       @relation(fields: [userId], references: [id])
  scenario     Scenario?   @relation(fields: [scenarioId], references: [id], onDelete: SetNull)
  assignment   Assignment? @relation(fields: [assignmentId], references: [id])
  transcript   TranscriptTurn[]
  recording    Recording?

  @@map("sessions")
}

model Recording {
  id              String   @id @default(uuid())
  sessionId       String   @unique @map("session_id")
  filePath        String   @map("file_path")
  durationSeconds Int?     @map("duration_seconds")
  fileSizeBytes   Int?     @map("file_size_bytes")
  createdAt       DateTime @default(now()) @map("created_at")

  session Session @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@map("recordings")
}

model Assignment {
  // Add to existing fields:
  requireRecording Boolean @default(false) @map("require_recording")
}

model Scenario {
  // Add relation for sessions:
  sessions Session[]
}

model User {
  // Add relation for sessions:
  sessions Session[]
}
```

**Verification**:
```bash
# 1. Validate schema syntax
npx prisma validate
# Expected: "The Prisma schema is valid"

# 2. Generate migration
npx prisma migrate dev --name add_session_flexibility

# 3. Verify migration applied
npx prisma migrate status
# Expected: "Database schema is up to date"
```

---

#### Task 1.2: Consolidate Type Definitions

**Files to modify**: `src/types/index.ts`

Remove duplicate interface definitions that mirror Zod schemas. Keep only:
- API response types
- UI-specific types
- Types not covered by validators

**Verification**:
```bash
# 1. Check for compilation errors
npx tsc --noEmit
# Expected: No errors

# 2. Run existing tests
npm test
# Expected: All tests pass
```

---

#### Task 1.3: Update Validators with Discriminated Union

**Files to modify**: `src/lib/validators.ts`

```typescript
import { z } from 'zod'

// Session creation - discriminated union for type safety
export const createSessionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('assignment'),
    assignmentId: z.string().uuid(),
  }),
  z.object({
    type: z.literal('free_practice'),
    userId: z.string().uuid(),
    scenarioId: z.string().uuid().optional(),
    modelType: z.enum(['phone', 'chat']),
  }),
])

export type CreateSessionInput = z.infer<typeof createSessionSchema>
```

**Verification**:
```bash
# 1. TypeScript compilation
npx tsc --noEmit

# 2. Test validator with sample data
node -e "
const { createSessionSchema } = require('./src/lib/validators');
const valid1 = createSessionSchema.safeParse({ type: 'assignment', assignmentId: '123e4567-e89b-12d3-a456-426614174000' });
const valid2 = createSessionSchema.safeParse({ type: 'free_practice', userId: '123e4567-e89b-12d3-a456-426614174000', modelType: 'chat' });
const invalid = createSessionSchema.safeParse({ type: 'invalid' });
console.log('Assignment valid:', valid1.success);
console.log('Free practice valid:', valid2.success);
console.log('Invalid rejected:', !invalid.success);
"
# Expected: All true
```

---

#### Task 1.4: Build Verification

**Verification**:
```bash
# 1. Full build
npm run build
# Expected: Build succeeds

# 2. Run all tests
npm test
# Expected: All tests pass

# 3. Start dev server and verify no errors
npm run dev &
sleep 5
curl -s http://localhost:3003/api/health || echo "Health check not implemented - OK"
pkill -f "next dev" || true
```

---

### Phase 1 Acceptance Criteria

- [ ] `npx prisma validate` passes
- [ ] `npx prisma migrate status` shows up to date
- [ ] `npx tsc --noEmit` passes
- [ ] `npm run build` succeeds
- [ ] `npm test` passes
- [ ] Existing sessions still queryable

---

## Phase 2: Extend Session Endpoint for Free Practice

**Objective**: Allow counselors to practice without assignments by extending the existing endpoint.

### Tasks with Verification

#### Task 2.1: Update Session Route Handler

**Files to modify**: `src/app/api/sessions/route.ts`

```typescript
import { createSessionSchema } from '@/lib/validators'

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    if (authResult.error) return authResult.error
    const user = authResult.user

    const body = await request.json()
    const data = createSessionSchema.parse(body)

    if (data.type === 'assignment') {
      return handleAssignmentSession(data, user)
    } else {
      return handleFreePracticeSession(data, user)
    }
  } catch (error) {
    return handleApiError(error)
  }
}

async function handleFreePracticeSession(
  data: { type: 'free_practice'; userId: string; scenarioId?: string; modelType: 'phone' | 'chat' },
  user: User
) {
  // Verify user owns this session
  if (data.userId !== user.id) {
    return forbidden('Cannot create session for another user')
  }

  // If scenario provided, fetch it
  let scenario = null
  if (data.scenarioId) {
    scenario = await prisma.scenario.findUnique({
      where: { id: data.scenarioId }
    })
    if (!scenario) {
      return notFound('Scenario not found')
    }
  }

  // Generate greeting
  const greeting = scenario
    ? await generateInitialGreeting(scenario.prompt)
    : await generateFreePracticeGreeting()

  // Create session
  const session = await prisma.$transaction(async (tx) => {
    const newSession = await tx.session.create({
      data: {
        userId: data.userId,
        scenarioId: data.scenarioId,
        modelType: data.modelType,
        status: 'active',
      },
    })

    await tx.transcriptTurn.create({
      data: {
        sessionId: newSession.id,
        role: 'assistant',
        content: greeting,
        turnOrder: 1,
      },
    })

    return tx.session.findUnique({
      where: { id: newSession.id },
      include: { transcript: { orderBy: { turnOrder: 'asc' } } },
    })
  })

  return apiSuccess(session, 201)
}
```

**Verification**:
```bash
# 1. Test free practice session creation
curl -X POST http://localhost:3003/api/sessions \
  -H "Content-Type: application/json" \
  -H "x-user-id: <counselor-uuid>" \
  -d '{"type": "free_practice", "userId": "<counselor-uuid>", "modelType": "chat"}'
# Expected: 201 with session object

# 2. Test assignment session still works
curl -X POST http://localhost:3003/api/sessions \
  -H "Content-Type: application/json" \
  -H "x-user-id: <counselor-uuid>" \
  -d '{"type": "assignment", "assignmentId": "<assignment-uuid>"}'
# Expected: 201 with session object (or appropriate error if assignment doesn't exist)
```

---

#### Task 2.2: Add Free Practice Greeting Function

**Files to modify**: `src/lib/openai.ts`

```typescript
export async function generateFreePracticeGreeting(): Promise<string> {
  const response = await openai.chat.completions.create({
    model: process.env.CHAT_MODEL || 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are simulating a caller for crisis counselor training.
This is free practice mode - no specific scenario.
Start with a general greeting that invites the counselor to practice.
Example: "Hi, I'm not sure if this is the right place to call, but I've been having a really hard time lately..."
Keep it natural and open-ended so the counselor can practice various approaches.`
      },
      {
        role: 'user',
        content: 'Generate an opening message as a caller seeking support.'
      }
    ],
    max_tokens: 200,
  })

  return response.choices[0]?.message?.content ||
    "Hi... I wasn't sure who to call, but I've been struggling lately and needed to talk to someone."
}
```

**Verification**:
```bash
# 1. Test greeting generation
node -e "
const { generateFreePracticeGreeting } = require('./src/lib/openai');
generateFreePracticeGreeting().then(g => console.log('Greeting:', g)).catch(e => console.error(e));
"
# Expected: Natural greeting text
```

---

#### Task 2.3: Update Evaluation for Sessions Without Scenario

**Files to modify**: `src/app/api/sessions/[id]/evaluate/route.ts`

Update to handle null `scenarioId`:

```typescript
// When building evaluation context:
if (session.assignment?.scenario) {
  // Existing scenario-based evaluation
} else if (session.scenario) {
  // Free practice with scenario
} else {
  // Free practice without scenario - use generic criteria
  evaluationContext = 'Generic crisis counseling evaluation criteria'
}
```

**Verification**:
```bash
# 1. Create free practice session, add messages, then evaluate
# (Integration test will cover this)

# 2. TypeScript compilation
npx tsc --noEmit
```

---

#### Task 2.4: Add Free Practice Button to Dashboard

**Files to modify**: `src/components/counselor-dashboard.tsx`

Add a "Free Practice" button that navigates to `/training/chat/free` or opens a mode selection dialog.

**Verification**:
```bash
# 1. Build succeeds
npm run build

# 2. Visual verification (manual)
# Open http://localhost:3003/counselor and verify Free Practice button exists
```

---

### Phase 2 Acceptance Criteria

- [ ] POST `/api/sessions` with `type: "free_practice"` returns 201
- [ ] POST `/api/sessions` with `type: "assignment"` still works
- [ ] Free practice greeting is generated
- [ ] Evaluation works for free practice sessions
- [ ] `npm run build` succeeds
- [ ] `npm test` passes

---

## Phase 3: Voice Training UI

**Objective**: Create the missing voice training page.

### Tasks with Verification

#### Task 3.1: Create Voice Training Page

**Files to create**: `src/app/training/voice/[assignmentId]/page.tsx`

```typescript
"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Header from "@/components/header";
import VoiceTrainingView from "@/components/voice-training-view";
import { Assignment, UserRole } from "@/types";
import { createAuthFetch } from "@/lib/fetch";

export default function VoiceTrainingPage() {
  const params = useParams();
  const router = useRouter();
  const assignmentId = params.assignmentId as string;

  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [currentUser, setCurrentUser] = useState<{ id: string; role: UserRole } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      // Similar to chat training page - fetch user and assignment
      // ...
    }
    fetchData();
  }, [assignmentId]);

  const handleComplete = () => {
    router.push("/counselor");
  };

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!assignment || !currentUser) return <div>Not found</div>;

  return (
    <main className="min-h-screen bg-slate-700">
      <div className="max-w-4xl mx-auto px-4">
        <Header title="Voice Training" role="counselor" />
        <VoiceTrainingView
          assignment={assignment}
          userId={currentUser.id}
          onComplete={handleComplete}
        />
      </div>
    </main>
  );
}
```

**Verification**:
```bash
# 1. Page renders without errors
npm run build

# 2. TypeScript compilation
npx tsc --noEmit
```

---

#### Task 3.2: Create VoiceTrainingView Component

**Files to create**: `src/components/voice-training-view.tsx`

Component should include:
- Connection status indicator
- Real-time transcript display
- Microphone controls
- "Get Feedback" button
- Error handling for WebSocket disconnects

**Verification**:
```bash
# 1. Component imports without errors
npm run build

# 2. TypeScript compilation
npx tsc --noEmit
```

---

#### Task 3.3: Update useRealtimeVoice Hook

**Files to modify**: `src/hooks/use-realtime-voice.ts`

Add support for free practice mode (sessions without assignmentId).

**Verification**:
```bash
# 1. TypeScript compilation
npx tsc --noEmit

# 2. Existing voice tests pass
npm test -- --grep "voice"
```

---

#### Task 3.4: Update Counselor Dashboard Navigation

**Files to modify**: `src/components/counselor-dashboard.tsx`

Ensure clicking voice assignments navigates to `/training/voice/[id]`.

**Verification**:
```bash
# 1. Build succeeds
npm run build
```

---

### Phase 3 Acceptance Criteria

- [ ] `/training/voice/[assignmentId]` page renders
- [ ] VoiceTrainingView component exists and compiles
- [ ] WebSocket connection establishes
- [ ] Transcript displays in real-time
- [ ] "Get Feedback" button triggers evaluation
- [ ] `npm run build` succeeds
- [ ] `npm test` passes

---

## Phase 4: Recording System

**Objective**: Capture voice sessions for supervisor review.

### Tasks with Verification

#### Task 4.1: Add Recording Parameter to WebSocket Server

**Files to modify**: `ws-server/index.ts`

```typescript
interface ConnectionParams {
  userId: string;
  scenarioId?: string;
  assignmentId?: string;
  record?: boolean;  // NEW
}

function authenticateConnection(request: IncomingMessage): AuthResult {
  const url = new URL(request.url || "/", `http://localhost:${WS_PORT}`);

  const userId = url.searchParams.get("userId");
  if (!userId) {
    return { ok: false, error: "Missing required userId parameter" };
  }

  return {
    ok: true,
    params: {
      userId,
      scenarioId: url.searchParams.get("scenarioId") || undefined,
      assignmentId: url.searchParams.get("assignmentId") || undefined,
      record: url.searchParams.get("record") === "true",  // NEW
    },
  };
}
```

**Verification**:
```bash
# 1. WebSocket server starts
npm run ws:dev &
sleep 2

# 2. Health check
curl http://localhost:3004/health
# Expected: {"status":"ok"}

# 3. Stop server
pkill -f "ws-server" || true
```

---

#### Task 4.2: Implement Audio Capture in RealtimeSession

**Files to modify**: `ws-server/realtime-session.ts`

Add audio chunk accumulation and WAV encoding on disconnect.

**Verification**:
```bash
# 1. TypeScript compilation (ws-server)
cd ws-server && npx tsc --noEmit && cd ..

# 2. WebSocket tests pass
npm test -- --grep "WebSocket"
```

---

#### Task 4.3: Create WAV Encoder Utility

**Files to create**: `src/lib/audio/wav-encoder.ts`

```typescript
interface WavOptions {
  sampleRate: number;
  numChannels: number;
  bitDepth: number;
}

export function encodeWav(
  samples: Buffer,
  options: WavOptions = { sampleRate: 24000, numChannels: 1, bitDepth: 16 }
): Buffer {
  // Implementation...
}
```

**Verification**:
```bash
# 1. Create test file
cat > src/lib/audio/wav-encoder.test.ts << 'EOF'
import { describe, it, expect } from 'vitest'
import { encodeWav } from './wav-encoder'

describe('WAV encoder', () => {
  it('produces valid WAV header', () => {
    const samples = Buffer.alloc(4800) // 100ms of silence at 24kHz
    const wav = encodeWav(samples)

    expect(wav.slice(0, 4).toString()).toBe('RIFF')
    expect(wav.slice(8, 12).toString()).toBe('WAVE')
    expect(wav.slice(12, 16).toString()).toBe('fmt ')
  })
})
EOF

# 2. Run test
npm test -- wav-encoder
```

---

#### Task 4.4: Create Recording API Endpoints

**Files to create**:
- `src/app/api/recordings/route.ts`
- `src/app/api/recordings/[id]/download/route.ts`

**Verification**:
```bash
# 1. List recordings
curl http://localhost:3003/api/recordings \
  -H "x-user-id: <supervisor-uuid>"
# Expected: 200 with array

# 2. Download (will fail if no recordings exist, but endpoint should respond)
curl -I http://localhost:3003/api/recordings/nonexistent/download
# Expected: 404
```

---

### Phase 4 Acceptance Criteria

- [ ] `?record=true` WebSocket parameter parsed
- [ ] Audio chunks accumulated during session
- [ ] WAV file created on session end
- [ ] Recording model created in database
- [ ] GET `/api/recordings` returns list
- [ ] GET `/api/recordings/[id]/download` supports Range requests
- [ ] Authorization enforced (counselors own recordings, supervisors all)
- [ ] `npm run build` succeeds
- [ ] `npm test` passes

---

## Phase 5: Bulk Import & Context Upload

**Objective**: Enable scenario import and evaluator context uploads.

### Tasks with Verification

#### Task 5.1: Create Bulk Import Endpoint

**Files to create**: `src/app/api/scenarios/import/route.ts`

```typescript
import { NextRequest } from 'next/server'
import prisma from '@/lib/prisma'
import { apiSuccess, apiError, handleApiError } from '@/lib/api'
import { requireSupervisor } from '@/lib/auth'
import { z } from 'zod'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

const importScenarioSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  prompt: z.string().min(1),
  mode: z.enum(['phone', 'chat']).default('phone'),
  category: z.enum(['onboarding', 'refresher', 'advanced', 'assessment']).optional(),
  evaluatorContext: z.string().optional(),
})

const bulkImportSchema = z.object({
  scenarios: z.array(importScenarioSchema).max(100),
})

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireSupervisor(request)
    if (authResult.error) return authResult.error
    const user = authResult.user

    const body = await request.json()
    const { scenarios } = bulkImportSchema.parse(body)

    // Get existing titles for duplicate check
    const existingTitles = new Set(
      (await prisma.scenario.findMany({ select: { title: true } }))
        .map(s => s.title.toLowerCase().trim())
    )

    const created: string[] = []
    const skipped: string[] = []

    for (const scenario of scenarios) {
      const normalizedTitle = scenario.title.toLowerCase().trim()

      if (existingTitles.has(normalizedTitle)) {
        skipped.push(scenario.title)
        continue
      }

      // Create scenario
      const newScenario = await prisma.scenario.create({
        data: {
          title: scenario.title,
          description: scenario.description,
          prompt: scenario.prompt,
          mode: scenario.mode,
          category: scenario.category,
          createdBy: user.id,
          accountId: /* default account */,
        }
      })

      // Save evaluator context as file if provided
      if (scenario.evaluatorContext) {
        const contextDir = path.join(process.cwd(), 'uploads', 'evaluator_context', newScenario.id)
        await mkdir(contextDir, { recursive: true })
        const contextPath = path.join(contextDir, 'context.txt')
        await writeFile(contextPath, scenario.evaluatorContext, 'utf-8')

        await prisma.scenario.update({
          where: { id: newScenario.id },
          data: { evaluatorContextPath: contextPath }
        })
      }

      created.push(scenario.title)
      existingTitles.add(normalizedTitle)
    }

    return apiSuccess({
      created: created.length,
      skipped: skipped.length,
      createdTitles: created,
      skippedTitles: skipped,
    }, created.length > 0 ? 201 : 200)
  } catch (error) {
    return handleApiError(error)
  }
}
```

**Verification**:
```bash
# 1. Test import with valid data
curl -X POST http://localhost:3003/api/scenarios/import \
  -H "Content-Type: application/json" \
  -H "x-user-id: <supervisor-uuid>" \
  -d '{
    "scenarios": [
      {"title": "Test Import 1", "prompt": "You are a caller...", "mode": "chat"},
      {"title": "Test Import 2", "prompt": "You are calling about...", "mode": "phone"}
    ]
  }'
# Expected: 201 with created count

# 2. Test duplicate detection (run same request again)
# Expected: 200 with skipped count = 2
```

---

#### Task 5.2: Add Context Upload to Scenario PATCH

**Files to modify**: `src/app/api/scenarios/[id]/route.ts`

Add support for multipart form data with `contextFile` field (TXT/MD only).

**Verification**:
```bash
# 1. Upload context file
echo "Evaluation criteria for this scenario..." > /tmp/context.txt
curl -X PATCH http://localhost:3003/api/scenarios/<scenario-id> \
  -H "x-user-id: <supervisor-uuid>" \
  -F "contextFile=@/tmp/context.txt"
# Expected: 200 with updated scenario

# 2. Verify file was saved
ls uploads/evaluator_context/<scenario-id>/
# Expected: context.txt
```

---

### Phase 5 Acceptance Criteria

- [ ] POST `/api/scenarios/import` accepts JSON array
- [ ] Duplicates detected by case-insensitive title
- [ ] Max 100 scenarios enforced
- [ ] Evaluator context saved as `.txt` files
- [ ] PATCH `/api/scenarios/[id]` accepts file upload
- [ ] TXT/MD validated, PDF/DOCX rejected
- [ ] `npm run build` succeeds
- [ ] `npm test` passes

---

## Phase 6: Vector Store & One-Time Scenarios

**Objective**: Policy document search and custom scenario creation.

### Tasks with Verification

#### Task 6.1: Add Vector Store Upload to Account PATCH

**Files to modify**: `src/app/api/accounts/[id]/route.ts`

Add PATCH handler for policy file upload.

**Verification**:
```bash
# 1. Upload policy file
echo "Company policies and procedures..." > /tmp/policies.txt
curl -X PATCH http://localhost:3003/api/accounts/<account-id> \
  -H "x-user-id: <supervisor-uuid>" \
  -F "policiesFile=@/tmp/policies.txt"
# Expected: 200 with updated account (including policiesVectorFileId)

# 2. Verify vector store ID stored
curl http://localhost:3003/api/accounts/<account-id>
# Expected: policiesVectorFileId populated
```

---

#### Task 6.2: Add Vector Store Functions to OpenAI Lib

**Files to modify**: `src/lib/openai.ts`

```typescript
export async function uploadPolicyToVectorStore(
  accountId: string,
  filePath: string
): Promise<string> {
  // 1. Upload to OpenAI Files API
  const file = await openai.files.create({
    file: fs.createReadStream(filePath),
    purpose: 'assistants',
  })

  // 2. Create or get vector store
  const vectorStoreName = `account-${accountId}-policies`
  let vectorStore = await findOrCreateVectorStore(vectorStoreName)

  // 3. Add file to vector store
  await openai.beta.vectorStores.files.create(vectorStore.id, {
    file_id: file.id,
  })

  return file.id
}

async function findOrCreateVectorStore(name: string) {
  const stores = await openai.beta.vectorStores.list()
  const existing = stores.data.find(s => s.name === name)
  if (existing) return existing

  return openai.beta.vectorStores.create({ name })
}
```

**Verification**:
```bash
# 1. TypeScript compilation
npx tsc --noEmit
```

---

#### Task 6.3: Update Evaluation to Use file_search Tool

**Files to modify**: `src/lib/openai.ts` (generateEvaluation function)

When `policiesVectorFileId` exists on the account, include file_search tool.

**Verification**:
```bash
# 1. Run evaluation for session with policies
# (Integration test covers this)

# 2. TypeScript compilation
npx tsc --noEmit
```

---

#### Task 6.4: Add isOneTime Filter to Scenarios

**Files to modify**: `src/app/api/scenarios/route.ts`

```typescript
// In GET handler:
const { isOneTime } = queryResult.data

const where: Record<string, unknown> = {}
if (isOneTime !== undefined) {
  where.isOneTime = isOneTime === 'true'
} else {
  // Default: exclude one-time scenarios from list
  where.isOneTime = false
}
```

**Verification**:
```bash
# 1. Default excludes one-time
curl http://localhost:3003/api/scenarios
# Expected: No scenarios with isOneTime=true

# 2. Explicit include
curl "http://localhost:3003/api/scenarios?isOneTime=true"
# Expected: Only one-time scenarios
```

---

### Phase 6 Acceptance Criteria

- [ ] PATCH `/api/accounts/[id]` accepts policy file
- [ ] File uploaded to OpenAI vector store
- [ ] `policiesVectorFileId` stored in account
- [ ] Evaluation uses file_search when vector store exists
- [ ] GET `/api/scenarios` filters by `isOneTime`
- [ ] One-time scenarios hidden from dropdown by default
- [ ] `npm run build` succeeds
- [ ] `npm test` passes

---

## Final Verification

After all phases complete:

```bash
# 1. Full build
npm run build
# Expected: Success

# 2. All tests pass
npm test
# Expected: All pass

# 3. Lint
npm run lint
# Expected: No errors

# 4. Database migrations applied
npx prisma migrate status
# Expected: Up to date

# 5. Start servers and verify health
npm run dev &
npm run ws:dev &
sleep 5
curl http://localhost:3003/api/health || echo "OK"
curl http://localhost:3004/health
# Expected: Both healthy
pkill -f "next dev" || true
pkill -f "ws-server" || true
```

---

## References

### Internal
- `src/hooks/use-realtime-voice.ts:64-500` - Existing voice hook
- `src/app/api/sessions/route.ts:53-90` - Session creation pattern
- `src/lib/openai.ts` - OpenAI integration

### External
- [OpenAI Realtime API](https://platform.openai.com/docs/api-reference/realtime)
- [OpenAI Vector Stores](https://platform.openai.com/docs/api-reference/vector-stores)
- [Prisma Migrations](https://www.prisma.io/docs/orm/prisma-migrate)

---

*Configured for Ralph overnight automation - create issues with `auto:ready` label*
