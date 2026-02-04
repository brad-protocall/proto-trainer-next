# Cross-Process Integration Patterns

**Last Updated:** 2026-02-03
**Context:** Lessons from LiveKit migration code review (7-agent analysis)
**Applies To:** Service-to-service communication, external process boundaries, distributed systems

---

## Problem Statement

When code spans multiple processes (agent code, API handlers, external services), several categories of bugs emerge:

1. **Type Safety** - Unsafe type casts at API boundaries
2. **Authentication** - Missing or inconsistent service auth
3. **Idempotency** - Duplicate data on retries
4. **Semantics** - Ambiguous HTTP status codes
5. **Performance** - Sequential instead of parallel I/O

This document provides patterns to prevent each category.

---

## Pattern 1: Zod Validation at Every Process Boundary

### Problem Example

```typescript
// ANTIPATTERN: Unsafe type cast
async function fetchScenarioPrompt(scenarioId: string): Promise<string> {
  const response = await fetch(`/api/scenarios/${scenarioId}`)
  const data = await response.json() as { prompt: string }  // ⚠️ unsafe cast
  return data.prompt  // ⚠️ crashes if API changes
}
```

### Why It Fails

- If API returns `{ data: { prompt: "..." } }`, type cast still succeeds but `data.prompt` is undefined
- If API returns `{ error: "..." }` instead, no type error, code reads null/undefined
- Refactoring API response shape doesn't trigger TypeScript errors (cast suppresses them)
- Runtime error occurs downstream, far from actual problem

### Solution Pattern

```typescript
// File: src/lib/validators.ts (single source of truth)
import { z } from 'zod'

export const ScenarioResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    prompt: z.string().min(1).max(50000),
  }),
})

export type ScenarioResponse = z.infer<typeof ScenarioResponseSchema>
```

```typescript
// File: livekit-agent/src/main.ts (consuming the schema)
import { ScenarioResponseSchema } from '../../../src/lib/validators'

async function fetchScenarioPrompt(scenarioId: string): Promise<string | null> {
  try {
    const response = await fetch(`${getAppUrl()}/api/internal/scenarios/${scenarioId}`, {
      headers: { 'X-Internal-Service-Key': getServiceKey() },
    })

    if (!response.ok) {
      console.error(`Fetch failed: ${response.status}`)
      return null
    }

    // Validate at runtime
    const parsed = ScenarioResponseSchema.safeParse(await response.json())

    if (!parsed.success) {
      console.error(`Invalid response: ${parsed.error.message}`)
      return null
    }

    return parsed.data.data.prompt
  } catch (error) {
    console.error(`Error fetching scenario:`, error)
    return null
  }
}
```

### Enforcement

- **ESLint Rule:** Ban `as unknown` and `as any` in cross-process boundary files
- **Code Review Checklist:** "All JSON responses validated with Zod?"
- **Type Safety:** Derive TypeScript types from Zod schemas (never duplicate them)

### When NOT to Use

- Internal function calls within same process (use TypeScript types directly)
- Third-party library types already validated (trust the types)
- Mocked responses in unit tests (use `z.parse()` for test data)

---

## Pattern 2: Centralized Service Authentication

### Problem Example

```typescript
// ANTIPATTERN: Duplicate logic
// File A: src/lib/auth.ts
function validateServiceKey(request: NextRequest): boolean {
  return request.headers.get('X-Internal-Service-Key') === process.env.INTERNAL_SERVICE_KEY
}

// File B: src/lib/external-auth.ts
function validateInternalServiceKey(request: NextRequest): boolean {
  return request.headers.get('X-Internal-Service-Key') === process.env.INTERNAL_SERVICE_KEY
}

// File C: livekit-agent/src/main.ts
const key = request.headers.get('X-Internal-Service-Key')
if (key !== process.env.INTERNAL_SERVICE_KEY) {
  throw new Error('Invalid key')
}

// ⚠️ Three implementations, timing-attack vulnerable, hard to fix consistently
```

### Why It Fails

- Bug in one implementation is missed in others (e.g., timing-safe comparison added to File A only)
- Multiple files need changes for any auth policy update (source of bugs)
- Timing-attack vulnerability in plain `===` comparison (53 milliseconds per correct char)
- No single place to audit authentication

