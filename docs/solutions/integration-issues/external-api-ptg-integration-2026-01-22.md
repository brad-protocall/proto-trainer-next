# External API Pattern for PTG Integration

---
title: "External API Pattern for PTG Integration"
date: 2026-01-22
severity: P2
category: integration-issues
components:
  - api/external/scenarios/route.ts
  - api/external/assignments/route.ts
  - api/external/assignments/[id]/result/route.ts
symptoms:
  - "Need service-to-service API separate from user-facing API"
  - "PTG requires external ID mapping for counselors"
  - "Different auth pattern needed for backend services"
root_causes:
  - "Internal APIs use x-user-id header auth designed for browser clients"
  - "PTG uses external user IDs that don't match internal UUIDs"
  - "Frontend expects camelCase, external services prefer snake_case"
commits:
  - "8ad9b48"
  - "3de8705"
related:
  - "docs/solutions/integration-issues/auth-type-consistency-fixes.md"
---

## Summary

The Personalized Training Guide (PTG) needed to integrate with Proto Trainer to assign scenarios and retrieve evaluation results. This required a separate API layer with different authentication (API key instead of user session), different ID mapping (external IDs instead of internal UUIDs), and a dedicated route prefix.

## Problem

The existing internal API (`/api/*`) was designed for browser-based clients:
- Authentication via `x-user-id` header (session-based)
- Internal UUID references for users and resources
- camelCase response format for JavaScript frontend consumption

PTG required:
- Service-to-service authentication with API keys
- External ID mapping (PTG user IDs -> Proto Trainer UUIDs)
- Stable API contract independent of internal refactoring

## Solution

Created dedicated `/api/external/*` routes with:

1. **X-API-Key authentication** with timing-safe comparison
2. **External ID resolution** (PTG user_id -> internal UUID)
3. **Isolated route handlers** that won't break when internal APIs change
4. **Response mapping** to external-friendly format

### Architecture

```
PTG (External Service)
        │
        ▼ X-API-Key auth
┌───────────────────────────────────────────┐
│  /api/external/*                           │
│  - validateApiKey() on every request       │
│  - Looks up users by externalId            │
│  - Maps responses to external format       │
└───────────────────────────────────────────┘
        │
        ▼ Internal UUIDs
┌───────────────────────────────────────────┐
│  Prisma / Database                         │
│  - Users have both id (UUID) and externalId│
│  - Assignments use internal UUIDs          │
└───────────────────────────────────────────┘
```

### Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/external/scenarios` | GET | List available training scenarios |
| `/api/external/assignments?user_id=X` | GET | List assignments for counselor |
| `/api/external/assignments` | POST | Create new assignment |
| `/api/external/assignments/[id]/result` | GET | Get evaluation result |

## Code Examples

### 1. Timing-Safe API Key Validation

**Critical**: Always use timing-safe comparison for API keys to prevent timing attacks.

```typescript
// src/app/api/external/scenarios/route.ts
import { timingSafeEqual } from 'crypto'

function validateApiKey(request: NextRequest): boolean {
  const apiKey = request.headers.get('X-API-Key')
  const expectedKey = process.env.EXTERNAL_API_KEY

  if (!apiKey || !expectedKey) {
    return false
  }

  // Length check prevents timingSafeEqual from throwing
  if (apiKey.length !== expectedKey.length) {
    return false
  }

  return timingSafeEqual(Buffer.from(apiKey), Buffer.from(expectedKey))
}
```

**Why timing-safe?** A naive string comparison (`===`) returns early on first mismatch. An attacker can measure response times to guess API keys character by character. `timingSafeEqual` always takes constant time regardless of where strings differ.

### 2. External ID Resolution

PTG uses its own user IDs. Proto Trainer maps these via the `externalId` field:

```typescript
// POST /api/external/assignments
export async function POST(request: NextRequest) {
  if (!validateApiKey(request)) {
    return apiError({ type: 'UNAUTHORIZED', message: 'Invalid or missing API key' }, 401)
  }

  const { user_id: externalUserId, scenario_id: scenarioId } = parsed.data

  // Map external ID to internal UUID
  const user = await prisma.user.findUnique({
    where: { externalId: externalUserId },
  })

  if (!user) {
    return notFound(
      `User with external ID '${externalUserId}' not found. Create user first via your admin system.`
    )
  }

  // Use internal UUID for database operations
  const assignment = await prisma.assignment.create({
    data: {
      scenarioId: scenario.id,
      counselorId: user.id,  // Internal UUID, not external ID
      // ...
    },
  })

  return apiSuccess({ assignment: toExternalAssignment(assignment) }, 201)
}
```

### 3. Response Mapping to External Format

Transform internal data to stable external contract:

```typescript
function toExternalAssignment(assignment: {
  id: string
  scenario: { id: string; title: string }
  createdAt: Date
  dueDate: Date | null
  status: string
}) {
  return {
    id: assignment.id,
    simulationId: assignment.scenario.id,      // "scenario" -> "simulation" for PTG
    simulationName: assignment.scenario.title,
    assignedAt: assignment.createdAt.toISOString(),
    dueDate: assignment.dueDate?.toISOString() ?? undefined,
    status: assignment.status as 'pending' | 'in_progress' | 'completed',
  }
}
```

### 4. Duplicate Assignment Prevention

Check for existing active assignments and handle race conditions:

