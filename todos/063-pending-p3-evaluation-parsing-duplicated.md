---
status: pending
priority: p3
issue_id: "063"
tags: [code-review, quality, dry]
dependencies: []
---

# Evaluation response parsing duplicated 3 times

## Problem Statement
The evaluation response parsing logic (checking `evaluation.status`, extracting scores, handling error states) is duplicated in at least 3 places across the codebase: `triggerEvaluation` fast path, `requestEvaluationWithRetry` slow path, and possibly the evaluation display component. Changes to the evaluation API response shape require updates in multiple locations.

## Findings
- **Flagged by**: TypeScript Reviewer (MEDIUM), Code Simplicity Reviewer
- File: `src/components/voice-training-view.tsx` — two parsing locations in fast path and slow path
- The parsing logic checks similar response fields but with slightly different error handling
- Not a bug currently, but a maintenance risk

## Proposed Solutions
### Option A: Extract parseEvaluationResponse helper
- Create a shared function that takes the raw API response and returns a typed result
- Pros: Single source of truth for evaluation response handling
- Cons: Requires understanding all call sites
- Effort: Small
- Risk: Low

## Acceptance Criteria
- [ ] Evaluation response parsing exists in one shared function
- [ ] Both fast path and slow path use the shared function

## Work Log
| Date | Action | Notes |
|------|--------|-------|
| 2026-02-12 | Created | Code review finding — data channel transcript implementation |

## Resources
- File: `src/components/voice-training-view.tsx`
