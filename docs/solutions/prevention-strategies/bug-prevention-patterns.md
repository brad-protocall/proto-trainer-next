# Bug Prevention Patterns

Based on bugs discovered during the 2026-01-21 testing session, this document outlines prevention strategies, code patterns, and testing approaches to avoid recurrence.

---

## 1. Category Validation Mismatch

**Bug**: Frontend `VALID_CATEGORIES` in `bulk-import-modal.tsx` didn't match backend `ScenarioCategorySchema` in `validators.ts` after a category rename.

**Root Cause**: Enum values defined in multiple places with no compile-time enforcement.

### Prevention: Single Source of Truth for Enums

#### Code Pattern: Export from `validators.ts`

```typescript
// src/lib/validators.ts - SINGLE SOURCE OF TRUTH
export const ScenarioCategoryValues = [
  'cohort_training',
  'onboarding',
  'expert_skill_path',
  'account_specific',
] as const;

export const ScenarioCategorySchema = z.enum(ScenarioCategoryValues);
export type ScenarioCategory = z.infer<typeof ScenarioCategorySchema>;
```

```typescript
// src/components/bulk-import-modal.tsx - DERIVE from source
import { ScenarioCategoryValues } from '@/lib/validators';

const VALID_CATEGORIES: string[] = [...ScenarioCategoryValues, ''];
```

#### Lint Rule (ESLint)

Create custom rule or use `no-restricted-syntax` to flag hardcoded category arrays:

```javascript
// .eslintrc.js
{
  rules: {
    'no-restricted-syntax': [
      'error',
      {
        selector: 'ArrayExpression:has(Literal[value="cohort_training"])',
        message: 'Import ScenarioCategoryValues from @/lib/validators instead of hardcoding categories'
      }
    ]
  }
}
```

#### Type Check

```bash
# Add to CI/pre-commit
npx tsc --noEmit
```

#### Testing Strategy

```typescript
// __tests__/validators.test.ts
import { ScenarioCategoryValues } from '@/lib/validators';
import { ScenarioCategory } from '@/types';

describe('Category validation', () => {
  it('ScenarioCategoryValues matches ScenarioCategory type', () => {
    // This test will fail at compile time if types diverge
    const categories: ScenarioCategory[] = [...ScenarioCategoryValues];
    expect(categories).toHaveLength(ScenarioCategoryValues.length);
  });
});
```

---

## 2. 204 No Content Parsing Error

**Bug**: Frontend called `response.json()` on DELETE response returning 204 No Content, causing parse error.

**Root Cause**: No standard pattern for handling different response types.

### Prevention: Standard Response Handling Pattern

#### Code Pattern: Safe Response Parser

```typescript
// src/lib/api-client.ts

/**
 * Safely parse JSON response, handling 204 No Content
 */
export async function safeParseJson<T>(response: Response): Promise<T | null> {
  // 204 No Content - successful but no body
  if (response.status === 204) {
    return null;
  }

  // Check content-length or content-type before parsing
  const contentLength = response.headers.get('content-length');
  const contentType = response.headers.get('content-type');

  if (contentLength === '0' || !contentType?.includes('application/json')) {
    return null;
  }

  return response.json();
}

/**
 * Standard fetch wrapper with proper response handling
 */
export async function apiRequest<T>(
  url: string,
  options?: RequestInit
): Promise<{ ok: boolean; data?: T; error?: string }> {
  const response = await fetch(url, options);

  // DELETE success - no content expected
  if (response.status === 204) {
    return { ok: true };
  }

  const data = await safeParseJson<ApiResponse<T>>(response);

  if (!response.ok || !data?.ok) {
    return {
      ok: false,
      error: data?.error?.message || 'Request failed'
    };
  }

  return { ok: true, data: data.data };
}
```

#### Usage in Components

```typescript
// BEFORE (buggy)
const handleDelete = async (id: string) => {
  const response = await fetch(`/api/scenarios/${id}`, { method: 'DELETE' });
  const data = await response.json(); // CRASHES on 204
  if (!data.ok) throw new Error(data.error?.message);
};

// AFTER (safe)
const handleDelete = async (id: string) => {
  const response = await fetch(`/api/scenarios/${id}`, { method: 'DELETE' });
  // 204 No Content = success, skip JSON parsing
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error?.message || 'Delete failed');
  }
};
```

