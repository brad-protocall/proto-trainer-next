---
status: pending
priority: p2
issue_id: "049"
tags: [code-review, security, cost]
dependencies: []
---

# No rate limiting on generate endpoint

## Problem Statement
The `POST /api/scenarios/generate` endpoint makes an expensive LLM API call (~$0.03/call with structured output) with no rate limiting. A supervisor (or automated script) could spam the endpoint, causing significant API costs. This is the same known gap documented in CLAUDE.md P2 #3 for the evaluate endpoint -- both LLM-backed endpoints lack cost protection.

## Findings
- Each generate call invokes OpenAI's API with structured output (gpt-4o class model)
- No per-user, per-session, or global rate limiting exists
- CLAUDE.md P2 item #3 documents the same gap for the evaluate endpoint
- The generate endpoint is user-facing (supervisor dashboard), making it easier to accidentally or intentionally spam
- At $0.03/call, 1000 rapid requests = $30 in API costs
- No audit logging of generation attempts exists either

## Proposed Solutions
### Option A: Per-user rate limiting on generate endpoint
- Add in-memory rate limiting (e.g., 10 requests/minute per user)
- Use a simple sliding window counter keyed by `x-user-id`
- Pros: Prevents abuse, minimal implementation
- Cons: In-memory state lost on restart, doesn't work across multiple instances
- Effort: Small
- Risk: Low

### Option B: Systemic rate limiting middleware for all LLM endpoints
- Create a reusable rate limiting middleware/utility for `/api/scenarios/generate`, `/api/sessions/[id]/evaluate`, and any future LLM endpoints
- Pros: Consistent protection across all expensive endpoints, DRY
- Cons: Larger scope, still in-memory unless Redis is added
- Effort: Medium
- Risk: Low

### Option C: Rate limiting + audit logging
- Combine rate limiting with a log of all LLM API calls (user, endpoint, timestamp, token usage)
- Pros: Full cost visibility and protection
- Cons: Requires storage for audit log
- Effort: Medium
- Risk: Low

## Acceptance Criteria
- [ ] Rate limiting applied to `POST /api/scenarios/generate`
- [ ] Returns 429 Too Many Requests with clear message when limit exceeded
- [ ] Rate limit is per-user (not global)
- [ ] Consider applying same fix to evaluate endpoint (CLAUDE.md P2 #3)
- [ ] `npx tsc --noEmit` passes

## Work Log
| Date | Action | Notes |
|------|--------|-------|
| 2026-02-10 | Created | Code review finding |

## Resources
- Branch: ralph/scenario-generation-from-complaint
- File: `src/app/api/scenarios/generate/route.ts`
- Related: CLAUDE.md P2 item #3 (evaluate endpoint rate limiting)
- Related: `src/app/api/sessions/[id]/evaluate/route.ts` (same gap)
