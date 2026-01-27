---
status: pending
priority: p2
issue_id: "034"
tags: [code-review, performance, memory-leak]
dependencies: []
---

# Blob URL Memory Leak in Recording Playback

## Problem Statement

The `handlePlayRecording` function creates blob URLs that are never revoked, causing memory leaks. Each recording playback leaks memory until page refresh.

**Why it matters**: After playing 10 recordings of ~10MB each, 100MB of unreclaimable browser memory.

## Findings

**Location**: `src/components/counselor-dashboard.tsx` (lines 258-297)

```typescript
const handlePlayRecording = async (assignment: Assignment) => {
  // ...
  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);

  // Opens in new window - blobUrl is NEVER revoked
  const audioWindow = window.open("", "_blank");
  if (audioWindow) {
    audioWindow.document.write(`<audio src="${blobUrl}">...`);
  }
};
```

## Proposed Solutions

### Option A: Revoke on Window Close (Recommended)
**Pros**: Simple fix, maintains current UX
**Cons**: Still uses popup pattern
**Effort**: Small (15 min)
**Risk**: None

```typescript
audioWindow.document.write(`
  <script>
    window.onbeforeunload = function() {
      URL.revokeObjectURL('${blobUrl}');
    };
  </script>
`);
```

### Option B: Inline Audio Player
**Pros**: Better UX, no popup needed
**Cons**: Requires UI changes
**Effort**: Medium (30 min)
**Risk**: None

Use a modal or inline audio element instead of popup.

## Recommended Action

[To be filled during triage]

## Technical Details

**Affected Files**:
- `src/components/counselor-dashboard.tsx`

## Acceptance Criteria

- [ ] Blob URLs are revoked when audio window closes
- [ ] No memory leak after playing multiple recordings
- [ ] DevTools Memory panel shows stable heap after playback

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-26 | Created from code review | Performance oracle flagged |

## Resources

- MDN: URL.revokeObjectURL()
