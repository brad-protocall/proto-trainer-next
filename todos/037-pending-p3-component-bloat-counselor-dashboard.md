---
status: pending
priority: p3
issue_id: "037"
tags: [code-review, architecture, refactoring]
dependencies: []
---

# Component Bloat - CounselorDashboard (740+ lines)

## Problem Statement

The CounselorDashboard component handles 10+ distinct responsibilities and has grown to 740+ lines with 15+ state variables. This violates Single Responsibility Principle.

**Why it matters**: Hard to maintain, test, and reason about. Changes in one area risk breaking others.

## Findings

**Location**: `src/components/counselor-dashboard.tsx` (740+ lines)

**Current responsibilities**:
1. User selection/authentication
2. Assignment listing
3. Status filtering
4. Training session launching
5. Feedback retrieval
6. Transcript viewing
7. Recording playback
8. Scenario viewing
9. Evaluator context viewing
10. Modal management (3 types)
11. Free practice initiation

## Proposed Solutions

### Option A: Extract Sub-Components (Recommended)
**Pros**: Better separation of concerns, testable units
**Cons**: More files
**Effort**: Medium (2 hours)
**Risk**: Low

Extract:
- `<AssignmentCard />` - individual assignment display
- `<CounselorSelector />` - user switching
- `<DetailModal />` - generic modal for scenario/transcript/evalContext
- `<RecordingPlayer />` - audio playback logic
- `<FreePracticeSection />` - free practice UI

## Recommended Action

[To be filled during triage] - Defer to future sprint

## Technical Details

**Affected Files**:
- `src/components/counselor-dashboard.tsx` (split into multiple)

## Acceptance Criteria

- [ ] No component exceeds 300 lines
- [ ] Each component has single responsibility
- [ ] Tests can target individual components

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-26 | Created from code review | Architecture and pattern agents flagged |

## Resources

- PR: uncommitted changes
