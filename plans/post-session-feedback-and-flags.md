# feat: Post-Session Counselor Feedback & AI Guidance Flags

> **Goal**: Counselors can report issues after any session. AI guidance inconsistent with training material gets flagged for immediate supervisor review.

## Overview

After a voice or chat session (assigned or free practice), the counselor should be able to submit quick feedback: "this wasn't helpful," "the AI gave me bad advice," or "something felt off." When the feedback indicates the AI provided guidance inconsistent with training material, it should be flagged as critical for immediate supervisor review.

This feature introduces a `SessionFlag` model shared by all governance features (user feedback, misuse scanning, consistency checking).

## Problem

- Counselors have no way to report session issues
- If the AI breaks character or gives bad advice, nobody knows unless they manually review the transcript
- No feedback loop between counselors experiencing issues and supervisors who can fix prompts/scenarios

## Proposed Solution

### Shared Data Model: `SessionFlag`

A single model for all governance flags (used by this feature, misuse scanning, and consistency checking):

```prisma
model SessionFlag {
  id          String    @id @default(uuid())
  sessionId   String    @map("session_id")
  type        String    // 'user_feedback' | 'misuse_detected' | 'consistency_issue' | 'ai_guidance_concern'
  severity    String    @default("info")  // 'info' | 'warning' | 'critical'
  source      String    // 'counselor' | 'automated_scan' | 'consistency_check'
  summary     String    // Brief description (e.g., "AI gave medical advice")
  details     String    // Full text: user's feedback or LLM analysis
  status      String    @default("pending") // 'pending' | 'reviewed' | 'dismissed'
  reviewedBy  String?   @map("reviewed_by")
  reviewedAt  DateTime? @map("reviewed_at")
  createdAt   DateTime  @default(now()) @map("created_at")

  session     Session   @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  reviewer    User?     @relation("FlagReviewer", fields: [reviewedBy], references: [id])

  @@index([sessionId])
  @@index([status])
  @@index([severity])
  @@map("session_flags")
}
```

Also add to Session model:
```prisma
model Session {
  // ... existing fields ...
  flags SessionFlag[]    // NEW
}
```

And to User model:
```prisma
model User {
  // ... existing fields ...
  reviewedFlags SessionFlag[] @relation("FlagReviewer")  // NEW
}
```

### API Endpoints

#### `POST /api/sessions/[id]/flag` — Counselor submits feedback

```typescript
// Request
{
  type: 'user_feedback' | 'ai_guidance_concern',
  summary: string,           // "AI gave me medical advice" (required, max 200 chars)
  details?: string,          // Optional longer description
  severity?: 'info' | 'warning' | 'critical'  // Default: 'info'
}

// Response
{ id: string, status: 'pending', severity: string }
```

**Auto-escalation rule**: If `type === 'ai_guidance_concern'`, auto-set `severity: 'critical'` regardless of what the counselor sends. AI giving bad training advice is always critical.

**Auth**: Any authenticated user who owns the session (or supervisors).

#### `GET /api/flags` — Supervisor reviews flags

```typescript
// Query params
?status=pending&severity=critical&limit=50

// Response
{
  flags: [{
    id, sessionId, type, severity, source, summary, status, createdAt,
    session: { id, scenarioTitle, modelType, startedAt, counselorName }
  }]
}
```

**Auth**: Supervisors only.

#### `PATCH /api/flags/[id]` — Supervisor resolves a flag

```typescript
// Request
{ status: 'reviewed' | 'dismissed' }

// Response
{ id, status, reviewedBy, reviewedAt }
```

### Frontend Changes

#### Post-Session Feedback (both voice and chat training views)

After evaluation shows, add a feedback section below the evaluation modal:

```
┌──────────────────────────────────────────────────┐
│ [Evaluation content as usual]                    │
│                                                  │
│ ─────────────────────────────────────            │
│ Was there an issue with this session?            │
│                                                  │
│ [The conversation wasn't helpful]                │
│ [The AI gave guidance inconsistent with training]│ ← auto-critical
│ [Other issue...]                                 │
│                                                  │
│ [Optional: Tell us more _______________]         │
│                                                  │
│ [Submit Feedback]  [Back to Dashboard]           │
└──────────────────────────────────────────────────┘
```

**Files**: `src/components/voice-training-view.tsx`, `src/components/chat-training-view.tsx`

The feedback buttons are pre-set categories. Clicking "AI gave guidance inconsistent with training" auto-fills:
- `type: 'ai_guidance_concern'`
- `summary: 'AI provided guidance inconsistent with training material'`
- `severity: 'critical'` (auto-escalated)

#### Supervisor Flag Review (future — after supervisor Sessions tab exists)

For the prototype, flags are reviewable via `GET /api/flags` API directly. A proper review UI can be built when the supervisor dashboard gets a Sessions tab (deferred from #88).

**Minimum viable supervisor notification**: Add a flag count badge to the supervisor dashboard header: "3 pending flags" linking to a simple list.

## Files Changed

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `SessionFlag` model, add `flags` to Session, add `reviewedFlags` to User |
| `src/types/index.ts` | Add `SessionFlag` interface, add `SessionFlagType`, `FlagSeverity`, `FlagStatus` types |
| `src/lib/validators.ts` | Add `createFlagSchema`, `flagQuerySchema`, `updateFlagSchema` |
| `src/app/api/sessions/[id]/flag/route.ts` | **New**: POST endpoint for counselor feedback |
| `src/app/api/flags/route.ts` | **New**: GET endpoint for supervisor review |
| `src/app/api/flags/[id]/route.ts` | **New**: PATCH endpoint for flag resolution |
| `src/components/voice-training-view.tsx` | Add feedback section below evaluation |
| `src/components/chat-training-view.tsx` | Add feedback section below evaluation |
| `src/components/supervisor-dashboard.tsx` | Add pending flags badge/count in header |

## Acceptance Criteria

- [ ] `SessionFlag` model exists in schema
- [ ] Counselor can submit feedback after any session (voice or chat, assigned or free practice)
- [ ] "AI guidance concern" flags are auto-escalated to `severity: critical`
- [ ] `GET /api/flags?status=pending` returns flags for supervisors
- [ ] Supervisor can mark flags as reviewed or dismissed
- [ ] Supervisor dashboard shows count of pending flags
- [ ] `npx tsc --noEmit` passes
- [ ] `npm run lint` passes

## Dependencies

- Depends on: #87 (evaluation persistence — feedback UI appears after evaluation)
- Shared model with: Misuse Scanning, Prompt Consistency Checking

## Sequencing

Build after #87 and #88. The `SessionFlag` model should be created in this issue since it's the shared foundation for all governance features.
