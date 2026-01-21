---
title: API-Frontend Contract Mismatch in Bulk Assignments
category: integration-issues
severity: medium
components:
  - src/app/api/assignments/route.ts
  - src/components/supervisor-dashboard.tsx
  - src/types/index.ts
symptoms:
  - User cannot see which assignments were blocked/skipped
  - Modal closes too quickly to read feedback
  - TypeScript doesn't catch field name mismatches
root_cause: Same-session naming inconsistency between API response and frontend expectation
tags:
  - api-contract
  - naming-conventions
  - modal-ux
  - typescript-types
  - ralph-automation
date_solved: 2025-01-20
autonomous_session: true
---

# API-Frontend Contract Mismatch in Bulk Assignments

## Problem Summary

During an overnight autonomous (Ralph) session implementing duplicate assignment prevention, three related bugs were introduced:

1. **API field naming mismatch**: API returned `skippedPairs` but frontend expected `blocked`
2. **Modal auto-close hiding feedback**: Modal closed after 1500ms regardless of whether blocked assignments needed user attention
3. **TypeScript types incomplete**: `BulkAssignmentResponse` missing `warnings`, `requiresConfirmation`, `message` fields

## Symptoms Observed

- When assigning a scenario to 5 counselors where 1 already had it, the modal closed immediately
- User reported: "It didn't give me the message; it just passed so quickly"
- Repeated single assignments showed no feedback - user couldn't tell if assignment went through
- No TypeScript errors caught the mismatch because types were incomplete

## Root Cause Analysis

### 1. Naming Mismatch (skippedPairs vs blocked)

The API route was modified to add duplicate detection. When building the response:

```typescript
// API route built this response (assignments/route.ts:325-329)
const responseData: BulkAssignmentResponse = {
  created: assignmentsToCreate.length,
  skipped: blockedPairs.length,
  skippedPairs: blockedPairs,  // Used variable name for property
}
```

But the frontend component expected (supervisor-dashboard.tsx:1261):
```typescript
{bulkResult.blocked && bulkResult.blocked.length > 0 && (
  // Display blocked assignments
)}
```

**Why this happened**: The agent made a reasonable naming decision (`skippedPairs` is descriptive) without checking existing frontend code that already used `blocked`.

### 2. Modal Auto-Close

The original implementation auto-closed on any response:

```typescript
// Always ran, even with blocked assignments
setTimeout(() => {
  setShowAssignmentForm(false);
  setBulkResult(null);
  // ... reset state
}, 1500);
```

**Why this happened**: The agent optimized for the "happy path" without considering that partial success requires user attention.

### 3. Incomplete TypeScript Types

The `BulkAssignmentResponse` interface only had:
```typescript
export interface BulkAssignmentResponse {
  created: number;
  skipped: number;
  skippedPairs?: Array<{ scenarioId: string; counselorId: string }>;
}
```

Missing: `blocked`, `warnings`, `requiresConfirmation`, `message`, `reason` field in array items.

**Why this happened**: Types were updated incrementally as features were added, without holistic review.

## Solution Applied

### Fix 1: Consistent Naming (API → blocked)

```typescript
// src/app/api/assignments/route.ts
const responseData: BulkAssignmentResponse = {
  created: assignmentsToCreate.length,
  skipped: blockedPairs.length,
  blocked: blockedPairs,  // Changed to match frontend expectation
}
```

### Fix 2: Conditional Auto-Close

```typescript
// src/components/supervisor-dashboard.tsx
const hasBlocked = data.data.blocked && data.data.blocked.length > 0;
const hasSkipped = data.data.skipped > 0;

if (!hasBlocked && !hasSkipped) {
  // Full success - auto-close after short delay
  setTimeout(() => {
    setShowAssignmentForm(false);
    // ... reset state
  }, 1500);
}
// If blocked/skipped, keep modal open for user to see feedback
```

### Fix 3: Complete Type Definition

```typescript
// src/types/index.ts
export interface BulkAssignmentResponse {
  created: number;
  skipped: number;
  blocked?: Array<{ scenarioId: string; counselorId: string; reason: string }>;
  warnings?: Array<{ scenarioId: string; counselorId: string; reason: string }>;
  requiresConfirmation?: boolean;
  message?: string;
  assignments?: AssignmentResponse[];
}
```

## Prevention Strategies for Autonomous Agents

### Pre-Change Checklist

Before renaming ANY property in an API response:

```bash
# 1. Search for all usages of the property name
grep -r "propertyName" src/ --include="*.ts" --include="*.tsx"

# 2. Document ALL files that reference it

# 3. Make changes in ALL files atomically

# 4. Verify no old references remain
grep -r "oldPropertyName" src/
```

### UX Decision Framework

Before implementing auto-close/auto-dismiss:

| Feedback Type | Auto-Close? | Timing |
|--------------|-------------|--------|
| Pure success, no details | Yes | 1.5s |
| Success with details to read | No or 5s+ | - |
| Partial success | No | Manual close |
| Error | No | Manual close |

Calculate minimum reading time:
```
words ÷ 200 (words/min) × 60 × 1000 = minimum ms
```

### Type Safety Protocol

1. **Update types FIRST** before changing implementation
2. **Run `npx tsc --noEmit`** after every file change
3. **Never use `any`** for API responses
4. **Use Zod schemas** that generate TypeScript types

### Completion Verification

Before marking any API/frontend integration work complete:

```bash
# All must pass
npx tsc --noEmit              # Type checking
npm run lint                   # Linting
grep -r "oldName" src/         # Should return nothing
```

## Test Cases to Add

```typescript
// Contract test - ensures API and frontend agree
describe('Bulk Assignment API Contract', () => {
  it('returns blocked array (not skippedPairs)', async () => {
    const response = await createBulkAssignment(/* with duplicate */);
    expect(response).toHaveProperty('blocked');
    expect(response).not.toHaveProperty('skippedPairs');
  });
});

// UX test - ensures feedback is visible
describe('Assignment Modal', () => {
  it('stays open when assignments are blocked', async () => {
    mockApiResponse({ created: 0, skipped: 1, blocked: [/*...*/] });
    await submitForm();
    await delay(2000);
    expect(modal).toBeVisible(); // Should NOT auto-close
  });
});
```

## Related Documentation

- [Auth Type Consistency Fixes](./auth-type-consistency-fixes.md) - Previous camelCase/snake_case issues
- [Ralph Overnight Automation](../../scripts/overnight-loop.sh) - Automation process

## Key Lessons for Ralph

1. **Search before renaming** - Always grep for existing usages before changing property names
2. **Consider all code paths** - Success, partial success, and error paths all need handling
3. **Types are documentation** - Keep them complete and accurate; they catch contract mismatches
4. **UX requires user perspective** - Auto-close is convenient until it hides important information
5. **Atomic changes** - API and frontend contract changes must be made together

---

*Documented 2025-01-20 after overnight autonomous session introduced these bugs*