### Solution Pattern

```typescript
// File: src/lib/external-auth.ts (single source for all auth validation)
import { timingSafeEqual, createHash } from 'crypto'
import { NextRequest } from 'next/server'

/**
 * Timing-safe validation of external API key.
 * Uses SHA-256 hashing to ensure constant-time comparison regardless of key length.
 */
export function validateApiKey(request: NextRequest): boolean {
  const apiKey = request.headers.get('X-API-Key')
  const expectedKey = process.env.EXTERNAL_API_KEY

  if (!apiKey || !expectedKey) {
    return false
  }

  // Hash both keys to ensure constant-length comparison
  const providedHash = createHash('sha256').update(apiKey).digest()
  const expectedHash = createHash('sha256').update(expectedKey).digest()

  return timingSafeEqual(providedHash, expectedHash)
}

/**
 * Timing-safe validation of internal service key.
 * Used by LiveKit agent and other internal services to call API endpoints.
 */
export function validateInternalServiceKey(request: NextRequest): boolean {
  const serviceKey = request.headers.get('X-Internal-Service-Key')
  const expectedKey = process.env.INTERNAL_SERVICE_KEY

  if (!expectedKey) {
    // Development fallback: accept localhost if no key configured
    const origin = request.headers.get('origin') || request.headers.get('host')
    return origin?.includes('localhost') ?? false
  }

  if (!serviceKey) {
    return false
  }

  const providedHash = createHash('sha256').update(serviceKey).digest()
  const expectedHash = createHash('sha256').update(expectedKey).digest()

  return timingSafeEqual(providedHash, expectedHash)
}
```

```typescript
// File: src/lib/auth.ts (delegates to single source)
import { validateInternalServiceKey } from '@/lib/external-auth'

/**
 * Require internal service authentication via X-Internal-Service-Key header.
 * Used by the LiveKit agent to call internal API endpoints.
 */
export function requireInternalAuth(
  request: NextRequest
): { error: null } | { error: Response } {
  if (!validateInternalServiceKey(request)) {
    return { error: unauthorized('Invalid or missing service key') }
  }

  return { error: null }
}
```

```typescript
// File: src/app/api/internal/sessions/route.ts (uses delegated auth)
import { requireInternalAuth } from '@/lib/auth'

export async function POST(request: NextRequest) {
  const authResult = requireInternalAuth(request)
  if (authResult.error) return authResult.error

  // ... handle request
}
```

### Enforcement

- **Single Source Rule:** All service auth validation must be in one file (`src/lib/external-auth.ts`)
- **Delegation Pattern:** Other files import and call, never re-implement
- **Code Review:** "Does this code validate service keys? If yes, does it use the central function?"
- **Lint Rule:** Ban `process.env.INTERNAL_SERVICE_KEY` and `process.env.EXTERNAL_API_KEY` outside `external-auth.ts`

---

## Pattern 3: Parallel Over Sequential for Independent I/O

### Problem Example

```typescript
// ANTIPATTERN: Sequential I/O adds latency
async function agentSetup(metadata: AgentMetadata) {
  // These two network calls are independent but run sequentially
  const scenario = await fetchScenarioPrompt(metadata.scenarioId)  // 200ms
  const session = await createDbSession(metadata)                  // 300ms
  // Total: ~500ms

  return { scenario, session }
}
```

### Why It Fails

- Scenario fetch completes at 200ms but code blocks waiting for it
- Session creation doesn't start until scenario completes
- Compounded latency: 200ms + 300ms = 500ms
- Could be parallelized: max(200ms, 300ms) = 300ms
- Agent cold-start adds 200ms of unnecessary delay per session

### Solution Pattern

```typescript
// Pattern: Use Promise.all() for independent operations
async function agentSetup(metadata: AgentMetadata) {
  const [scenarioPrompt, sessionResult] = await Promise.all([
    // First independent operation (conditional)
    metadata.scenarioId
      ? fetchScenarioPrompt(metadata.scenarioId)
      : Promise.resolve(null),  // If no scenarioId, resolve immediately
    // Second independent operation
    createDbSession(metadata),
  ])

  // Both complete in parallel: ~300ms (faster of the two)
  return { scenarioPrompt, sessionResult }
}
```

