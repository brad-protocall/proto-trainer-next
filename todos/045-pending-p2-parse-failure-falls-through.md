---
status: pending
priority: p2
issue_id: "045"
tags: [code-review, quality, ux]
dependencies: []
---

# parse_failure falls through to generic 500

## Problem Statement
In the generate endpoint (`route.ts`, lines 32-40), only the `refusal` error type from `ScenarioGenerationError` is caught explicitly with a user-friendly message. A `parse_failure` error (when the LLM returns valid JSON that fails Zod validation) falls through to `handleApiError`, which returns a generic 500 "Internal server error" to the user. This provides no actionable guidance -- the user doesn't know if they should retry or if something is fundamentally broken.

## Findings
- `generateScenario()` can throw `ScenarioGenerationError` with type `refusal` or `parse_failure`
- The catch block only checks `error.type === 'refusal'` and returns 422
- `parse_failure` falls through to the generic error handler
- A `parse_failure` is typically transient (LLM returned slightly wrong structure) and retrying usually works
- Users seeing "Internal server error" are likely to assume the feature is broken rather than retry

## Proposed Solutions
### Option A: Add explicit parse_failure handler
- Add a second branch: `if (error.type === 'parse_failure')` returning 502 with message "AI generated an unexpected response format. Please try again."
- 502 (Bad Gateway) is semantically correct -- the upstream AI service returned an unusable response
- Pros: User gets actionable guidance, correct HTTP semantics
- Cons: None significant
- Effort: Small
- Risk: Low

### Option B: Handle all ScenarioGenerationError types generically
- Catch any `ScenarioGenerationError` and return a user-friendly message based on type
- Pros: Future-proof if more error types are added
- Cons: May mask new error types that need different handling
- Effort: Small
- Risk: Low

## Acceptance Criteria
- [ ] `parse_failure` returns a user-friendly error message to the client
- [ ] HTTP status code is 502 (Bad Gateway) or similar non-500
- [ ] Error message suggests the user try again
- [ ] `npx tsc --noEmit` passes

## Work Log
| Date | Action | Notes |
|------|--------|-------|
| 2026-02-10 | Created | Code review finding |

## Resources
- Branch: ralph/scenario-generation-from-complaint
- File: `src/app/api/scenarios/generate/route.ts`, lines 32-40
