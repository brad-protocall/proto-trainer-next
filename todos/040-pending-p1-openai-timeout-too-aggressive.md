---
status: pending
priority: p1
issue_id: "040"
tags: [code-review, performance, reliability]
dependencies: []
---

# 15-second OpenAI timeout too aggressive for structured output

## Problem Statement
The `zodResponseFormat` + gpt-4.1 call with ~20K characters of input generates 800-1200 output tokens. At typical generation speeds of 50-80 tokens/sec, output alone takes 10-24 seconds. The current 15-second timeout will cause intermittent failures under normal load conditions, especially when OpenAI API latency spikes. The UI copy tells users to expect "3-5 seconds" which is optimistic. When timeout errors occur, they fall through to a generic 500 error with no user-friendly message explaining what happened.

## Findings
- File: `src/lib/openai.ts`, line 337
- 15-second timeout for a structured output call that routinely needs 10-24 seconds
- UI loading text says "3-5 seconds" which sets wrong expectations
- Timeout errors are not caught specifically -- they produce generic 500 responses
- Under API load or during OpenAI degraded performance, this timeout will fail frequently
- Users will see cryptic error messages with no guidance on what to do

## Proposed Solutions
### Option A: Increase timeout to 30s, update UI text
- Change the timeout from 15s to 30s to accommodate normal generation times plus buffer
- Update UI loading copy from "3-5 seconds" to "5-15 seconds"
- Pros: Simple fix, addresses the immediate reliability issue
- Cons: Does not add specific timeout error handling
- Effort: Small
- Risk: Low

### Option B: Add explicit timeout error handling with user-friendly message
- Increase timeout to 30s AND catch timeout errors specifically
- Return a structured error like `{ error: "Generation took longer than expected. Please try again." }` instead of generic 500
- Pros: Better UX on failure, actionable error message
- Cons: Slightly more code, but straightforward
- Effort: Small
- Risk: Low

## Acceptance Criteria
- [ ] OpenAI timeout is >= 30 seconds for scenario generation calls
- [ ] UI loading copy reflects realistic timing expectations (not "3-5 seconds")
- [ ] No intermittent timeout failures under normal operating conditions
- [ ] Timeout errors produce a user-friendly message, not a generic 500

## Work Log
| Date | Action | Notes |
|------|--------|-------|
| 2026-02-10 | Created | Code review finding |

## Resources
- Branch: ralph/scenario-generation-from-complaint