### Variations

**When One Operation Depends on Another:**

```typescript
// SEQUENTIAL: Correct when b depends on a
const resultA = await operationA()
const resultB = await operationB(resultA)
```

**When Some Operations Are Optional:**

```typescript
// PARALLEL: Optional operations don't block others
const [optional, required] = await Promise.all([
  condition ? expensiveOperationA() : Promise.resolve(null),
  requiredOperationB(),
])
```

**Handle Individual Failures:**

```typescript
// If one operation can fail independently, use Promise.allSettled()
const [a, b] = await Promise.allSettled([
  operationA(),
  operationB(),
])

if (a.status === 'rejected') {
  console.error('A failed:', a.reason)
  return null  // or fallback
}

if (b.status === 'fulfilled') {
  console.log('B succeeded:', b.value)
}
```

### Enforcement

- **Code Review:** "Can these `await`s happen in parallel?"
- **Performance Tests:** Measure and log latency; flag regressions
- **Lint Rule:** Warn on sequential top-level awaits in functions with >1 independent I/O

---

## Pattern 4: HTTP Status Code Semantics

### Problem Example

```typescript
// ANTIPATTERN: Same status for different error types
export async function POST(request: NextRequest) {
  // ... evaluate session

  if (evaluation.exists) {
    return apiError({ message: 'Already evaluated' }, 409)  // Permanent conflict
  }

  if (transcripts.length < 2) {
    return apiError({ message: 'Transcripts not ready' }, 409)  // Transient, should retry
  }

  // Frontend can't tell the difference
  // - If 409, should it retry? (depends on the reason)
  // - If not, how long to wait?
}
```

### Why It Fails

- Frontend receives 409, doesn't know if retry will succeed
- For "already evaluated": retry will always fail (permanent)
- For "transcripts not ready": retry after 2s will succeed (transient)
- Frontend waits 10s before giving up, or retries forever
- User experience: slow, confusing, or broken

### Solution Pattern

Use HTTP status codes semantically:

| Scenario | Status | Semantics | Client Action |
|----------|--------|-----------|---------------|
| Evaluation already exists (permanent) | 409 Conflict | Don't retry, state is final | Show error, let user re-read evaluation |
| Transcripts not yet persisted (transient) | 425 Too Early | Retry after delay | Wait 2-5s, retry automatically |
| User unauthorized (permanent) | 403 Forbidden | Fix auth, don't retry | Show "unauthorized" error, redirect to login |
| Missing required field (permanent) | 400 Bad Request | Invalid input, don't retry | Show validation error, highlight field |
| Server error (transient) | 500 Internal Server Error | Retry with exponential backoff | Retry after 1s, 2s, 4s... up to max |

```typescript
// CORRECT pattern
export async function POST(request: NextRequest, { params }: RouteParams) {
  // ... verify user, check ownership

  // Already evaluated: true conflict, don't retry
  if (session.assignment?.evaluation) {
    return conflict('Evaluation already exists for this assignment')  // 409
  }

  // Transcripts not ready: transient, should retry
  if (latestTranscript.length < 2) {
    return apiError(
      { type: 'TOO_EARLY', message: 'Transcripts not yet available' },
      425  // Too Early: transient, retry is safe
    )
  }

  // ... generate evaluation
}
```

```typescript
// Frontend uses status code to decide retry strategy
async function requestEvaluationWithRetry(
  sessionId: string,
  userId: string,
): Promise<EvaluationResult> {
  const maxRetries = 5
  const retryDelayMs = 2000

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const response = await fetch(`/api/sessions/${sessionId}/evaluate`, {
      method: 'POST',
      headers: { 'x-user-id': userId },
    })

    // 425 = transcripts not yet persisted, safe to retry
    if (response.status === 425 && attempt < maxRetries - 1) {
      console.log(`Evaluation not ready (attempt ${attempt + 1}), retrying in 2s...`)
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
      continue
    }

    // 409 = permanent conflict, don't retry
    if (response.status === 409) {
      throw new Error('Evaluation already exists')
    }

    // Other errors
    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      throw new Error(errorData?.error?.message || `HTTP ${response.status}`)
    }

    // Success
    const data = await response.json()
    if (data.ok && data.data) {
      return { evaluation: data.data.evaluation }
    }
  }

  throw new Error('Evaluation failed after retries')
}
```

