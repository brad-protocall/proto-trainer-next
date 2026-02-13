---
status: pending
priority: p3
issue_id: "064"
tags: [code-review, architecture, swe-handoff]
dependencies: []
---

# TranscriptDataMessage interface duplicated across processes

## Problem Statement
The `TranscriptDataMessage` interface is defined identically in `livekit-agent/src/main.ts` (Node.js, deployed to LiveKit Cloud) and `src/components/voice-training-view.tsx` (browser client). If either side changes the shape, the other must be updated manually. Both files have `/** Must match */` comments pointing to each other, but there's no compile-time enforcement.

## Findings
- **Flagged by**: TypeScript Reviewer, Architecture Strategist, Pattern Recognition
- Architecture Strategist confirmed this is acceptable for a prototype — the agent and client are separate deployment units with no shared build
- A shared npm package would be over-engineering for 4 fields
- This should be documented in the SWE handoff checklist

## Proposed Solutions
### Option A: Add to SWE handoff checklist (Recommended for prototype)
- Document in CLAUDE.md's "Prototype-Only Features" section that this interface must be extracted to a shared package before production
- Pros: No code change, acknowledges the trade-off
- Cons: Doesn't prevent drift
- Effort: Small
- Risk: Low

### Option B: Create a shared types package
- Create `packages/shared-types/` with the interface, consumed by both agent and client
- Pros: Compile-time enforcement
- Cons: Adds monorepo complexity, overkill for 4 fields
- Effort: Large
- Risk: Medium

## Acceptance Criteria
- [ ] Interface duplication is documented in CLAUDE.md Prototype-Only Features table
- [ ] Both `/** Must match */` comments include the exact file path

## Work Log
| Date | Action | Notes |
|------|--------|-------|
| 2026-02-12 | Created | Code review finding — data channel transcript implementation |

## Resources
- File: `livekit-agent/src/main.ts`
- File: `src/components/voice-training-view.tsx`
