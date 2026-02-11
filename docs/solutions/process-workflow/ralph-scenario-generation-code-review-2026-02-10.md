---
title: "Ralph Autonomous Agent Workflow: Scenario Generation Code Review"
date: 2026-02-10
category: process-workflow
tags:
  - autonomous-agent
  - code-review
  - ralph
  - ai-generated-code
  - pattern-compliance
  - scenario-generation
severity: info
component: development-workflow
related_issues:
  - issue: "#12"
    status: complete
    pr: "#44"
related_documents:
  - docs/solutions/prevention-strategies/bug-prevention-patterns.md
  - docs/solutions/prevention-strategies/ai-code-generation-prevention-checklist.md
  - docs/solutions/prevention-strategies/cross-process-integration-patterns.md
  - docs/solutions/integration-issues/api-frontend-contract-mismatch-bulk-assignments.md
  - plans/scenario-generation-from-complaint.md
workflow_type: ralph-autonomous-implementation
review_panel: 6-agent-code-review
findings:
  total: 16
  p1: 5
  p2: 7
  p3: 4
  fixed: 16
commits:
  ralph:
    - "4810ec2: fix: persist evaluatorContext in POST /api/scenarios"
    - "06e9ca1: feat: add Zod schemas for complaint-to-scenario generation"
    - "20cfaff: feat: add scenario generator system prompt"
    - "2716084: feat: add generateScenarioFromComplaint helper"
    - "6c4723e: feat: add POST /api/scenarios/generate route"
    - "1ae20a0: feat: add GenerateScenarioModal component"
    - "90d1531: feat: wire Generate from Complaint button"
  review_fixes:
    - "3a8f8fe: fix: address P1 code review findings"
    - "5da4c22: fix: address P2 code review findings"
    - "8ac4531: chore: address P3 code review findings"
---

# Ralph Scenario Generation: Autonomous Implementation + Code Review

## Summary

Feature #12 "Scenario Generation from Complaint" was implemented using Ralph autonomous agent (7 user stories, 7 commits) and then reviewed by a 6-agent code review panel that identified 16 findings. All 16 were fixed in 3 commits (P1/P2/P3), merged as PR #44, and deployed to Pi.

This document captures the lessons learned from this workflow for future autonomous agent sessions.

---

## What Ralph Did Well

1. **Correct component extraction**: Generated `generate-scenario-modal.tsx` as a separate component instead of bloating the 1500-line supervisor dashboard
2. **Proper state management**: Used `generatedScenario | null` + `isLoading` boolean (4-state matrix) instead of a complex state machine
3. **OpenAI helper centralization**: Put `generateScenarioFromComplaint()` in `openai.ts` where all other AI calls live
4. **System prompt quality**: The scenario generator prompt was well-structured with PII protection, crisis context framing, and anti-manipulation safeguards
5. **Pre-existing bug fix**: Correctly identified that `POST /api/scenarios` wasn't persisting `evaluatorContext` and fixed it as a prerequisite
6. **Thin route handler**: API route followed the established `requireSupervisor -> validate -> call helper -> return` pattern

## What Ralph Missed (16 Findings)

### Category 1: Hardcoded Values vs Single Source of Truth (3 findings)

**Pattern**: AI duplicates canonical data sources instead of importing/deriving from them.

**Why**: LLMs generate "complete" code blocks without checking for existing sources of truth.

| Finding | Priority | Issue |
|---------|----------|-------|
| 038 | P1 | `CATEGORY_OPTIONS` hardcoded 8 categories instead of deriving from `ScenarioCategoryValues` |
| 043 | P2 | `SKILL_LABELS` hardcoded 15 entries instead of using formatter function |
| 047 | P2 | `EditableScenario` interface duplicated `GeneratedScenario` fields |

**Fix pattern** (applies to all 3):
```typescript
// BAD: AI duplicates values
const CATEGORY_OPTIONS = [
  { value: "cohort_training", label: "Cohort Training" },
  // ... 8 hardcoded entries
];

// GOOD: Derive from canonical source
import { ScenarioCategoryValues } from "@/lib/validators";
const CATEGORY_OPTIONS = [
  { value: "", label: "-- None --" },
  ...ScenarioCategoryValues.map((v) => ({
    value: v,
    label: formatCategoryLabel(v),
  })),
];
```

