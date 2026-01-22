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
