---
title: Extract Shared Label Utilities to Prevent Drift
category: prevention-strategies
date: 2026-02-12
component: React Components
tags: [duplication, single-source-of-truth, labels, refactoring]
severity: low
detection: code-review (code-simplicity-reviewer, architecture-strategist)
---

## Problem

Two React components (`supervisor-dashboard.tsx`, `generate-scenario-modal.tsx`) independently defined identical `SKILL_LABEL_OVERRIDES` maps and skill/category formatting functions. A third file (`constants.ts`) held a stale, divergent copy. When label text needed updating, three locations required changes—guaranteeing someone would miss one.

**Risk**: Inconsistent UI labels across the app. Component A shows "de-escalation", component B shows "De-escalation". User confusion and stale docs.

## Root Cause

No shared module for display labels. Each component imported `Scenario` type and derived its own formatting logic. When `constants.ts` was added early in the project, it wasn't maintained as labels evolved. Drift was invisible until code review surfaced inconsistencies.

## Solution

Created `src/lib/labels.ts` as the single source of truth:

```typescript
// src/lib/labels.ts
import { ScenarioCategoryValues, SkillValues } from './validators';

export const SKILL_LABEL_OVERRIDES: Record<string, string> = {
  'active-listening': 'Active Listening',
  'de-escalation': 'De-escalation',
  // ... rest
};

export function formatSkillLabel(skill: string): string {
  return SKILL_LABEL_OVERRIDES[skill] || skill;
}

export const CATEGORY_OPTIONS = ScenarioCategoryValues.map(cat => ({
  value: cat,
  label: formatCategoryLabel(cat),
}));
```

**Key**: All values derive from `validators.ts` Zod schema. When schema changes, labels auto-update.

Both components now:
```typescript
import { formatSkillLabel, CATEGORY_OPTIONS } from '@/lib/labels';
```

Result: **+125/-129 lines** (net reduction). Eliminated 3 duplicate maps.

## Pattern

**Extract display logic to a shared module when:**
- Same constant/function needed by 2+ components
- Enum-like values (categories, skills, status labels)
- Values derive from a schema (Zod, database types)

**Structure:**
1. Create `src/lib/[domain].ts` (e.g., `labels.ts`, `statuses.ts`)
2. Export constants + formatting functions
3. Derive from single source (validators, database schema)
4. Remove duplicates from components
5. Delete stale copies in `constants.ts`

## Related

- **Enum Validation Mismatch** (pattern #1 in bug-prevention-patterns.md) — same root cause
- `src/lib/validators.ts` — Zod schema (source of truth)
- `src/lib/labels.ts` — Label formatting (derived truth)
- Codebase naming conventions in CLAUDE.md — camelCase/snake_case rules
