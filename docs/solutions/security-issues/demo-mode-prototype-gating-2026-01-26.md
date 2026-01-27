---
title: Demo Mode Pattern for Prototype Feature Gating
date: 2026-01-26
severity: P1
category: security-issues
components:
  - src/components/counselor-dashboard.tsx
  - src/lib/env.ts
  - .env.example
  - CLAUDE.md
symptoms:
  - Prototype features accessible in production
  - User impersonation possible via URL parameter
  - Counselors can view other counselors' assignments
root_causes:
  - Demo features not gated behind environment variable
  - No visual distinction between demo and production mode
  - Missing documentation for SWE handoff
commits:
  - 6b7f75b (P1 security fixes)
  - 5c1f4ed (DEMO_MODE implementation)
---

# Demo Mode Pattern for Prototype Feature Gating

## Problem Statement

During prototype development, features like user switching are essential for demos and testing:
- Stakeholders need to quickly switch between counselor views
- Developers need to test different user perspectives
- QA needs to verify role-based access

However, these same features become **security vulnerabilities** in production:
- URL parameter `?userId=xxx` allows viewing any counselor's assignments
- No authentication prevents impersonation
- Sensitive training data exposed across users

### The Risk

If deployed to production without changes:
1. Any user can view another user's assignments by modifying the URL
2. Training evaluations and feedback are accessible to unauthorized users
3. HIPAA/privacy compliance violations possible with real counselor data

## Solution: NEXT_PUBLIC_DEMO_MODE Environment Variable

Gate all prototype-only features behind a single environment variable that must be explicitly enabled.

### 1. Environment Configuration

**`.env.example`**:
```env
# Demo Mode - enables prototype features like user switching
# REMOVE FOR PRODUCTION - allows viewing other users' data
NEXT_PUBLIC_DEMO_MODE=true
```

**`src/lib/env.ts`**:
```typescript
import { z } from 'zod'

const envSchema = z.object({
  // ... other env vars

  // DEMO_MODE enables prototype features like user switching (remove for production)
  NEXT_PUBLIC_DEMO_MODE: z.string().optional().transform(val => val === 'true'),
})

export const env = envSchema.parse(process.env)
```

### 2. Conditional Rendering Pattern

**`src/components/counselor-dashboard.tsx`**:
```typescript
{/* Counselor Selector - DEMO_MODE only (remove for production) */}
{process.env.NEXT_PUBLIC_DEMO_MODE === 'true' && allCounselors.length > 1 ? (
  <div className="flex flex-col items-center mb-6">
    <label className="text-gray-400 text-sm mb-2 font-marfa">
      <span className="text-yellow-500">[DEMO]</span> Viewing as:
    </label>
    <select
      value={currentUser?.id || ""}
      onChange={(e) => handleCounselorChange(e.target.value)}
      className="bg-gray-800 border border-yellow-600 rounded-lg px-4 py-2
                 text-white font-marfa font-bold text-lg
                 focus:outline-none focus:border-brand-orange
                 cursor-pointer min-w-[200px] text-center"
    >
      {allCounselors.map((counselor) => (
        <option key={counselor.id} value={counselor.id}>
          {counselor.display_name}
        </option>
      ))}
    </select>
  </div>
) : currentUser ? (
  // Production: read-only display of current user
  <div className="flex flex-col items-center mb-6">
    <label className="text-gray-400 text-sm mb-2 font-marfa">
      Logged in as:
    </label>
    <span className="text-white font-marfa font-bold text-lg">
      {currentUser.display_name}
    </span>
  </div>
) : null}
```

### 3. Visual Indicator Pattern

When `DEMO_MODE=true`, demo features must be visually distinct:

| Element | Style | Purpose |
|---------|-------|---------|
| `[DEMO]` label | `text-yellow-500` | Clearly marks feature as prototype-only |
| Yellow border | `border-yellow-600` | Visual contrast from normal UI elements |
| Explicit label | "Viewing as:" | Indicates impersonation, not real login |