### Reference Codes

Ordered by frequency in REST APIs:

| Code | Meaning | Retry? | When |
|------|---------|--------|------|
| 200 | OK | No | Success |
| 400 | Bad Request | No | Invalid input (permanent) |
| 401 | Unauthorized | No | Missing/invalid auth (permanent) |
| 403 | Forbidden | No | User lacks permission (permanent) |
| 404 | Not Found | No | Resource doesn't exist (permanent) |
| 409 | Conflict | No | State conflict, operation failed (permanent) |
| 425 | Too Early | Yes | Precondition not met, will be soon (transient) |
| 429 | Too Many Requests | Yes | Rate limited (transient, backoff) |
| 500 | Internal Server Error | Yes | Server error (transient, exponential backoff) |
| 503 | Service Unavailable | Yes | Maintenance/overload (transient, backoff) |

---

## Pattern 5: Idempotent Persistence

### Problem Example

```typescript
// ANTIPATTERN: Non-idempotent insert
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const { turns } = await request.json()

  // If this endpoint is called twice with same data:
  // - First call: inserts 50 turns
  // - Second call: inserts 50 turns again (duplicates!)
  // - Evaluation reads 100 turns instead of 50
  await prisma.transcriptTurn.createMany({
    data: turns.map((turn) => ({
      sessionId: id,
      role: turn.role,
      content: turn.content,
      turnOrder: turn.turnOrder,
    })),
  })

  return apiSuccess({ saved: turns.length })
}
```

### Why It Fails