#### Lint Rule

```javascript
// .eslintrc.js - Warn on .json() calls without status check
{
  rules: {
    'no-restricted-syntax': [
      'warn',
      {
        selector: 'CallExpression[callee.property.name="json"]:not(:has(IfStatement))',
        message: 'Check response.ok or response.status before calling .json() - 204 responses have no body'
      }
    ]
  }
}
```

#### Testing Strategy

```typescript
// __tests__/api-handlers.test.ts
describe('DELETE endpoints', () => {
  it('returns 204 No Content on successful delete', async () => {
    const response = await fetch('/api/scenarios/123', { method: 'DELETE' });
    expect(response.status).toBe(204);
    expect(response.headers.get('content-length')).toBe('0');
  });
});

// __tests__/components/supervisor-dashboard.test.tsx
describe('handleDelete', () => {
  it('handles 204 response without JSON parsing', async () => {
    fetchMock.mockResponseOnce('', { status: 204 });
    await expect(handleDelete('123')).resolves.not.toThrow();
  });
});
```

---

## 3. Orphaned Records (Cascading Deletes)

**Bug**: Deleting scenarios left assignments pointing to non-existent records, causing foreign key errors or null references.

**Root Cause**: Prisma `onDelete: Restrict` prevents cascade, but doesn't provide user-friendly feedback.

### Prevention: Referential Integrity Checks

#### Current Schema (Correct)

```prisma
// prisma/schema.prisma
model Assignment {
  scenario   Scenario @relation(fields: [scenarioId], references: [id], onDelete: Restrict)
  //                                                                     ^^^^^^^^^^^^^^^^
  // Prevents deletion if assignments exist - GOOD
}
```

#### Code Pattern: Pre-Delete Validation

```typescript
// src/app/api/scenarios/[id]/route.ts

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const authResult = await requireSupervisor(request);
    if (authResult.error) return authResult.error;

    // Check for dependent records BEFORE deletion
    const assignmentCount = await prisma.assignment.count({
      where: { scenarioId: id },
    });

    if (assignmentCount > 0) {
      return apiError(
        {
          type: 'CONFLICT',
          message: `Cannot delete scenario: ${assignmentCount} assignment(s) depend on it`,
          details: {
            assignmentCount,
            suggestion: 'Delete or reassign these assignments first',
          },
        },
        409
      );
    }

    await prisma.scenario.delete({ where: { id } });
    return new Response(null, { status: 204 });
  } catch (error) {
    // Catch Prisma foreign key errors as backup
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2003') {
        return apiError(
          { type: 'CONFLICT', message: 'Cannot delete: related records exist' },
          409
        );
      }
    }
    return handleApiError(error);
  }
}
```

#### Alternative: Soft Deletes

```prisma
// prisma/schema.prisma
model Scenario {
  deletedAt DateTime? @map("deleted_at")

  // Add index for filtering
  @@index([deletedAt])
}
```

```typescript
// Soft delete instead of hard delete
await prisma.scenario.update({
  where: { id },
  data: { deletedAt: new Date() },
});

// All queries filter out deleted records
const scenarios = await prisma.scenario.findMany({
  where: { deletedAt: null },
});
```

#### Lint/Type Check

Add Prisma middleware to log or warn on deletions:

```typescript
// src/lib/prisma.ts
prisma.$use(async (params, next) => {
  if (params.action === 'delete' && params.model === 'Scenario') {
    console.warn(`[AUDIT] Deleting Scenario ${params.args.where.id}`);
  }
  return next(params);
});
```

#### Testing Strategy

```typescript
// __tests__/api/scenarios.test.ts
describe('DELETE /api/scenarios/[id]', () => {
  it('returns 409 when assignments exist', async () => {
    // Create scenario with assignment
    const scenario = await createScenario();
    await createAssignment({ scenarioId: scenario.id });

    const response = await fetch(`/api/scenarios/${scenario.id}`, {
      method: 'DELETE',
    });

    expect(response.status).toBe(409);
    const data = await response.json();
    expect(data.error.type).toBe('CONFLICT');
    expect(data.error.details.assignmentCount).toBeGreaterThan(0);
  });

  it('succeeds when no assignments exist', async () => {
    const scenario = await createScenario();
    const response = await fetch(`/api/scenarios/${scenario.id}`, {
      method: 'DELETE',
    });
    expect(response.status).toBe(204);
  });
});
```

