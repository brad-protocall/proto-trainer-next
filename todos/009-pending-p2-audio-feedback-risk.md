---
status: pending
priority: p2
issue_id: PR-21-004
tags: [code-review, audio, ux]
dependencies: [PR-21-001]
---

# AudioWorklet Connects to Destination - Feedback Risk

## Problem Statement

The AudioWorklet is connected to `audioContext.destination`, which routes microphone input to speakers. This creates an audio feedback loop for users without headphones.

**Why it matters:** Users without headphones will experience echo/feedback, degrading the voice training experience.

## Findings

**File:** `src/hooks/use-realtime-voice.ts` (lines 300-301)

```typescript
// Connect the audio graph
source.connect(workletNode);
workletNode.connect(audioContext.destination);  // WHY? Creates feedback
```

The worklet's purpose is to capture audio for transmission, not to play it back. The destination connection appears to be a mistake.

## Proposed Solutions

### Option 1: Remove destination connection (Recommended)
**Pros:** Eliminates feedback, simplest fix
**Cons:** None
**Effort:** Trivial
**Risk:** None

```typescript
source.connect(workletNode);
// Don't connect to destination - capture only
```

### Option 2: Add configurable monitoring
**Pros:** Allows intentional monitoring for debugging
**Cons:** More complex
**Effort:** Small
**Risk:** Low

```typescript
interface UseRealtimeVoiceOptions {
  // ...
  enableMonitoring?: boolean;  // Debug only
}

if (options.enableMonitoring) {
  workletNode.connect(audioContext.destination);
}
```

## Recommended Action

_To be filled during triage_

## Technical Details

**Affected Files:**
- `src/hooks/use-realtime-voice.ts`

## Acceptance Criteria

- [ ] Microphone audio not played through speakers
- [ ] No feedback for users without headphones
- [ ] Audio capture still works correctly

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-18 | Created during PR #21 review | Architecture and performance reviewers flagged this |

## Resources

- [PR #21](https://github.com/brad-pendergraft/proto-trainer-next/pull/21)
- [Web Audio API AudioWorklet](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet)
