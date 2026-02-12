---
title: Schema Fallthrough Creates Orphan Data
category: prevention-strategies
date: 2026-02-12
component: API Routes
tags: [zod, validation, dual-schema, data-integrity]
severity: medium
detection: code-review (7-agent parallel review)
---

## Problem

When using a dual-schema fallthrough pattern in Zod validation, an invalid request can bypass the extended schema and silently succeed with the base schema, creating orphan records.

**Real example**: In `POST /api/scenarios`, sending `{ isOneTime: true, assignTo: null }` fails the `createOneTimeScenarioWithAssignmentSchema` check, then silently succeeds with `createScenarioSchema`, creating a one-time scenario with no assignment. The scenario is invisible on the global tab and inaccessible to all counselors.

## Root Cause

The fallthrough pattern assumes the base schema is a safe subset of the extended schema:

```typescript
// RISKY: Assumes base schema is subset of extended
const oneTimeResult = createOneTimeScenarioWithAssignmentSchema.safeParse(body);
if (!oneTimeResult.success) {
  const result = createScenarioSchema.safeParse(body);
  if (!result.success) return apiError(...);
  // Silently proceeds with base schema ❌
}
```

If a field in the request contradicts the fallthrough logic (e.g., `isOneTime: true` explicitly sent), the base schema may accept it without validation, violating invariants.

## Solution

Add an explicit guard after the extended schema check. If the request signals one-time intent but validation failed, reject it immediately:

```typescript
const oneTimeResult = createOneTimeScenarioWithAssignmentSchema.safeParse(body);
if (!oneTimeResult.success) {
  // GUARD: If one-time was explicitly requested, reject
  if (body.isOneTime === true) {
    const details = oneTimeResult.error?.flatten().fieldErrors;
    return apiError(
      {
        type: 'VALIDATION_ERROR',
        message: 'One-time scenarios require a valid assignTo (learner UUID)',
        details,
      },
      400
    );
  }

  // Only fall through for base schema if one-time NOT requested
  const result = createScenarioSchema.safeParse(body);
  if (!result.success) return apiError(...);
}
```

## Prevention Pattern

**Rule**: When using dual-schema fallthrough, always add an explicit guard that rejects requests signaling intent for the extended schema if extended validation fails.

```typescript
// Template
if (body.flagRequiresExtendedSchema) { // e.g., isOneTime, hasAttachment, needsApproval
  if (!extendedResult.success) {
    return apiError({ type: 'VALIDATION_ERROR', ... }, 400);
  }
} else {
  if (!baseResult.success) {
    return apiError({ type: 'VALIDATION_ERROR', ... }, 400);
  }
}
```

## Related

- **#038 - Hardcoded category options**: Also uses dual validation (frontend vs. backend)
- **#039 - Evaluator context non-atomic persistence**: Risk of partial writes without transaction
- **Bug Prevention Pattern #3 - Orphaned Records**: Cascading deletes; this is the inverse (orphaned creates)