---

## 4. Missing Auth Headers

**Bug**: `BulkImportModal` didn't include `x-user-id` header, causing 401 errors on import.

**Root Cause**: Manual `fetch()` calls instead of using centralized `authFetch` wrapper.

### Prevention: Centralized Auth Fetch Wrapper

#### Current Pattern (Good - needs enforcement)

```typescript
// src/lib/fetch.ts - Already exists!
export function createAuthFetch(userId: string) {
  return (url: string, options: RequestInit = {}): Promise<Response> => {
    return authFetch(url, { ...options, userId });
  };
}
```

#### Code Pattern: Require authFetch in Components

```typescript
// src/components/bulk-import-modal.tsx

interface BulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (result: ImportResult) => void;
  userId?: string; // Required for auth
}

export default function BulkImportModal({ userId, ...props }: BulkImportModalProps) {
  const handleImport = async () => {
    // CORRECT: Use authFetch with userId
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (userId) {
      headers['x-user-id'] = userId;
    }

    const response = await fetch('/api/scenarios/import', {
      method: 'POST',
      headers,
      body: JSON.stringify({ scenarios: apiScenarios }),
    });
    // ...
  };
}
```

#### Better Pattern: React Context for Auth

```typescript
// src/contexts/auth-context.tsx
import { createContext, useContext } from 'react';
import { createAuthFetch } from '@/lib/fetch';

interface AuthContextValue {
  userId: string;
  authFetch: ReturnType<typeof createAuthFetch>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ userId, children }: { userId: string; children: React.ReactNode }) {
  const authFetch = useMemo(() => createAuthFetch(userId), [userId]);
  return (
    <AuthContext.Provider value={{ userId, authFetch }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
```

```typescript
// src/components/bulk-import-modal.tsx
export default function BulkImportModal({ onClose, onSuccess }: BulkImportModalProps) {
  const { authFetch } = useAuth(); // Auth automatically included!

  const handleImport = async () => {
    const response = await authFetch('/api/scenarios/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenarios: apiScenarios }),
    });
    // ...
  };
}
```

#### Lint Rule

```javascript
// .eslintrc.js - Warn on raw fetch() in components
{
  rules: {
    'no-restricted-globals': [
      'warn',
      {
        name: 'fetch',
        message: 'Use authFetch from useAuth() hook instead of raw fetch() to ensure auth headers are included'
      }
    ]
  }
}
```

#### Testing Strategy

```typescript
// __tests__/components/bulk-import-modal.test.tsx
describe('BulkImportModal', () => {
  it('includes x-user-id header in import request', async () => {
    const mockFetch = jest.spyOn(global, 'fetch');
    render(<BulkImportModal userId="test-user-123" />);

    // Trigger import
    fireEvent.click(screen.getByText('Import'));

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/scenarios/import',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-user-id': 'test-user-123',
        }),
      })
    );
  });

  it('shows error when auth missing', async () => {
    render(<BulkImportModal />); // No userId
    fireEvent.click(screen.getByText('Import'));

    await waitFor(() => {
      expect(screen.getByText(/unauthorized/i)).toBeInTheDocument();
    });
  });
});
```

---

## Summary: Pre-Completion Checklist

Add to CLAUDE.md and CI pipeline:

```bash
#!/bin/bash
# scripts/pre-commit-check.sh

echo "Running pre-commit checks..."

# 1. Type check
echo "Checking TypeScript..."
npx tsc --noEmit || exit 1

# 2. Lint
echo "Running ESLint..."
npm run lint || exit 1

# 3. Check for hardcoded enums
echo "Checking for hardcoded categories..."
if grep -r "cohort_training.*onboarding.*expert_skill_path" src/ --include="*.tsx" | grep -v validators.ts | grep -v types/; then
  echo "ERROR: Found hardcoded category arrays. Import from validators.ts"
  exit 1
fi

# 4. Check for raw fetch without auth
echo "Checking for unauthenticated fetch calls..."
grep -r "await fetch(" src/components/ --include="*.tsx" | grep -v authFetch && echo "WARNING: Consider using authFetch for authenticated endpoints"

# 5. Check for .json() without status check (warning only)
grep -r "response.json()" src/ --include="*.tsx" -B2 | grep -v "response.ok" | grep -v "response.status" && echo "WARNING: Check response.ok before calling .json()"

echo "All checks passed!"
```

