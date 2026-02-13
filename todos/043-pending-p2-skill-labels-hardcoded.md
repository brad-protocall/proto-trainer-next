---
status: pending
priority: p2
issue_id: "043"
tags: [code-review, quality]
dependencies: []
---

# SKILL_LABELS hardcoded instead of derived

## Problem Statement
The `SKILL_LABELS` mapping in `generate-scenario-modal.tsx` (lines 21-37) is a 15-entry object that exactly matches the output of `skill.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())` for every single entry. There are no exceptions or special cases. If skills change in `skills.ts`, this mapping silently drifts out of sync with no compiler warning.

## Findings
- `SKILL_LABELS` has 15 entries, each a trivial title-case transformation of the kebab-case key
- No entry deviates from the algorithmic transformation (e.g., no "CBT" or "PTSD" that would require manual override)
- `src/lib/skills.ts` is the canonical source of skill definitions but is not referenced
- If a skill is added to or removed from `skills.ts`, the label map will silently be wrong

## Proposed Solutions
### Option A: Replace with formatter function
- Define a 3-line `formatSkillLabel(skill: string): string` function that does the title-case transformation
- Pros: Zero maintenance, impossible to drift, removes ~20 lines
- Cons: If a skill ever needs a non-standard label (e.g., "CBT" not "Cbt"), need to add an override map
- Effort: Small
- Risk: Low

### Option B: Export label mapping from src/lib/skills.ts
- Add a `SKILL_LABELS` export to `skills.ts` as the single source of truth
- Pros: Centralizes skill metadata, allows manual overrides for special cases
- Cons: Still a manual mapping that could drift from the skill list itself
- Effort: Small
- Risk: Low

## Acceptance Criteria
- [ ] `SKILL_LABELS` derived algorithmically or imported from shared source
- [ ] No hardcoded label mapping in `generate-scenario-modal.tsx`
- [ ] `npx tsc --noEmit` passes
- [ ] Labels display correctly in the UI for all skills

## Work Log
| Date | Action | Notes |
|------|--------|-------|
| 2026-02-10 | Created | Code review finding |

## Resources
- Branch: ralph/scenario-generation-from-complaint
- File: `src/components/generate-scenario-modal.tsx`, lines 21-37
- Related: `src/lib/skills.ts`