- Network error occurs after first request completes (DB mutation succeeds)
- Client retries (didn't see response)
- Database now has duplicates
- Evaluation reads inflated transcript
- User sees artificially high word counts

### Solution Pattern

**For Transcript-Like Endpoints:**

```typescript
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params

  const authResult = requireInternalAuth(request)
  if (authResult.error) return authResult.error

  const body = await request.json()
  const data = bulkTranscriptSchema.parse(body)

  // Verify session exists
  const session = await prisma.session.findUnique({
    where: { id },
    select: { id: true, currentAttempt: true },
  })

  if (!session) {
    return notFound('Session not found')
  }

  const defaultAttemptNumber = session.currentAttempt ?? 1

  // Idempotent: delete existing turns for this attempt, then bulk insert.
  // This prevents duplicates if the agent retries the persist call.
  const turnData = data.turns.map((turn) => ({
    sessionId: id,
    role: turn.role,
    content: turn.content,
    turnOrder: turn.turnOrder,
    attemptNumber: turn.attemptNumber ?? defaultAttemptNumber,
  }))

  // Use transaction for atomicity
  const result = await prisma.$transaction(async (tx) => {
    // Step 1: Delete existing turns for this attempt
    await tx.transcriptTurn.deleteMany({
      where: { sessionId: id, attemptNumber: defaultAttemptNumber },
    })

    // Step 2: Bulk insert new version
    return tx.transcriptTurn.createMany({ data: turnData })
  })

  return apiSuccess({
    saved: result.count,
    sessionId: id,
  })
}
```

### Key Elements

1. **Delete-Before-Insert Pattern:** Removes old version first
2. **Attempt Isolation:** Delete only for current attempt (supports retries)
3. **Transaction Wrapper:** Ensures atomicity (delete + insert together, or both fail)
4. **Verify Preconditions:** Check session exists before attempting
5. **Return Count:** Let caller verify operation succeeded

### Variations

**For Upsert Operations:**

```typescript
// Use Prisma upsert for single record
await tx.evaluation.upsert({
  where: { sessionId: id },
  create: { sessionId: id, evaluation: evaluationText, ... },
  update: { evaluation: evaluationText, ... },  // Idempotent: overwrites
})
```

**For Set-Replacement Operations:**

```typescript
// Delete all + insert all (like transcript pattern)
await tx.relationship.deleteMany({ where: { parentId: id } })
await tx.relationship.createMany({ data: newRelationships })
```

### Enforcement

- **Code Review Checklist:** "Is this endpoint idempotent (safe to call twice)?"
- **Test Case:** `postEndpoint(data); const result1 = await getState(); postEndpoint(data); const result2 = await getState(); assert(result1 === result2)`
- **Lint Rule:** Warn on `createMany()` without preceding `deleteMany()` or `create()` without `upsert()`

---

## Pattern 6: Ownership Checks at Every Boundary

### Problem Example

```typescript
// ANTIPATTERN: No ownership verification
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { assignmentId, userId } = body

  // Agent passes userId, but what if it passes a different user's ID?
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
  })

  // Create session for any user (missing ownership check)
  await prisma.session.create({
    data: {
      assignmentId,
      userId,  // ⚠️ No verification that userId owns this assignment
      scenarioId: assignment.scenarioId,
      status: 'active',
    },
  })
}
```

### Why It Fails

- Agent has internal service key (authenticated)
- But agent can impersonate any user by passing their userId
- Creates cross-user session hijacking vulnerability
- Violates defense-in-depth principle (authenticate AND authorize)

### Solution Pattern

```typescript
export async function POST(request: NextRequest) {
  try {
    const authResult = requireInternalAuth(request)  // Service authentication ✓
    if (authResult.error) return authResult.error

    const body = await request.json()
    const data = createVoiceSessionSchema.parse(body)

    if (data.type === 'assignment') {
      return handleAssignmentSession(data.assignmentId, data.userId)
    }

    // ... handle free practice
  } catch (error) {
    return handleApiError(error)
  }
}

async function handleAssignmentSession(assignmentId: string, userId: string) {
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: {
      scenario: { select: { mode: true } },
      session: true,
    },
  })

  if (!assignment) {
    return notFound('Assignment not found')
  }

  // AUTHORIZATION: Verify the user owns this assignment (defense-in-depth)
  if (assignment.counselorId !== userId) {
    return conflict('User does not own this assignment')
  }

  // ... safe to create session
}
```

### Enforcement

- **Defense-in-Depth Rule:** If request includes userId, verify it matches assignment/resource owner
- **Code Review:** "Does this endpoint check that the user can access this resource?"
- **Test Case:** Call endpoint with mismatched userId, expect 403/409

---

## Summary Table

| Pattern | Problem | Solution | Enforcement |
|---------|---------|----------|------------|
| **Zod Validation** | Unsafe `as` casts at API boundary | Validate all responses with Zod | ESLint: ban `as unknown` |
| **Centralized Auth** | Duplicate validation logic, timing attacks | Single source for all service auth | Lint rule: ban direct env access |
| **Parallel I/O** | Sequential blocks add latency unnecessarily | `Promise.all()` for independent ops | Code review: "Can these await in parallel?" |
| **HTTP Semantics** | Frontend can't distinguish permanent vs transient | Use 425 (Too Early) for transient | Document and validate status codes |
| **Idempotent Persistence** | Retries create duplicates | Delete-before-insert in transaction | Test: idempotent call returns same result |
| **Ownership Checks** | Cross-user hijacking at service boundary | Verify userId owns resource | Code review: check authorization |

---

## Quick Checklist for Cross-Process Code

Before shipping code that spans processes (agent, API, external services):

- [ ] All API responses validated with Zod (no `as` casts)
- [ ] Service authentication uses single centralized function
- [ ] Timing-safe comparison for secrets (`timingSafeEqual`)
- [ ] Independent I/O operations use `Promise.all()`
- [ ] HTTP status codes match semantics (425 for transient, 409 for permanent)
- [ ] Persistence endpoints idempotent (delete-before-insert)
- [ ] Ownership checks verify userId owns resource
- [ ] Error logs include request ID for tracing
- [ ] Retry logic exponential backoff for transient (429, 500, 503)
- [ ] Tests cover retry scenarios and failure modes

---

**Last Updated:** 2026-02-03
**Related:** `/docs/solutions/integration-issues/livekit-migration-code-review-2026-02-03.md`
