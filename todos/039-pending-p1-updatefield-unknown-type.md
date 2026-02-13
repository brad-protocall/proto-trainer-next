---
status: pending
priority: p1
issue_id: "039"
tags: [code-review, quality, typescript]
dependencies: []
---

# updateField uses `unknown` value type, no type safety

## Problem Statement
`updateField(field: keyof EditableScenario, value: unknown)` accepts any value for any field with no TypeScript enforcement. Calling `updateField("title", 42)` or `updateField("difficulty", [1, 2, 3])` compiles without error. This is effectively `any` with extra steps, defeating the purpose of TypeScript in a typed codebase. Bugs from wrong value types will only surface at runtime.

## Findings
- File: `src/components/generate-scenario-modal.tsx`, line 175
- The function signature is `(field: keyof EditableScenario, value: unknown)`
- `unknown` requires explicit type narrowing before use, but the function body likely just assigns directly via spread or setState
- No runtime validation exists to catch type mismatches
- This pattern makes refactoring EditableScenario fields error-prone since the compiler cannot catch callers passing wrong types

## Proposed Solutions
### Option A: Use generic constraint on updateField
- Change signature to `<K extends keyof EditableScenario>(field: K, value: EditableScenario[K])`
- TypeScript will enforce that the value matches the field's declared type
- Pros: Minimal change, maximum type safety, compiler catches all mismatches
- Cons: None significant
- Effort: Small
- Risk: Low

### Option B: Eliminate EditableScenario, use GeneratedScenario + separate mode state
- Remove the intermediate `EditableScenario` type and `updateField` entirely
- Use `GeneratedScenario` directly with individual setter functions or a reducer
- Pros: Cleaner architecture, no generic helper needed
- Cons: More refactoring, may require rethinking component state management
- Effort: Medium
- Risk: Low

## Acceptance Criteria
- [ ] `updateField` is either type-safe (generic constraint) or eliminated entirely
- [ ] Calling `updateField("title", 42)` produces a TypeScript compile error
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] No uses of `unknown` or `any` for field value types in this component

## Work Log
| Date | Action | Notes |
|------|--------|-------|
| 2026-02-10 | Created | Code review finding |

## Resources
- Branch: ralph/scenario-generation-from-complaint
