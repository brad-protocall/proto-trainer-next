---
status: pending
priority: p2
issue_id: "028"
tags: [code-review, agent-native, api]
dependencies: []
---

# Missing Agent-Native Endpoints for Skills Feature

## Problem Statement

The skills detection feature is only accessible via internal scripts. Agents cannot programmatically detect skills or list available skills via API.

**Why it matters**: External systems (PTG) must reimplement skill detection logic instead of using the canonical implementation. Violates agent parity principle.

## Findings

**Location**: `src/lib/skills.ts` - functions not exposed via API

**Missing endpoints**:
1. `GET /api/skills/list` - Return all VALID_SKILLS
2. `POST /api/skills/detect` - Detect skill from title/description

**Current state**:
- `detectSkill()` exists but only usable in scripts
- `VALID_SKILLS` exists but not API-accessible
- External API returns skills but agents can't classify new scenarios

## Proposed Solutions

### Option A: Add /api/skills endpoints (Recommended)
**Pros**: Full agent parity, reusable
**Cons**: New API surface to maintain
**Effort**: Medium (45 min)
**Risk**: Low

```typescript
// GET /api/skills/list
return apiSuccess({ skills: VALID_SKILLS });

// POST /api/skills/detect
const { skill, difficulty, estimatedTime } = detectMetadata(title, description, category);
return apiSuccess({ skill, difficulty, estimatedTime });
```

## Recommended Action

[To be filled during triage]

## Technical Details

**New Files**:
- `src/app/api/skills/route.ts` (list)
- `src/app/api/skills/detect/route.ts` (detect)

## Acceptance Criteria

- [ ] GET /api/skills/list returns all valid skills
- [ ] POST /api/skills/detect returns skill, difficulty, estimatedTime
- [ ] Endpoints documented in CLAUDE.md
- [ ] Agents can classify scenarios programmatically

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-26 | Created from code review | Agent-native reviewer flagged |

## Resources

- PR: commit 31b743e
- Agent-native principle: Actions users can take, agents should also be able to take
