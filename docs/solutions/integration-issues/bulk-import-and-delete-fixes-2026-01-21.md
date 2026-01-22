# Bulk Import and Delete Operation Fixes

---
title: "Bulk Import and Delete Operation Fixes"
date: 2026-01-21
severity: P1
category: integration-issues
components:
  - bulk-import-modal.tsx
  - supervisor-dashboard.tsx
  - api/scenarios/import
  - api/assignments
symptoms:
  - "Bulk import shows 41 validation errors for valid data"
  - "Delete button does nothing (silent failure)"
  - "Failed to load assignments error"
  - "Import button unresponsive"
root_causes:
  - "Frontend validation constants out of sync with backend enum"
  - "Parsing JSON from 204 No Content response"
  - "Orphaned assignments referencing deleted scenarios"
  - "Missing x-user-id auth header in fetch call"
commits:
  - "31f0b22"
  - "26cc4d6"
  - "bd8b45a"
related:
  - "docs/solutions/integration-issues/api-frontend-contract-mismatch-bulk-assignments.md"
  - "docs/solutions/integration-issues/auth-type-consistency-fixes.md"
---

## Summary

Five related bugs were discovered during user testing of the bulk scenario import feature. All were caused by API-frontend contract mismatches or missing synchronization between layers.

## Problems Solved

### 1. Category Validation Mismatch

**Symptom:** Bulk import showed 41 validation errors for all scenarios with `cohort_training` category.

**Root Cause:** `VALID_CATEGORIES` array in `bulk-import-modal.tsx` contained outdated values:
```typescript
// OLD (broken)
const VALID_CATEGORIES = ["onboarding", "refresher", "advanced", "assessment", ""];

// NEW (fixed)
const VALID_CATEGORIES = ["cohort_training", "onboarding", "expert_skill_path", "account_specific", ""];
```

**Fix:** Updated `VALID_CATEGORIES`, `CSV_TEMPLATE`, and error message to use new category values.

**Commit:** `31f0b22`

---

### 2. DELETE 204 No Content Handling

**Symptom:** Delete buttons for scenarios and assignments appeared to do nothing.

**Root Cause:** DELETE endpoints correctly return HTTP 204 No Content. The frontend tried to parse JSON from the empty response body:
```typescript
// OLD (broken)
const response = await authFetch(`/api/scenarios/${id}`, { method: "DELETE" });
const data: ApiResponse<null> = await response.json();  // Fails on 204!
if (!data.ok) throw new Error(data.error.message);

// NEW (fixed)
const response = await authFetch(`/api/scenarios/${id}`, { method: "DELETE" });
if (!response.ok) {
  const data = await response.json();
  throw new Error(data.error?.message || "Delete failed");
}
```

**Fix:** Check `response.ok` for success; only parse JSON on error responses.

**Commit:** `26cc4d6`

---

### 3. Orphaned Assignments Causing API Crash

**Symptom:** "Failed to load assignments" error in counselor dashboard.

**Root Cause:** Assignments in the database referenced scenarios that had been deleted. The Prisma query with `include: { scenario: { select: { title: true } } }` failed when the referenced scenario didn't exist.

**Fix:** Cleaned up orphaned data:
```sql
DELETE FROM assignments WHERE scenario_id NOT IN (SELECT id FROM scenarios);
```

**Prevention:** The schema has `onDelete: Restrict` on scenarios, but direct SQL deletion bypassed Prisma. Consider:
- Always use Prisma for deletions
- Add pre-delete checks in API routes
- Consider soft deletes

---

### 4. Missing Auth Header in Bulk Import

**Symptom:** "Import 41 Scenarios" button did nothing when clicked.

**Root Cause:** `handleImport` function used raw `fetch()` without the `x-user-id` authentication header:
```typescript
// OLD (broken)
const response = await fetch("/api/scenarios/import", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ scenarios: apiScenarios }),
});

// NEW (fixed)
const headers: Record<string, string> = { "Content-Type": "application/json" };
if (userId) {
  headers["x-user-id"] = userId;
}
const response = await fetch("/api/scenarios/import", {
  method: "POST",
  headers,
  body: JSON.stringify({ scenarios: apiScenarios }),
});
```

**Fix:** Added `userId` prop to `BulkImportModal` and included it in request headers.

**Commit:** `bd8b45a`

---

## Prevention Strategies

### 1. Single Source of Truth for Enums

Export category values from `validators.ts` and derive all validation arrays from it:

```typescript
// In validators.ts
export const ScenarioCategoryValues = ['cohort_training', 'onboarding', 'expert_skill_path', 'account_specific'] as const;
export const ScenarioCategorySchema = z.enum(ScenarioCategoryValues);

// In bulk-import-modal.tsx
import { ScenarioCategoryValues } from '@/lib/validators';
const VALID_CATEGORIES = [...ScenarioCategoryValues, ""];
```

### 2. Standard DELETE Response Handling

Create a utility or establish a pattern:
```typescript
async function handleDeleteResponse(response: Response): Promise<void> {
  if (response.status === 204) return; // Success, no content
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error?.message || "Delete failed");
  }
}
```

### 3. Centralized Auth Context

Create `AuthProvider` to provide `authFetch` to all components:
```typescript
const { authFetch } = useAuth();
// All API calls use authFetch, never raw fetch
```

### 4. Pre-Delete Validation

Check for dependent records before allowing deletion:
```typescript
const dependentCount = await prisma.assignment.count({
  where: { scenarioId: id, status: { not: 'completed' } }
});
if (dependentCount > 0) {
  return apiError({ type: 'CONFLICT', message: `Cannot delete: ${dependentCount} active assignments exist` }, 409);
}
```

## Pre-Completion Checklist

Before marking any API-related task complete:

```bash
npx tsc --noEmit          # Zero type errors
npm run lint              # Zero lint errors
grep -r "oldValue" src/   # Zero references to renamed things
```

## Files Changed

| File | Change |
|------|--------|
| `src/components/bulk-import-modal.tsx` | Updated VALID_CATEGORIES, CSV_TEMPLATE, error message; added userId prop and auth header |
| `src/components/supervisor-dashboard.tsx` | Fixed handleDelete and handleDeleteAssignment to handle 204; passed userId to BulkImportModal |

## Related Documentation

- [API-Frontend Contract Mismatch - Bulk Assignments](./api-frontend-contract-mismatch-bulk-assignments.md)
- [Auth Type Consistency Fixes](./auth-type-consistency-fixes.md)
