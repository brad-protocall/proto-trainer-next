---
status: pending
priority: p2
issue_id: "044"
tags: [code-review, security, validation]
dependencies: []
---

# No max length on generatedScenarioSchema fields

## Problem Statement
The `generatedScenarioSchema` in `validators.ts` (lines 195-202) has no `.max()` constraints on `description`, `prompt`, or `evaluatorContext` fields. A runaway LLM response or user edit in the modal could produce unbounded strings that bloat the database or cause downstream failures. Additionally, `evaluatorContext` in `createScenarioSchema` has no `.max()` constraint, even though the external API already enforces `.max(5000)` -- creating an inconsistency where the internal path is less validated than the external one.

## Findings
- `generatedScenarioSchema` fields `description`, `prompt`, `evaluatorContext` are all `z.string()` with no max
- `createScenarioSchema.evaluatorContext` also lacks `.max()`, but `POST /api/external/scenarios` has `.max(5000)`
- `skills` array has no `.max()` on array length -- could theoretically receive hundreds of skills
- External API is more strictly validated than internal paths, which is backwards
- OpenAI structured output could return very long strings if the prompt doesn't constrain length

## Proposed Solutions
### Option A: Add max constraints to all schemas
- `description`: `.max(2000)` -- descriptions should be concise
- `prompt`: `.max(10000)` -- prompts can be longer but still bounded
- `evaluatorContext`: `.max(5000)` -- match external API constraint
- `skills` array: `.max(10)` -- no scenario needs more than 10 skills
- Also add `.max(5000)` to `createScenarioSchema.evaluatorContext`
- Pros: Consistent validation across all paths, prevents unbounded storage
- Cons: Could reject legitimately long prompts if limits are too tight
- Effort: Small
- Risk: Low

## Acceptance Criteria
- [ ] `generatedScenarioSchema` has `.max()` on `description`, `prompt`, `evaluatorContext`
- [ ] `generatedScenarioSchema` has `.max()` on `skills` array length
- [ ] `createScenarioSchema.evaluatorContext` has `.max(5000)` matching external API
- [ ] `npx tsc --noEmit` passes
- [ ] Validation errors return clear messages indicating which field exceeded the limit

## Work Log
| Date | Action | Notes |
|------|--------|-------|
| 2026-02-10 | Created | Code review finding |

## Resources
- Branch: ralph/scenario-generation-from-complaint
- File: `src/lib/validators.ts`, lines 195-202
- Related: `POST /api/external/scenarios` has `.max(5000)` on `evaluator_context`
