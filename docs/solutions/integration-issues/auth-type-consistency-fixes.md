---
title: "Authentication & Type Consistency Fixes"
date: 2026-01-19
category: integration-issues
severity: P1
tags:
  - authentication
  - typescript
  - websocket
  - api
  - type-safety
affected_components:
  - ws-server
  - use-realtime-voice
  - use-chat
  - counselor-dashboard
  - supervisor-dashboard
  - chat-training-view
  - api-routes
related_prs:
  - "#20"
  - "#21"
  - "#22"
  - "#23"
---

# Authentication & Type Consistency Fixes

## Problem Statement

After merging PRs #20, #21, and #22, code review identified 3 critical P1 issues that would cause runtime failures:

1. **WebSocket authentication missing** - The `use-realtime-voice` hook didn't pass `userId` to the WebSocket server
2. **HTTP authentication missing** - Frontend components made API calls without `x-user-id` headers
3. **Type field mismatches** - `TranscriptTurn` used camelCase fields but types expected snake_case

These issues would cause:
- WebSocket connections rejected with "Missing required userId parameter"
- API calls returning 401 Unauthorized
- TypeScript compilation errors in transcript handling

## Root Cause Analysis

### 1. WebSocket Authentication Gap

The `use-realtime-voice.ts` hook was designed before authentication was added to the WebSocket server (PR #22). When PR #22 added `userId` validation:

```typescript
// ws-server/index.ts - Added authentication
function authenticateConnection(request: IncomingMessage): AuthResult {
  const userId = url.searchParams.get("userId");
  if (!userId) {
    return { ok: false, error: "Missing required userId parameter" };
  }
  // ...
}
```

The frontend hook wasn't updated to provide it:

```typescript
// BEFORE: Missing userId in options
export interface UseRealtimeVoiceOptions {
  scenarioId?: string;
  assignmentId?: string;
}
```

### 2. Frontend HTTP Authentication Gap

When PR #23 added `requireAuth()` to all API routes, it expected an `x-user-id` header:

```typescript
// src/lib/auth.ts
export async function requireAuth(request: NextRequest): Promise<AuthResult> {
  const userId = request.headers.get('x-user-id')
  if (!userId) {
    return { error: unauthorized('Missing x-user-id header'), user: null }
  }
  // ...
}
```

But frontend components still used plain `fetch()` without headers.

### 3. Type Definition Mismatch

The `TranscriptTurn` type in `src/types/index.ts` used snake_case (matching Prisma/API conventions):

```typescript
export interface TranscriptTurn {
  id: string;
  session_id: string;    // snake_case
  role: TranscriptRole;
  content: string;
  turn_index: number;    // snake_case
  created_at: string;    // snake_case
}
```

But `use-realtime-voice.ts` created objects with camelCase:

```typescript
// BEFORE: Wrong field names
const turn: TranscriptTurn = {
  sessionId: "",        // Wrong - should be session_id
  turnOrder: index,     // Wrong - should be turn_index
  createdAt: new Date() // Wrong - should be created_at (string)
};
```

## Solution

### Fix 1: WebSocket Authentication

Added required `userId` parameter to the hook:

```typescript
// src/hooks/use-realtime-voice.ts
export interface UseRealtimeVoiceOptions {
  userId: string;  // Now required
  scenarioId?: string;
  assignmentId?: string;
  onTranscript?: (turn: TranscriptTurn) => void;
}

// In connect function:
const params = new URLSearchParams();
params.set("userId", userId);  // Always include
if (scenarioId) params.set("scenarioId", scenarioId);
if (assignmentId) params.set("assignmentId", assignmentId);
```

### Fix 2: Authenticated Fetch Helper

Created a reusable authenticated fetch helper:

```typescript
// src/lib/fetch.ts (NEW FILE)
export interface AuthFetchOptions extends RequestInit {
  userId?: string;
}

export async function authFetch(
  url: string,
  options: AuthFetchOptions = {}
): Promise<Response> {
  const { userId, headers: customHeaders, ...rest } = options;
  const headers = new Headers(customHeaders);
  if (userId) {
    headers.set("x-user-id", userId);
  }
  return fetch(url, { ...rest, headers });
}

export function createAuthFetch(userId: string) {
  return (url: string, options: RequestInit = {}): Promise<Response> => {
    return authFetch(url, { ...options, userId });
  };
}
```

Updated components to use it:

```typescript
// src/components/counselor-dashboard.tsx
const authFetch = useMemo(
  () => (currentUser ? createAuthFetch(currentUser.id) : fetch),
  [currentUser]
);

// All fetch calls now use authFetch
const res = await authFetch("/api/assignments?counselorId=" + currentUser.id);
```

### Fix 3: Type Field Alignment

Fixed `TranscriptTurn` creation to use snake_case:

```typescript
// src/hooks/use-realtime-voice.ts
const turn: TranscriptTurn = {
  id: `assistant_${Date.now()}`,
  session_id: "",                           // Fixed
  role: "assistant",
  content: currentTranscriptRef.current,
  turn_index: turnIndexRef.current++,       // Fixed
  created_at: new Date().toISOString(),     // Fixed (now string)
};
```

### Additional Fixes

During the build, several cascading issues were discovered and fixed:

1. **ApiError field names** - Changed `code` to `type` and `fields` to `details` across all API routes
2. **Union type syntax** - Fixed `ws-server/index.ts` to use `type AuthResult = ... | ...` instead of invalid interface union
3. **ChatTrainingView userId prop** - Added required `userId` prop and updated parent page to fetch/pass user
4. **Missing type exports** - Added `AssignmentResponse`, `BulkAssignmentResponse`, `EvaluationResponse` to types

## Files Changed

| File | Change |
|------|--------|
| `src/hooks/use-realtime-voice.ts` | Added userId param, fixed TranscriptTurn fields |
| `src/lib/fetch.ts` | NEW - Authenticated fetch helper |
| `src/components/counselor-dashboard.tsx` | Use authFetch for all API calls |
| `src/components/supervisor-dashboard.tsx` | Add currentUser state, use authFetch |
| `src/hooks/use-chat.ts` | Add userId param, x-user-id headers |
| `src/components/chat-training-view.tsx` | Add userId prop |
| `src/app/training/chat/[assignmentId]/page.tsx` | Fetch user, pass to view |
| `ws-server/index.ts` | Fix union type syntax |
| `src/types/index.ts` | Add missing response types |
| `src/app/api/*/route.ts` | Fix ApiError field names |

## Prevention Strategies

### 1. Type-First Development

Always define types before implementation:

```typescript
// Define the interface first
interface UseRealtimeVoiceOptions {
  userId: string;  // Required fields documented
  // ...
}

// Then implement
export function useRealtimeVoice(options: UseRealtimeVoiceOptions) {
  // TypeScript will enforce required fields
}
```

### 2. Centralized Auth Helper

Use the `authFetch` helper for all authenticated API calls:

```typescript
// Good - centralized, consistent
import { createAuthFetch } from "@/lib/fetch";
const authFetch = useMemo(() => createAuthFetch(user.id), [user.id]);

// Bad - scattered, easy to forget
fetch(url, { headers: { "x-user-id": user.id } });
```

### 3. Consistent Naming Convention

Follow the established pattern:
- **Database/API**: snake_case (`session_id`, `turn_index`)
- **React/Frontend**: camelCase for component props only
- **TypeScript types**: Match the data source (snake_case for API types)

### 4. Build Verification Checklist

Before merging PRs that add authentication:

- [ ] All frontend components pass user ID to API calls
- [ ] WebSocket connections include required auth params
- [ ] Types align with actual API response shapes
- [ ] Build passes with no TypeScript errors
- [ ] Test authenticated and unauthenticated flows

## Related Documentation

- [CLAUDE.md](/CLAUDE.md) - Project conventions and architecture
- [PR #23](https://github.com/brad-protocall/proto-trainer-next/pull/23) - Auth patterns implementation
- [src/lib/auth.ts](/src/lib/auth.ts) - Authentication helper functions

## Verification

After fixes, verify with:

```bash
# Build should pass
npm run build

# WebSocket should accept connections with userId
# (check ws-server logs for "New connection - userId: ...")

# API calls should succeed with x-user-id header
# (check network tab or server logs)
```
