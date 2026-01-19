---
status: pending
priority: p2
issue_id: PR-22-006
tags: [code-review, testing, quality]
dependencies: []
---

# No Test Infrastructure for WebSocket Server

## Problem Statement

The WebSocket server has zero test coverage. The package.json test script just echoes an error. Real-time WebSocket relay servers are notoriously difficult to debug in production.

**Why it matters:** Cannot verify correctness, regression risk on any changes.

## Findings

**File:** `ws-server/package.json` (line 7)

```json
"test": "echo \"Error: no test specified\" && exit 1"
```

**Untested critical functionality:**
- WebSocket connection handling
- Message routing (client ↔ OpenAI)
- Transcript accumulation
- Error handling paths
- Graceful shutdown behavior
- Session cleanup

## Proposed Solutions

### Option 1: Add unit tests with mock WebSockets (Recommended)
**Pros:** Fast, covers core logic
**Cons:** Doesn't test real connections
**Effort:** Medium
**Risk:** Low

```typescript
// Example test structure
describe('RealtimeSession', () => {
  it('accumulates assistant transcripts', async () => {
    const mockWs = createMockWebSocket();
    const session = new RealtimeSession(mockWs, {});

    session.handleOpenAIMessage({ type: 'response.audio_transcript.delta', delta: 'Hello' });
    session.handleOpenAIMessage({ type: 'response.audio_transcript.done' });

    expect(session.getTranscripts()).toHaveLength(1);
    expect(session.getTranscripts()[0].content).toBe('Hello');
  });
});
```

### Option 2: Integration tests with actual WebSocket server
**Pros:** Tests real behavior
**Cons:** Slower, more setup
**Effort:** Large
**Risk:** Low

## Recommended Action

_To be filled during triage_

## Technical Details

**Affected Files:**
- `ws-server/package.json`
- New: `ws-server/__tests__/`

## Acceptance Criteria

- [ ] Unit tests for RealtimeSession message handling
- [ ] Unit tests for transcript accumulation
- [ ] Tests for error handling paths
- [ ] CI pipeline runs tests

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-18 | Created during PR #22 review | Architecture strategist noted zero coverage |

## Resources

- [PR #22](https://github.com/brad-pendergraft/proto-trainer-next/pull/22)
