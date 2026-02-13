---
status: pending
priority: p3
issue_id: "053"
tags: [code-review, performance]
dependencies: []
---

# Cache prompt file loading

## Problem Statement
In `src/lib/prompts.ts` (line 14), `loadPrompt` uses `fs.readFileSync` on every call. Prompt files never change at runtime (only via deployment). On the Pi with an SD card, synchronous file reads can spike to 5-20ms per request, adding unnecessary latency to every scenario generation or evaluation call.

## Proposed Solutions
Add a module-level `Map<string, string>` cache in `loadPrompt`. The first read for a given prompt name populates the cache; subsequent reads return the cached string and skip file I/O entirely.

```typescript
const promptCache = new Map<string, string>();

export function loadPrompt(name: string): string {
  const cached = promptCache.get(name);
  if (cached) return cached;

  const content = fs.readFileSync(path.join(promptDir, name), 'utf-8');
  promptCache.set(name, content);
  return content;
}
```

## Acceptance Criteria
- [ ] `loadPrompt` caches after first read per prompt name
- [ ] No functional change to callers
- [ ] Subsequent calls for the same prompt return cached content without file I/O

## Work Log
| Date | Action | Notes |
|------|--------|-------|
| 2026-02-10 | Created | Code review finding |

## Resources
- Branch: ralph/scenario-generation-from-complaint
