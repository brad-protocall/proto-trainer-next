---
status: pending
priority: p1
issue_id: "019"
tags: [code-review, typescript, types]
dependencies: []
---

# TranscriptTurn Type Field Name Mismatch

## Problem Statement

The `TranscriptTurn` interface in `src/types/index.ts` uses snake_case fields (`turn_index`, `created_at`) but the hooks use camelCase (`turnOrder`, `createdAt`). This causes TypeScript errors and potential runtime issues.

**Why it matters**: Type safety is broken, could cause runtime errors when persisting transcripts.

## Findings

**Source**: TypeScript Reviewer, Data Integrity Guardian

**types/index.ts** (line 148-155):
```typescript
export interface TranscriptTurn {
  id: string;
  session_id: string;  // snake_case
  role: TranscriptRole;
  content: string;
  turn_index: number;  // snake_case
  created_at: string;  // snake_case
}
```

**use-realtime-voice.ts** usage:
```typescript
const turn: TranscriptTurn = {
  id: `assistant_${Date.now()}`,
  role: "assistant",
  content: currentTranscriptRef.current,
  createdAt: new Date(),  // camelCase - MISMATCH
  turnOrder: turnIndexRef.current++,  // camelCase - MISMATCH
};
```

## Proposed Solutions

### Option A: Update types to match database (snake_case) (Recommended)
**Pros**: Consistent with Prisma/DB, less transformation
**Cons**: Different from JS conventions
**Effort**: Small
**Risk**: Low

### Option B: Create frontend-specific types (camelCase)
**Pros**: JS conventions, transform at API boundary
**Cons**: Duplicate types, more transformation code
**Effort**: Medium
**Risk**: Low

### Option C: Use type transformers
**Pros**: Automatic conversion
**Cons**: Runtime overhead, complexity
**Effort**: Medium
**Risk**: Medium

## Recommended Action

<!-- Filled during triage -->

## Technical Details

**Affected Files**:
- `src/types/index.ts` - Type definition
- `src/hooks/use-realtime-voice.ts` - Uses TranscriptTurn
- `src/hooks/use-chat.ts` - Uses TranscriptTurn

**Fields to align**:
- `turn_index` ↔ `turnOrder`
- `created_at` ↔ `createdAt`
- `session_id` (may or may not be needed)

## Acceptance Criteria

- [ ] TranscriptTurn type is consistent
- [ ] No TypeScript errors in hooks
- [ ] Transcripts persist correctly to database
- [ ] Build passes with strict mode

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-19 | Created from code review | snake_case vs camelCase convention mismatch |

## Resources

- Prisma schema uses snake_case
- API responses use snake_case