---

## Implementation Priority

| Bug | Impact | Effort | Priority |
|-----|--------|--------|----------|
| Auth context | High (affects all API calls) | Medium | P1 |
| Enum single source | Medium (category validation) | Low | P1 |
| 204 handling | Medium (delete operations) | Low | P2 |
| Pre-delete checks | Medium (data integrity) | Medium | P2 |

Recommended order:
1. Create `AuthProvider` context (fixes auth globally)
2. Export enum values from `validators.ts` (5 min fix)
3. Add `safeParseJson` utility (10 min fix)
4. Add pre-delete dependency checks (30 min per endpoint)

---

## 5. Fire-and-Forget + Shared Helper Pattern

*Discovered 2026-02-11 during post-session analysis scanning implementation.*

**Bug**: Ralph duplicated 90 lines of flag-building logic between the shared helper (`src/lib/analysis.ts`) and the manual endpoint (`src/app/api/sessions/[id]/analyze/route.ts`). The two implementations drifted, with the route handler missing idempotency checks the helper had.

**Root Cause**: When a background task needs to be callable both automatically (fire-and-forget) and manually (API endpoint), it's tempting to put logic in both places. Code duplication across async boundaries is especially dangerous because failures are silent.

### Prevention: Single Helper, Thin Wrappers

#### Code Pattern

```typescript
// src/lib/analysis.ts — ALL business logic lives here
export async function analyzeSession(
  sessionId: string,
  scenario: { title: string; prompt: string },
  transcript: TranscriptTurn[]
): Promise<AnalyzeResult | AnalyzeSkipped> {
  // Idempotency check
  const existing = await prisma.sessionFlag.findFirst({
    where: { sessionId, source: 'analysis' }
  });
  if (existing) return { status: 'skipped', reason: 'already_analyzed' };

  // LLM call
  const result = await callAnalyzerLLM(scenario, transcript);

  // Flag creation
  await prisma.sessionFlag.createMany({ data: flags });

  return { status: 'completed', flagCount: flags.length };
}
```

```typescript
// Route handler — thin wrapper (auth + data loading + call helper)
export async function POST(request: NextRequest, { params }: RouteParams) {
  const authResult = await requireSupervisor(request);
  if (authResult.error) return authResult.error;

  const session = await prisma.session.findUnique({ ... });
  const result = await analyzeSession(session.id, scenario, transcript);
  return apiSuccess(result);
}
```

```typescript
// Fire-and-forget caller — same helper, catch errors
analyzeSession(session.id, scenario, transcript).catch(err =>
  console.error(`[Analysis] Failed for session ${session.id}:`, err)
);
```

#### Why This Matters

- **One place to fix bugs**: If the idempotency logic has a bug, fix it once in the helper.
- **One place to add features**: Rate limiting, logging, metrics — add once, both callers get it.
- **Silent failures surface**: The fire-and-forget `.catch()` at least logs; duplicated code might not.

#### Testing Strategy

Test the helper directly. Route tests become thin integration tests.

```typescript
describe('analyzeSession', () => {
  it('returns skipped when already analyzed', async () => {
    await createFlag({ sessionId: 'test', source: 'analysis' });
    const result = await analyzeSession('test', scenario, transcript);
    expect(result.status).toBe('skipped');
  });
});
```

---

## 6. Dev Server Hot-Reload and Return Type Changes

*Discovered 2026-02-11 during post-session analysis refactor.*

**Bug**: After refactoring `analyzeSession()` from `void` to returning `AnalyzeResult | AnalyzeSkipped`, the dev server returned 500 errors. The route handler tried to serialize the result, but the hot-reloaded module still had the old `void` return type cached. Restarting the dev server fixed it.

