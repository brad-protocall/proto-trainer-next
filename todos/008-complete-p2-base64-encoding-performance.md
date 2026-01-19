---
status: pending
priority: p2
issue_id: PR-21-003
tags: [code-review, performance, audio]
dependencies: [PR-21-001]
---

# Inefficient Base64 Encoding via String Concatenation

## Problem Statement

The `base64EncodeAudio` and `base64DecodeAudio` functions use string concatenation in loops, creating O(n²) time complexity due to JavaScript string immutability. This is called ~6 times per second during voice capture and playback.

**Why it matters:** Causes CPU spikes, GC pressure, and potential audio stuttering during longer voice sessions.

## Findings

**File:** `src/lib/audio.ts` (lines 45-52)

```typescript
export function base64EncodeAudio(pcm16: Int16Array): string {
  const uint8Array = new Uint8Array(pcm16.buffer);
  let binary = "";
  for (let i = 0; i < uint8Array.length; i++) {
    binary += String.fromCharCode(uint8Array[i]);  // O(n²) string concat
  }
  return btoa(binary);
}
```

**Impact at scale:**
- 4096 samples = 8192 bytes per chunk
- ~6 chunks per second
- Each iteration creates new string object
- GC pressure compounds over longer sessions

## Proposed Solutions

### Option 1: Use chunked String.fromCharCode.apply (Recommended)
**Pros:** Simple, significant improvement
**Cons:** Has stack limit (~32KB chunks)
**Effort:** Small
**Risk:** Low

```typescript
export function base64EncodeAudio(pcm16: Int16Array): string {
  const uint8Array = new Uint8Array(pcm16.buffer);
  const chunks: string[] = [];
  const chunkSize = 8192;

  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
    chunks.push(String.fromCharCode.apply(null, chunk as unknown as number[]));
  }

  return btoa(chunks.join(''));
}
```

### Option 2: Use TextDecoder for decode path
**Pros:** More idiomatic for binary data
**Cons:** May not work for raw PCM16 bytes
**Effort:** Medium
**Risk:** Medium

### Option 3: Use native Base64 ArrayBuffer encoding (future)
**Pros:** Most efficient
**Cons:** Not yet widely available
**Effort:** N/A
**Risk:** N/A

## Recommended Action

_To be filled during triage_

## Technical Details

**Affected Files:**
- `src/lib/audio.ts`

**Functions:**
- `base64EncodeAudio(pcm16: Int16Array): string`
- `base64DecodeAudio(base64Data: string): Float32Array`

## Acceptance Criteria

- [ ] No string concatenation in loops
- [ ] Benchmark shows improvement (aim for 10x)
- [ ] Audio quality unchanged
- [ ] No memory leaks during 10-minute session

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-18 | Created during PR #21 review | Performance oracle identified O(n²) pattern |

## Resources

- [PR #21](https://github.com/brad-pendergraft/proto-trainer-next/pull/21)
