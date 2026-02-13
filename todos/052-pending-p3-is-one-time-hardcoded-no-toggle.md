---
status: pending
priority: p3
issue_id: "052"
tags: [code-review, ux, product]
dependencies: []
---

# isOneTime hardcoded with no supervisor toggle

## Problem Statement
In `src/components/generate-scenario-modal.tsx` (line 156), all generated scenarios are hardcoded as `isOneTime: true`. The generate button appears on both the Global and One-Time tabs. A supervisor might reasonably want to generate a reusable (global) scenario from a complaint, but the current flow always produces a one-time scenario regardless of which tab they initiated from.

## Proposed Solutions
One of the following:
1. Add an `isOneTime` toggle to the edit form so the supervisor can choose before saving.
2. Restrict the generate button to the One-Time tab only, making the behavior match the UI context.
3. Add a comment documenting the product decision that generated scenarios are always one-time by design.

## Acceptance Criteria
- [ ] Product decision documented or toggle added so the behavior is intentional and clear

## Work Log
| Date | Action | Notes |
|------|--------|-------|
| 2026-02-10 | Created | Code review finding |

## Resources
- Branch: ralph/scenario-generation-from-complaint
