---
status: pending
priority: p2
issue_id: "056"
tags: [code-review, security, performance]
dependencies: []
---

# Payload size allows 25MB transcript submissions

## Problem Statement
The Zod schema allows 500 turns * 50,000 characters each = 25MB per POST to `/api/sessions/[id]/transcript`. A malicious or buggy client could send extremely large payloads, consuming server memory and database storage. While Next.js has a default body size limit (~4MB), the Zod schema validates much larger payloads than expected for normal voice sessions (~50 turns, ~200 chars each).

## Findings
- **Flagged by**: Security Sentinel (HIGH), Performance Oracle (P2)
- File: `src/app/api/sessions/[id]/transcript/route.ts` — `z.string().min(1).max(50000)` and `z.array(...).max(500)`
- A typical 15-minute voice session produces ~30-50 turns of ~100-300 characters each
- 50,000 char limit per turn is 100x larger than typical content
- Client-side `parseTranscriptMessage` does not validate content length

## Proposed Solutions
### Option A: Tighten Zod limits to realistic values (Recommended)
- Reduce to `max(200)` turns and `max(5000)` chars per turn (still 5x generous over typical)
- Add client-side content length check in `parseTranscriptMessage`
- Pros: Simple, prevents abuse, matches realistic usage
- Cons: Might clip extremely long turns (unlikely in voice)
- Effort: Small
- Risk: Low

### Option B: Add Next.js body size limit configuration
- Configure `export const config = { api: { bodyParser: { sizeLimit: '1mb' } } }` on the route
- Pros: Hard server-level limit regardless of schema
- Cons: App Router may need middleware approach instead of route config
- Effort: Small
- Risk: Low

## Acceptance Criteria
- [ ] Zod schema limits are tightened to reasonable voice session bounds
- [ ] `parseTranscriptMessage` validates content length on client side
- [ ] A 25MB payload is rejected before hitting the database

## Work Log
| Date | Action | Notes |
|------|--------|-------|
| 2026-02-12 | Created | Code review finding — data channel transcript implementation |

## Resources
- File: `src/app/api/sessions/[id]/transcript/route.ts`
- File: `src/components/voice-training-view.tsx` — `parseTranscriptMessage()`
