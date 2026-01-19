---
status: pending
priority: p2
issue_id: "020"
tags: [code-review, performance, memory, audio]
dependencies: []
---

# Memory Leak in Audio Worklet Event Handlers

## Problem Statement

Audio worklet event handlers in `use-realtime-voice.ts` are not properly cleaned up on disconnect, causing memory leaks during long sessions or repeated connect/disconnect cycles.

**Why it matters**: Browser memory grows over time, potentially causing crashes during extended training sessions.

## Findings

**Source**: Performance Oracle

**Location**: `src/hooks/use-realtime-voice.ts`

Event handlers are attached but cleanup is incomplete:
- `onmessage` handlers on audio worklet
- WebSocket event handlers
- MediaStream tracks

## Proposed Solutions

### Option A: Comprehensive cleanup in disconnect (Recommended)
**Pros**: Complete fix, clear ownership
**Cons**: Requires careful tracking of all handlers
**Effort**: Medium
**Risk**: Low

### Option B: Use AbortController for all handlers
**Pros**: Modern pattern, automatic cleanup
**Cons**: Requires refactoring handler attachment
**Effort**: Medium
**Risk**: Low

## Recommended Action

<!-- Filled during triage -->

## Technical Details

**Affected Files**:
- `src/hooks/use-realtime-voice.ts`

**Cleanup needed for**:
- AudioWorklet message handlers
- WebSocket event handlers (onopen, onmessage, onerror, onclose)
- MediaStream tracks (already partially done)
- AudioContext (close on disconnect)

## Acceptance Criteria

- [ ] All event handlers removed on disconnect
- [ ] AudioContext properly closed
- [ ] No memory growth over repeated sessions
- [ ] Chrome DevTools shows stable heap

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-19 | Created from code review | Audio resources need explicit cleanup |

## Resources

- MDN: AudioContext cleanup
- WebSocket close lifecycle
