---
status: pending
priority: p2
issue_id: "021"
tags: [code-review, performance, memory]
dependencies: []
---

# Unbounded Transcript Array Growth

## Problem Statement

Transcript arrays in both client and server grow without limit. Very long training sessions could exhaust memory.

**Why it matters**: Extended training sessions (30+ minutes) could cause browser or server crashes.

## Findings

**Source**: Performance Oracle, Data Integrity Guardian

**Client** (`use-realtime-voice.ts`):
```typescript
const [transcripts, setTranscripts] = useState<TranscriptTurn[]>([]);
// Grows indefinitely
```

**Server** (`ws-server/realtime-session.ts`):
```typescript
private transcripts: TranscriptEntry[] = [];
// Also grows indefinitely
```

## Proposed Solutions

### Option A: Periodic persistence with array reset
**Pros**: Bounded memory, data preserved
**Cons**: Complexity of chunked persistence
**Effort**: Medium
**Risk**: Low

### Option B: Rolling window with persistence
**Pros**: Fixed memory, recent context preserved
**Cons**: May lose context mid-session
**Effort**: Medium
**Risk**: Medium

### Option C: Stream to database in real-time
**Pros**: Minimal memory, durable
**Cons**: Higher I/O, latency
**Effort**: Large
**Risk**: Medium

## Recommended Action

<!-- Filled during triage -->

## Technical Details

**Affected Files**:
- `src/hooks/use-realtime-voice.ts`
- `ws-server/realtime-session.ts`

**Rough sizing**:
- 1 turn ≈ 500 bytes
- 30 min session ≈ 100 turns ≈ 50KB (acceptable)
- 2 hour session ≈ 400 turns ≈ 200KB (still manageable)

May be lower priority given typical session lengths.

## Acceptance Criteria

- [ ] Define maximum transcript size or persistence threshold
- [ ] Implement chosen bounding strategy
- [ ] Test with extended sessions
- [ ] Memory usage remains stable

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-19 | Created from code review | Typical sessions short enough, may be P3 |

## Resources

- Session duration analytics (if available)