### Category 2: Type Safety Gaps (2 findings)

**Pattern**: AI uses looser types to avoid TypeScript errors during generation.

| Finding | Priority | Issue |
|---------|----------|-------|
| 039 | P1 | `updateField` accepted `unknown` instead of generic constraint |
| 047 | P2 | Separate interface instead of intersection type |

**Fix pattern**:
```typescript
// BAD: Weak types
const updateField = (field: keyof EditableScenario, value: unknown) => { ... }

// GOOD: Generic constraint
const updateField = <K extends keyof EditableScenario>(
  field: K, value: EditableScenario[K]
) => { ... }
```

### Category 3: Pre-existing Bug Discovery (2 findings)

**Pattern**: Code reviews of new features often uncover related bugs in adjacent code.

| Finding | Priority | Issue |
|---------|----------|-------|
| 041 | P1 | `POST /api/scenarios` returned stale response after evaluatorContextPath update |
| 042 | P1 | Evaluate route passed file PATH to LLM instead of reading file CONTENT |

The **file path bug** (042) was the most impactful discovery. The evaluate route had:
```typescript
// BAD: LLM receives "/uploads/evaluator_context/abc-123/context.txt"
const scenarioEvaluatorContext = scenario?.evaluatorContextPath ?? null

// GOOD: LLM receives actual policy text/rubric content
let scenarioEvaluatorContext: string | null = null
if (scenario?.evaluatorContextPath) {
  try {
    scenarioEvaluatorContext = await readFile(scenario.evaluatorContextPath, 'utf-8')
  } catch {
    // File missing — evaluate without context rather than failing
  }
}
```

This bug meant evaluator context **never worked** since it was implemented. It was caught only because the code review traced the data flow end-to-end.

### Category 4: Missing Validation & Safety (3 findings)

**Pattern**: AI omits non-functional requirements (security, performance, cost control).

| Finding | Priority | Issue |
|---------|----------|-------|
| 044 | P2 | No `.max()` constraints on schema string fields |
| 045 | P2 | `parse_failure` fell through to generic 500 instead of 502 with retry message |
| 049 | P2 | No rate limiting on LLM endpoint (~$0.03/call) |

**Fix pattern** (rate limiting):
```typescript
// New file: src/lib/rate-limit.ts
const windows = new Map<string, number[]>()

export function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now()
  const timestamps = windows.get(key) ?? []
  const valid = timestamps.filter(t => now - t < windowMs)
  if (valid.length >= maxRequests) { windows.set(key, valid); return false }
  valid.push(now)
  windows.set(key, valid)
  return true
}
```

### Category 5: Inconsistent Patterns (3 findings)

**Pattern**: AI doesn't consistently use existing helper functions/patterns.

| Finding | Priority | Issue |
|---------|----------|-------|
| 040 | P1 | OpenAI timeout 15s too short for structured output generation |
| 046 | P2 | Prompt loaded with raw string instead of accessor function |
| 048 | P2 | Raw `fetch()` instead of `authFetch` helper |

### Category 6: Documentation/Maintenance (4 findings)

**Pattern**: AI omits explanatory comments and optimization opportunities.

| Finding | Priority | Issue |
|---------|----------|-------|
| 050 | P3 | Skills cap discrepancy (LLM 1-5, UI 10) undocumented |
| 051 | P3 | Prompt file lists not noted as needing sync with code |
| 052 | P3 | `isOneTime: true` design decision had no inline comment |
| 053 | P3 | Prompt file reads on every request (no caching) |

---

## Three-Commit Remediation Workflow

All fixes followed a systematic priority-based approach:

### Commit 1: P1 Fixes (`3a8f8fe`)
5 findings, 4 files changed. Critical bugs, type safety, pre-existing bugs.

### Commit 2: P2 Fixes (`5da4c22`)
7 findings, 7 files changed. Validation, rate limiting, pattern compliance, error handling.
- Created new file: `src/lib/rate-limit.ts`
- Added `RATE_LIMITED` and `UPSTREAM_ERROR` to `ApiErrorType`