This ensures anyone viewing the app immediately understands they're in demo mode.

### 4. Behavior Differences

| Behavior | `DEMO_MODE=true` | `DEMO_MODE=false` (Production) |
|----------|------------------|-------------------------------|
| User selector | Dropdown to switch users | Read-only current user display |
| URL `?userId=` | Accepted, switches user | Ignored, uses session auth |
| Visual indicator | Yellow `[DEMO]` badge | None |

## SWE Handoff Checklist (CLAUDE.md)

This section was added to `CLAUDE.md` for future engineers:

```markdown
## Prototype-Only Features (SWE Handoff Checklist)

These features exist for demo/prototype purposes and **MUST be addressed before production**:

| Feature | Location | Action Required |
|---------|----------|-----------------|
| **User Switching** | `counselor-dashboard.tsx` | Gated by `NEXT_PUBLIC_DEMO_MODE`. Set to `false` or remove entirely. Replace with proper session-based auth. |
| **No Real Auth** | Throughout | Uses `x-user-id` header. Replace with JWT/session auth. |
| **Seeded Test Users** | `prisma/seed.ts` | Remove test data seeding for production. |

When `NEXT_PUBLIC_DEMO_MODE=true`:
- Counselor dashboard shows a user selector (yellow border, "[DEMO]" label)
- Any user can view any other user's assignments (for demos)

When `NEXT_PUBLIC_DEMO_MODE=false` (production):
- Counselor dashboard shows current user name only (read-only)
- User switching is disabled
```

## Implementation Details

### Why `NEXT_PUBLIC_` Prefix?

Next.js requires the `NEXT_PUBLIC_` prefix for environment variables to be available in client-side code. Without it, `process.env.DEMO_MODE` would be `undefined` in the browser.

### Why String Comparison?

```typescript
process.env.NEXT_PUBLIC_DEMO_MODE === 'true'
```

Environment variables are always strings. The Zod transform in `env.ts` handles boolean conversion for server-side code, but client-side code sees the raw string.

### Complete Feature Gating

The pattern gates the entire feature, not just individual elements:
- **GOOD**: `{DEMO_MODE && <UserSelector />}` - Whole feature hidden
- **BAD**: `<UserSelector disabled={!DEMO_MODE} />` - Feature visible but disabled

## Testing

### Verify Demo Mode Active
```bash
# Set in .env
NEXT_PUBLIC_DEMO_MODE=true

# Should see:
# - [DEMO] label in yellow
# - Yellow-bordered dropdown
# - All counselors selectable
```

### Verify Demo Mode Disabled
```bash
# Set in .env (or remove line entirely)
NEXT_PUBLIC_DEMO_MODE=false

# Should see:
# - No [DEMO] label
# - Static text showing current user
# - No dropdown selector
# - URL ?userId= parameter ignored
```

## Related Patterns

This pattern can be extended to other prototype features:

```typescript
// Generic pattern for any demo-only feature
{process.env.NEXT_PUBLIC_DEMO_MODE === 'true' && (
  <DemoOnlyFeature>
    <span className="text-yellow-500">[DEMO]</span>
    {/* Feature content */}
  </DemoOnlyFeature>
)}
```

## Production Deployment Checklist

Before deploying to production:

1. [ ] Set `NEXT_PUBLIC_DEMO_MODE=false` or remove from `.env`
2. [ ] Verify no `[DEMO]` badges appear in UI
3. [ ] Test that URL `?userId=` parameter has no effect
4. [ ] Implement real authentication (JWT/session-based)
5. [ ] Remove seeded test users from production database
6. [ ] Audit other `DEMO_MODE` usages in codebase

## Files Changed

| File | Change |
|------|--------|
| `src/lib/env.ts` | Added `NEXT_PUBLIC_DEMO_MODE` to Zod schema |
| `src/components/counselor-dashboard.tsx` | Conditional rendering with visual indicators |
| `.env.example` | Documented DEMO_MODE with warning comment |
| `CLAUDE.md` | Added "Prototype-Only Features" section |