**Root Cause**: Next.js hot-reload (HMR) doesn't always invalidate server-side module caches when a function's return type changes structurally (especially in `.ts` files imported across module boundaries).

### Prevention

**Rule**: When refactoring function return types that change from `void` to a concrete type (or between structurally different types), **restart the dev server before E2E testing**.

Signs this is happening:
- Route works in tests but returns 500 in browser
- Error message references the old return shape
- `npx tsc --noEmit` passes clean (types are correct, cache is wrong)

#### When to Restart

| Change | Restart Needed? |
|--------|----------------|
| Add/remove a property from an existing return type | Usually no |
| Change `void` → concrete type | **Yes** |
| Change one interface → different interface | **Yes** |
| Rename a type without changing shape | No |
| Add new exported function | Usually no |

---

## 7. File Picker in Modal Containers

*Discovered 2026-02-11 during document consistency review implementation.*

**Bug**: Programmatic `fileInputRef.current?.click()` didn't reliably trigger the OS file dialog when the button was inside a scrollable modal (`overflow-y-auto`, `max-h-[80vh]`). Playwright E2E tests showed 3 file chooser dialogs queued but the OS never showed the picker.

**Root Cause**: Browser security restrictions on programmatic `.click()` inside complex container hierarchies. The click event loses its "user-initiated" status when it bubbles through scrollable containers with `overflow` properties, and the browser suppresses the file dialog as a potential popup.

### Prevention: Native `<label>` Pattern

```tsx
// GOOD: Works in any container including scrollable modals
<label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
  Upload File
  <input
    type="file"
    accept=".pdf"
    onChange={handleFileChange}
    className="hidden"
  />
</label>
```

```tsx
// BAD: Fails inside scrollable modal containers
const fileInputRef = useRef<HTMLInputElement>(null);

<input ref={fileInputRef} type="file" className="hidden" />
<button onClick={() => fileInputRef.current?.click()}>
  Upload File
</button>
```

#### Why `<label>` Works

The `<label>` element has native browser behavior: clicking it activates its associated input. This bypasses the programmatic click restrictions because the browser treats it as a direct user interaction with the input element.

#### Where This Applies

Any file upload UI inside:
- Modals with `overflow-y-auto` or `overflow-y-scroll`
- Containers with `max-h-*` constraints
- Nested scrollable divs
- Dialog elements

If the file picker is in a simple page layout (no scroll containers), programmatic `.click()` works fine. But the `<label>` pattern works everywhere, so prefer it as the default.

---

## 8. Prisma Client Regeneration After Schema Changes

*Discovered 2026-02-11 during document consistency review implementation.*

**Bug**: After adding a `DocumentReview` model to `schema.prisma` and applying the migration with `npx prisma migrate dev`, the route handler returned: `Unknown field 'documentReview' for include statement on model 'Session'`.

**Root Cause**: `prisma migrate dev` applies the SQL migration but the TypeScript Prisma client in `node_modules/.prisma/client` was still generated from the old schema. The dev server's hot-reload loaded the new route code but used the stale Prisma client.

### Prevention

**Rule**: After ANY schema change, always run both steps:

```bash
npx prisma migrate dev --name <name>  # Applies migration AND regenerates client
# OR if migration already applied:
npx prisma generate                   # Just regenerate client
```

Then **restart the dev server** (`Ctrl+C` and `npm run dev`).

#### Why `migrate dev` Alone Isn't Enough

`prisma migrate dev` does regenerate the client, but the running dev server has the old client cached in memory. The hot-reload system loads new `.ts` files but doesn't re-import `@prisma/client` because it's in `node_modules/`.

#### Checklist After Schema Changes

1. Edit `prisma/schema.prisma`
2. Run `npx prisma migrate dev --name <name>`
3. Verify migration SQL looks correct
4. Stop the dev server (`Ctrl+C`)
5. Restart: `npm run dev`
6. Test the new model/field in the browser

#### Signs the Client Is Stale

- `Unknown field 'X' for include statement on model 'Y'`
- `Unknown arg 'X' in data.X for type YCreateInput`
- TypeScript autocomplete works (IDE reads schema) but runtime fails (server has old client)
