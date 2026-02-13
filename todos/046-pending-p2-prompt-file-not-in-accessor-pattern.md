---
status: pending
priority: p2
issue_id: "046"
tags: [code-review, architecture, consistency]
dependencies: []
---

# Prompt file not registered in prompts.ts accessor pattern

## Problem Statement
Every other prompt file in the codebase has a dedicated accessor function in `prompts.ts` (e.g., `getEvaluatorPromptFile`, `getRealtimeCallerPromptFile`, `getChextSimulatorPromptFile`) with an environment variable override for deployment flexibility. The `scenario-generator.txt` prompt file is loaded directly with a raw string literal in `openai.ts` (line 322), bypassing the established accessor pattern. This makes it the only prompt that cannot be swapped via environment variable and is inconsistent with the codebase architecture.

## Findings
- `openai.ts` line 322 loads `scenario-generator.txt` via raw path string
- All other prompts use accessor functions in `prompts.ts` with env var overrides
- Pattern: `getXxxPromptFile()` reads `process.env.XXX_PROMPT_FILE` or falls back to default path
- Missing accessor means no way to override the prompt file without code change
- Inconsistency makes it harder to discover and manage all prompt files

## Proposed Solutions
### Option A: Add accessor to prompts.ts
- Add `getScenarioGeneratorPromptFile()` to `prompts.ts`
- Add `SCENARIO_GENERATOR_PROMPT_FILE` env var override
- Update `openai.ts` to call the accessor instead of using the raw path
- Pros: Consistent with all other prompts, deployment-flexible, discoverable
- Cons: Slightly more indirection for a single line
- Effort: Small
- Risk: Low

## Acceptance Criteria
- [ ] `getScenarioGeneratorPromptFile()` exists in `prompts.ts`
- [ ] `SCENARIO_GENERATOR_PROMPT_FILE` env var override works
- [ ] `openai.ts` uses the accessor instead of raw string path
- [ ] `npx tsc --noEmit` passes
- [ ] Scenario generation still works correctly

## Work Log
| Date | Action | Notes |
|------|--------|-------|
| 2026-02-10 | Created | Code review finding |

## Resources
- Branch: ralph/scenario-generation-from-complaint
- File: `src/lib/openai.ts`, line 322
- Related: `src/lib/prompts.ts` (accessor pattern)