### Commit 3: P3 Fixes (`8ac4531`)
4 findings, 3 files changed. Documentation, caching, code clarity.

Each commit verified with `npx tsc --noEmit` and `npm run lint` before proceeding.

---

## Files Changed (Review Fixes Only)

| File | Changes |
|------|---------|
| `src/components/generate-scenario-modal.tsx` | Single source of truth, type safety, authFetch, inline comments |
| `src/lib/openai.ts` | Timeout increase, prompt accessor |
| `src/app/api/scenarios/route.ts` | Return fresh response after update |
| `src/app/api/sessions/[id]/evaluate/route.ts` | Read file content instead of passing path |
| `src/lib/validators.ts` | Max length constraints on schema fields |
| `src/app/api/scenarios/generate/route.ts` | parse_failure handling, rate limiting |
| `src/lib/prompts.ts` | Accessor function, in-memory caching |
| `src/lib/rate-limit.ts` | **New** - sliding window rate limiter |
| `src/types/index.ts` | New `RATE_LIMITED`, `UPSTREAM_ERROR` error types |
| `prompts/scenario-generator.txt` | Sync note for skill/category lists |

---

## Prevention Strategies

### For Future Ralph Sessions

1. **Add `mustImportFrom` to prd.json user stories** - Document canonical sources (validators.ts, skills.ts) that Ralph must import from instead of duplicating
2. **Add `antiPatterns` to prd.json** - Regex patterns Ralph should avoid (raw fetch, hardcoded enums)
3. **Post-generation grep checks** - Automated detection of hardcoded constants, missing auth helpers
4. **Match validation rigor** - Check `.max()` on all string fields, timeouts on LLM calls, rate limiting on expensive endpoints

### Detection Commands

```bash
# Check for hardcoded category arrays
grep -rn "ScenarioCategoryValues\|CATEGORY_OPTIONS" src/ --include="*.ts" --include="*.tsx"

# Check for raw fetch (should use authFetch)
grep -rn "await fetch(" src/components/ --include="*.tsx" | grep -v authFetch

# Check for missing .max() on string schemas
grep -rn "z.string()" src/lib/validators.ts | grep -v ".max("

# Check timeout consistency across OpenAI calls
grep -rn "timeout:" src/lib/openai.ts
```

### Detailed Prevention Checklist

See `docs/solutions/prevention-strategies/ai-code-generation-prevention-checklist.md` for the full post-generation validation checklist with automated scripts.

---

## Metrics

| Metric | Value |
|--------|-------|
| Ralph stories completed | 7/7 |
| Code review agents used | 6 |
| Total findings | 16 |
| Critical (P1) | 5 (all fixed) |
| Important (P2) | 7 (all fixed) |
| Nice-to-have (P3) | 4 (all fixed) |
| Pre-existing bugs discovered | 2 (file path bug + stale response) |
| New utility created | `src/lib/rate-limit.ts` |
| Fix time | ~60 min across 3 commits |
| New error types added | 2 (`RATE_LIMITED`, `UPSTREAM_ERROR`) |

### ROI

- 16 findings caught before merge vs. 16 potential bugs in production
- Pre-existing file path bug would have gone undetected without this review
- Estimated time saved: 32+ hours (2 hours/bug investigation in production x 16)

---

## Related Documentation

- **Plan**: `plans/scenario-generation-from-complaint.md` - Original implementation plan
- **Prevention patterns**: `docs/solutions/prevention-strategies/bug-prevention-patterns.md` - Existing enum/validation patterns
- **AI generation checklist**: `docs/solutions/prevention-strategies/ai-code-generation-prevention-checklist.md` - New checklist from this review
- **Previous Ralph lessons**: `docs/solutions/integration-issues/api-frontend-contract-mismatch-bulk-assignments.md` - Bulk assignments Ralph bugs
- **Cross-process patterns**: `docs/solutions/prevention-strategies/cross-process-integration-patterns.md` - Reusable patterns
- **CLAUDE.md**: Ralph Autonomous Agent Guidelines section (line 165)
- **PR**: https://github.com/brad-protocall/proto-trainer-next/pull/44
