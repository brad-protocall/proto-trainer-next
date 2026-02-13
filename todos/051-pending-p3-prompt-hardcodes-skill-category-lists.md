---
status: pending
priority: p3
issue_id: "051"
tags: [code-review, maintenance]
dependencies: []
---

# Prompt hardcodes skill and category lists

## Problem Statement
In `prompts/scenario-generator.txt` (lines 53-83), all 15 skills and 8 categories are listed as literal text in the prompt. If skills or categories change in code (`skills.ts`, `validators.ts`), the prompt will go stale. The risk is low because `zodResponseFormat` validates the LLM output against the schema regardless, so invalid values would be caught. However, a stale prompt could cause the LLM to suggest skills/categories that no longer exist, wasting tokens on retries or falling back to defaults.

## Proposed Solutions
For now, add a comment at the top of the prompt file noting the dependency on `src/lib/skills.ts` and `src/lib/validators.ts`. In the future, consider template injection via `loadPromptWithVariables()` to dynamically insert the current skill and category lists.

## Acceptance Criteria
- [ ] Comment added to `prompts/scenario-generator.txt` noting the sync requirement with `skills.ts` and `validators.ts`

## Work Log
| Date | Action | Notes |
|------|--------|-------|
| 2026-02-10 | Created | Code review finding |

## Resources
- Branch: ralph/scenario-generation-from-complaint
