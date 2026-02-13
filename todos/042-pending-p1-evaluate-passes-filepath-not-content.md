---
status: pending
priority: p1
issue_id: "042"
tags: [code-review, bug, data-integrity]
dependencies: []
---

# Pre-existing: evaluate route passes file PATH not file CONTENT for evaluatorContext

## Problem Statement
The evaluate route reads `scenario.evaluatorContextPath` and passes that filesystem path string (e.g., `"/path/to/uploads/evaluator_context/uuid/context.txt"`) directly to the LLM as the evaluator context. It never reads the file contents. This means evaluator context from ALL scenarios -- not just generated ones -- has ZERO effect on evaluation quality. The LLM receives a meaningless file path instead of the actual policy text, rubric, or contextual guidance that was intended to improve evaluation accuracy. This is a pre-existing bug, not introduced by the scenario generation PR, but it blocks the generate feature from working correctly since generated scenarios rely on evaluator context for meaningful evaluation.

## Findings
- File: `src/app/api/sessions/[id]/evaluate/route.ts`, line 97
- Code: `const scenarioEvaluatorContext = scenario?.evaluatorContextPath ?? null`
- This passes the raw path string like `"/uploads/evaluator_context/abc-123/context.txt"` to the evaluation prompt
- The file content is never read with `readFile` or any equivalent
- This affects ALL scenarios that have evaluator context, not just generated ones
- The evaluation prompt receives the path as a string, which the LLM will either ignore or misinterpret
- This bug has existed since the evaluator context feature was first implemented

## Proposed Solutions
### Option A: Read the file content at evaluation time
- Replace `scenario?.evaluatorContextPath` with an `await readFile(scenario?.evaluatorContextPath, 'utf-8')` call
- Add error handling for missing or unreadable files (graceful fallback to null)
- Pros: Minimal change, fixes the bug immediately, works with existing file-based storage
- Cons: Adds file I/O to the evaluation hot path, file could be missing/corrupted
- Effort: Small
- Risk: Low

### Option B: Store evaluatorContext in DB column, eliminate file I/O
- Add an `evaluator_context` text column to the Scenario model
- Migrate existing file-based contexts into the column
- Read from DB column instead of file at evaluation time
- Pros: Eliminates file I/O entirely, true atomicity, no missing file edge cases
- Cons: Requires schema migration, data migration for existing files, larger change
- Effort: Large (schema migration)
- Risk: Low

## Acceptance Criteria
- [ ] Evaluation prompt receives actual evaluator context text content, not a filesystem path
- [ ] Missing or unreadable evaluator context files are handled gracefully (fallback to null, not 500)
- [ ] Verify with a test scenario that has evaluator context: evaluation output references the context content
- [ ] `npx tsc --noEmit` passes with zero errors

## Work Log
| Date | Action | Notes |
|------|--------|-------|
| 2026-02-10 | Created | Code review finding |

## Resources
- Branch: ralph/scenario-generation-from-complaint
- Related: TODO 041 (non-atomic file persistence) -- if Option B is chosen for both, they can share the same schema migration
