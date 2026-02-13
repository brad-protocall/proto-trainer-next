---
status: pending
priority: p3
issue_id: "050"
tags: [code-review, quality]
dependencies: []
---

# Skills max 10 in modal vs prompt says 1-5

## Problem Statement
In `src/components/generate-scenario-modal.tsx` (line 188), `toggleSkill` caps the selected skills at 10, which matches `SkillsArraySchema`. However, the generation prompt instructs the LLM to pick "1-5 from this list." The 10 limit may be intentional to allow supervisors to add more skills during the review/edit step, but the discrepancy is undocumented and could confuse future developers.

## Proposed Solutions
Add a comment near the `toggleSkill` cap explaining why the modal allows 10 skills when the prompt says 5. The rationale is that the LLM generates 1-5, but the supervisor can add more during review before saving.

## Acceptance Criteria
- [ ] Comment added near the skills cap in `generate-scenario-modal.tsx` explaining the rationale for allowing 10 when the prompt requests 1-5

## Work Log
| Date | Action | Notes |
|------|--------|-------|
| 2026-02-10 | Created | Code review finding |

## Resources
- Branch: ralph/scenario-generation-from-complaint