```typescript
// Check for existing active assignment
const existingActive = await prisma.assignment.findFirst({
  where: {
    counselorId: user.id,
    scenarioId: scenarioId,
    status: { not: 'completed' },
  },
})

if (existingActive) {
  return apiError({
    type: 'CONFLICT',
    message: `Active assignment already exists for this counselor and scenario`,
  }, 409)
}

// Create with DB-level unique constraint as backup
try {
  const assignment = await prisma.assignment.create({
    data: { /* ... */ },
  })
  return apiSuccess({ assignment: toExternalAssignment(assignment) }, 201)
} catch (createError) {
  // Handle unique constraint violation (race condition caught by DB)
  if (createError instanceof Error &&
      createError.message.includes('Unique constraint failed')) {
    return apiError({
      type: 'CONFLICT',
      message: 'Active assignment already exists for this counselor and scenario',
    }, 409)
  }
  throw createError
}
```

### 5. Environment Configuration

```env
# .env
EXTERNAL_API_KEY=your-secret-api-key-here
```

Generate a secure key:
```bash
openssl rand -base64 32
```

## Database Setup

### External System User and Account

Seed data creates dedicated resources for external API assignments:

```typescript
// prisma/seed.ts
const EXTERNAL_SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000099'
const EXTERNAL_ACCOUNT_ID = '00000000-0000-0000-0000-000000000020'

await prisma.user.upsert({
  where: { id: EXTERNAL_SYSTEM_USER_ID },
  update: {},
  create: {
    id: EXTERNAL_SYSTEM_USER_ID,
    name: 'PTG Integration',
    email: 'ptg-system@protocall.internal',
    role: 'supervisor',
    accountId: EXTERNAL_ACCOUNT_ID,
  },
})
```

### User External ID Field

```prisma
// prisma/schema.prisma
model User {
  id         String  @id @default(uuid())
  externalId String? @unique  // PTG user ID mapping
  // ...
}
```

## Prevention Strategies

### 1. Always Use Timing-Safe Comparison for Secrets

```typescript
// WRONG - vulnerable to timing attacks
if (apiKey === expectedKey) { ... }

// CORRECT - constant time comparison
if (apiKey.length !== expectedKey.length) return false
return timingSafeEqual(Buffer.from(apiKey), Buffer.from(expectedKey))
```

### 2. Validate API Key First, Always

Every external endpoint must validate before any other logic:

```typescript
export async function GET(request: NextRequest) {
  // FIRST LINE of every external endpoint
  if (!validateApiKey(request)) {
    return apiError({ type: 'UNAUTHORIZED', message: 'Invalid or missing API key' }, 401)
  }

  // Now safe to proceed...
}
```

### 3. Never Auto-Create Users from External API

External API should fail fast if user doesn't exist. User provisioning is a separate admin concern:

```typescript
// WRONG - security risk, data quality issues
if (!user) {
  user = await prisma.user.create({ data: { externalId, name: 'Unknown' } })
}

// CORRECT - explicit failure
if (!user) {
  return notFound(`User with external ID '${externalUserId}' not found. Create user first via your admin system.`)
}
```

### 4. Isolate External API from Internal Changes

External routes should:
- Have their own response mappers (not share with internal API)
- Use stable field names (even if internal naming changes)
- Version if breaking changes are needed

## Usage Examples

### List Scenarios (PTG)

```bash
curl -H "X-API-Key: $EXTERNAL_API_KEY" \
  https://proto-trainer.example.com/api/external/scenarios
```

Response:
```json
{
  "ok": true,
  "data": {
    "scenarios": [
      {
        "id": "uuid-here",
        "name": "Active Listening Practice",
        "description": "Practice reflective listening techniques",
        "mode": "phone",
        "category": "cohort_training",
        "skill": "active_listening",
        "skills": ["active_listening", "empathy"],
        "difficulty": "beginner",
        "estimatedTime": 15
      }
    ]
  }
}
```

### Create Assignment

```bash
curl -X POST \
  -H "X-API-Key: $EXTERNAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"user_id": "ptg-user-123", "scenario_id": "uuid-here"}' \
  https://proto-trainer.example.com/api/external/assignments
```

### Get Evaluation Result

```bash
curl -H "X-API-Key: $EXTERNAL_API_KEY" \
  https://proto-trainer.example.com/api/external/assignments/uuid-here/result
```

Response:
```json
{
  "ok": true,
  "data": {
    "result": {
      "assignmentId": "assignment-uuid",
      "simulationId": "scenario-uuid",
      "counselorId": "ptg-user-123",
      "score": 85,
      "feedback": "Strengths: Good use of reflective listening...\n\nAreas to Improve: Consider...",
      "completedAt": "2026-01-22T15:30:00.000Z",
      "skills": [
        { "skill": "active_listening", "score": 85, "notes": "Good use of..." }
      ]
    }
  }
}
```

## Files Changed

| File | Change |
|------|--------|
| `src/app/api/external/scenarios/route.ts` | GET scenarios with mode/category (commit 3de8705) |
| `src/app/api/external/assignments/route.ts` | GET/POST assignments with duplicate prevention |
| `src/app/api/external/assignments/[id]/result/route.ts` | GET evaluation results |
| `prisma/schema.prisma` | Added User.externalId, Scenario.skill/difficulty/estimatedTime |
| `prisma/seed.ts` | Added PTG system user and account |
| `.env.example` | Added EXTERNAL_API_KEY |

## Related Documentation

- [Auth Type Consistency Fixes](./auth-type-consistency-fixes.md)
- [API-Frontend Contract Mismatch](./api-frontend-contract-mismatch-bulk-assignments.md)
