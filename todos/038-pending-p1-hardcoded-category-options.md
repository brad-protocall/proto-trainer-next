---
status: pending
priority: p1
issue_id: "038"
tags: [code-review, quality, architecture]
dependencies: []
---

# Hardcoded category options violates CLAUDE.md bug prevention pattern

## Problem Statement
`CATEGORY_OPTIONS` in `generate-scenario-modal.tsx` is hardcoded with 8 values. `ScenarioCategoryValues` is imported but NEVER USED (lint warning). CLAUDE.md Bug Prevention Patterns (2026-01-21) explicitly documents this exact anti-pattern: "Frontend `VALID_CATEGORIES` didn't match backend `ScenarioCategorySchema`. Prevention: Export enum values from `validators.ts` as single source of truth." This means any future category added to the backend schema will silently be missing from the generate modal dropdown, leading to inconsistency between what the API accepts and what the UI offers.

## Findings
- File: `src/components/generate-scenario-modal.tsx`, lines 5, 9-19
- `ScenarioCategoryValues` is imported on line 5 but never referenced in the component body
- `CATEGORY_OPTIONS` is a hand-maintained array of 8 `{ value, label }` objects
- This is the same bug class documented in CLAUDE.md section "Category/Enum Validation Mismatch"
- ESLint will flag the unused import as a warning

## Proposed Solutions
### Option A: Derive CATEGORY_OPTIONS from ScenarioCategoryValues with a label formatter
- Replace the hardcoded array with a `.map()` over `ScenarioCategoryValues` that formats labels via `replace(/_/g, ' ')` and title-casing
- Pros: Single source of truth, zero maintenance, follows documented pattern
- Cons: Auto-generated labels may need manual polish for edge cases (e.g., "free_practice" -> "Free Practice" is fine)
- Effort: Small
- Risk: Low

### Option B: Add a CATEGORY_LABELS constant exported from validators.ts
- Create a `Record<ScenarioCategory, string>` map in `validators.ts` that pairs each enum value with a display label
- Pros: Full control over display names, single source of truth
- Cons: Slightly more code in validators.ts, two things to update when adding a category (but both in the same file)
- Effort: Small
- Risk: Low

## Acceptance Criteria
- [ ] `CATEGORY_OPTIONS` is derived from `ScenarioCategoryValues`, not hardcoded
- [ ] Unused import lint warning for `ScenarioCategoryValues` is resolved (it is now used)
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] `npm run lint` passes with zero errors related to this file

## Work Log
| Date | Action | Notes |
|------|--------|-------|
| 2026-02-10 | Created | Code review finding |

## Resources
- Branch: ralph/scenario-generation-from-complaint
- CLAUDE.md Bug Prevention Patterns (2026-01-21): Category/Enum Validation Mismatch
