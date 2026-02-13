---
status: pending
priority: p2
issue_id: "047"
tags: [code-review, simplicity]
dependencies: []
---

# EditableScenario interface is unnecessary indirection

## Problem Statement
The `EditableScenario` interface in `generate-scenario-modal.tsx` (lines 46-54) duplicates all fields from `GeneratedScenario` and adds only `mode`. This requires a manual field-by-field copy block (lines 111-119) every time a scenario is generated, creating maintenance overhead and a risk of missing fields if `GeneratedScenario` is extended. The `mode` field could simply be separate state.

## Findings
- `EditableScenario` has all fields from `GeneratedScenario` plus `mode`
- Lines 111-119 manually copy `title`, `description`, `prompt`, `evaluatorContext`, `category`, `difficulty`, `estimatedTime`, `skills` from generated result to editable state
- If a new field is added to `GeneratedScenario`, the copy block must be updated or the field is silently lost
- `mode` is not part of the generated output -- it's a UI-only selection
- This is ~20 lines of code that could be ~3 lines

## Proposed Solutions
### Option A: Use GeneratedScenario directly with separate mode state
- Replace `EditableScenario` with `GeneratedScenario` for the scenario state
- Add `const [mode, setMode] = useState<ScenarioMode>('phone')` as separate state
- Remove the field-by-field copy block -- just `setScenario(result)`
- Pros: ~15 lines removed, no drift risk, simpler mental model
- Cons: Two pieces of state instead of one (trivial)
- Effort: Small
- Risk: Low

### Option B: Use intersection type
- `type EditableScenario = GeneratedScenario & { mode: ScenarioMode }`
- Pros: Single state object, no field duplication
- Cons: Still need spread + mode assignment, less clean than Option A
- Effort: Small
- Risk: Low

## Acceptance Criteria
- [ ] `EditableScenario` interface removed or replaced with derived type
- [ ] No manual field-by-field copy between generated and editable state
- [ ] ~15 lines of code removed
- [ ] `npx tsc --noEmit` passes
- [ ] Generate + edit flow still works correctly in UI

## Work Log
| Date | Action | Notes |
|------|--------|-------|
| 2026-02-10 | Created | Code review finding |

## Resources
- Branch: ralph/scenario-generation-from-complaint
- File: `src/components/generate-scenario-modal.tsx`, lines 46-54 (interface), lines 111-119 (copy block)
