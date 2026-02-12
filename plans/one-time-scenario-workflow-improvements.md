# One-Time Scenario Workflow Improvements

> **Plan v2** — Updated with feedback from DHH, Kieran, and Simplicity reviewers.

## Overview

Streamline the one-time scenario creation workflow so supervisors can go from complaint or idea to assigned practice scenario in a single flow. Aligns proto-trainer-next with the personalized-trainer UX pattern: One-Time tab shows two creation paths (manual builder + complaint generator), both include a learner picker, both auto-create assignments on save.

## Problem Statement

Currently:
- The only way to create a one-time scenario is "Generate from Complaint" — no manual builder exists
- "Generate from Complaint" appears in both Global and One-Time tabs (wrong placement)
- Generated scenarios save with `isOneTime: true` but can't be assigned — the assignment dropdown only shows global scenarios
- No learner picker in the complaint generator, so assignment requires a separate multi-step process
- No file upload for complaint text (paste-only)
- No way to promote a useful one-time scenario to global for reuse

## Proposed Solution

Five changes, ordered by implementation dependency:

### Change 1: Move "Generate from Complaint" to One-Time Tab Only
**Files:** `src/components/supervisor-dashboard.tsx`

Currently the button renders unconditionally (line ~708). Wrap it in `scenarioFilter === "one-time"` conditional.

**Before:**
```
Global tab:  [+ Create Global Scenario] [Import Scenarios] [Generate from Complaint]
One-Time tab: [Generate from Complaint]
```

**After:**
```
Global tab:  [+ Create Global Scenario] [Import Scenarios]
One-Time tab: [+ Create One-Time Scenario] [Generate from Complaint]
```

### Change 2: Manual "Create One-Time Scenario" via Existing Form
**Files:** `src/components/supervisor-dashboard.tsx`

> **Reviewer feedback applied:** All 3 reviewers agreed — do NOT create a new modal component. The existing Create/Edit Scenario form (lines 944-1256 of supervisor-dashboard.tsx) already has Title, Description, Mode, Category, Prompt, Evaluator Context. Extend it with a variant mode instead.

When `scenarioFilter === "one-time"` and the user clicks "+ Create One-Time Scenario":
- Open the **same** `showForm` modal but with a `formVariant: "one-time"` state flag
- Show an additional **Learner** `<select>` dropdown (required) — only when variant is "one-time"
- Show **Skills** selector using toggle chips matching the complaint generator's pattern (not comma-separated text)
- Force `isOneTime: true` on save (hidden from user)
- Pass `assignTo: selectedCounselorId` in the request body
- Hide the account picker (one-time scenarios inherit the default account)

**Learner dropdown:** Reuse the `counselors` list already loaded in `supervisor-dashboard.tsx` (line 122). Simple `<select>` — accounts have <50 counselors. Searchable dropdown is a future enhancement if needed.

### Change 3: Add Learner Picker to Complaint Generator + Auto-Assignment
**Files:** `src/components/generate-scenario-modal.tsx`

Add a learner dropdown to the **review/edit phase** (after LLM generates the scenario). Required field.

Changes to `generate-scenario-modal.tsx`:
- Accept new prop: `counselors: User[]`
- Add state: `assignTo: string` (matches API field name to reduce cognitive mapping)
- Add `<select>` in the edit phase, above the Save button
- Modify `handleSave` to pass `assignTo` in the POST body
- Disable Save button until learner is selected

### Change 4: Add File Upload to Complaint Generator
**Files:** `src/components/generate-scenario-modal.tsx`, new `src/app/api/scenarios/extract-text/route.ts`

> **Reviewer feedback applied:** DHH said kill the API route and do client-side extraction. However, the framework research confirmed `unpdf` is server-side only in this project (needs Node.js worker). We keep the server route but move it under `/api/scenarios/extract-text` (Kieran's feedback — scope to scenario domain).

Add a file upload button below the complaint textarea in the input phase.

**UX pattern:**
```
┌──────────────────────────────────────────────┐
│ [Complaint textarea - 8 rows]                │
│                                              │
│                                              │
├──────────────────────────────────────────────┤
│ [Upload PDF/TXT]  filename.pdf  ✕  234/15,000│
└──────────────────────────────────────────────┘
```

**File handling:**
- **TXT files**: Read client-side via `file.text()` → populate textarea
  - **Client-side size validation BEFORE reading** (Kieran feedback): check `file.size` before `file.text()` to avoid freezing browser on large files
- **PDF files**: Upload to `POST /api/scenarios/extract-text` → server extracts with `unpdf` → returns text → populate textarea
- **Validation**: 10MB max (both PDF and TXT), `.pdf` or `.txt` only
  - Client-side: check file extension and size before upload
  - Server-side: PDF magic bytes check, size check
  - `accept` attribute: `accept=".pdf,.txt,application/pdf,text/plain"` (Kieran feedback — be explicit)
- **Loading state**: Show spinner on upload area, disable textarea during extraction
- **Error handling**: Clear error message if extraction fails
- Use `<label>` wrapping hidden `<input type="file">` pattern (CLAUDE.md Bug Prevention Pattern #7)
- File upload **replaces** textarea content (not appends)
- Show filename after upload with "x" to clear

**API route** (`src/app/api/scenarios/extract-text/route.ts`):
- Scoped under `/api/scenarios/` (not top-level)
- Accepts FormData with `file` field
- Validates PDF magic bytes, 10MB limit
- Extracts text with `unpdf` (`extractText(buffer, { mergePages: true })`)
- Returns `{ ok: true, data: { text: string, fileName: string } }`
- Requires supervisor auth
- If extracted text is empty: return 400 "No text found in PDF. The file may contain only images."

### Change 5: Promote One-Time to Global
**Files:** `src/components/supervisor-dashboard.tsx`

Add an inline "Promote to Global" link/button on each scenario card in the One-Time tab view. Sits next to existing "Edit" and "Delete" actions.

**Behavior:**
- Click → `window.confirm("This will make the scenario visible to all supervisors for assignment. Continue?")` (Kieran feedback — lightweight confirmation for PII-adjacent content from complaints)
- If confirmed → `PUT /api/scenarios/{id}` with `{ isOneTime: false }`
- On success: refresh scenario list, scenario disappears from One-Time tab
- No toast infrastructure needed — the scenario disappearing from the list is sufficient feedback
- Existing assignments remain valid

## API Changes

### Extend `POST /api/scenarios` — Dedicated Schema for One-Time + Assignment

> **Reviewer feedback applied:** Kieran flagged that adding `assignTo` directly to `createScenarioSchema` contaminates the update schema (via `.partial()`) and the external API. Use a dedicated extended schema instead.

**File:** `src/lib/validators.ts`

```typescript
// NEW: Dedicated schema for one-time scenario creation with auto-assignment
export const createOneTimeScenarioWithAssignmentSchema = createScenarioSchema.extend({
  assignTo: z.string().uuid(),
  isOneTime: z.literal(true),
});
```

**File:** `src/app/api/scenarios/route.ts`

In the POST handler, try parsing with the extended schema first:

```typescript
// Try one-time-with-assignment schema first
const oneTimeResult = createOneTimeScenarioWithAssignmentSchema.safeParse(body);
if (oneTimeResult.success) {
  // Validate counselor exists and has correct role
  const counselor = await prisma.user.findUnique({
    where: { id: oneTimeResult.data.assignTo }
  });
  if (!counselor || counselor.role !== 'counselor') {
    return apiError({ type: 'VALIDATION_ERROR', message: 'Invalid learner selected' }, 400);
  }

  const result = await prisma.$transaction(async (tx) => {
    const scenario = await tx.scenario.create({ data: scenarioData });

    const assignment = await tx.assignment.create({
      data: {
        scenarioId: scenario.id,
        counselorId: oneTimeResult.data.assignTo,
        accountId: scenario.accountId,  // Kieran: was missing
        assignedBy: user.id,             // Kieran: was missing
        status: 'pending',
      },
    });

    return { scenario, assignment };
  });

  // Handle evaluator context file write after transaction
  // (existing pattern — evaluator context persisted outside transaction)

  return apiSuccess({ ...result.scenario, assignmentId: result.assignment.id }, 201);
}

// Fall through to existing createScenarioSchema validation
const standardResult = createScenarioSchema.safeParse(body);
// ... existing handler ...
```

**Response type:** Returns existing `Scenario` shape with an additional `assignmentId` field when auto-assignment occurred. No new response type needed — just an optional field.

### New `POST /api/scenarios/extract-text` — PDF/TXT Text Extraction

**File:** New `src/app/api/scenarios/extract-text/route.ts`

Thin endpoint scoped to scenario domain. Reuses `unpdf` pattern from `review-document/route.ts`.

```typescript
// Accept FormData with 'file' field
// Validate: PDF or TXT, max 10MB, PDF magic bytes for PDFs
// PDF: extractText(buffer, { mergePages: true })
// TXT: new TextDecoder().decode(buffer)
// Return: { ok: true, data: { text, fileName } }
// Empty text: return 400 "No text found"
// Auth: requireSupervisor
```

## Acceptance Criteria

### Change 1: Button Visibility
- [ ] Global tab shows: "+ Create Global Scenario", "Import Scenarios" (NO complaint generator)
- [ ] One-Time tab shows: "+ Create One-Time Scenario", "Generate from Complaint"

### Change 2: Manual Create One-Time (Extended Existing Form)
- [ ] "+ Create One-Time Scenario" opens the existing scenario form with one-time variant
- [ ] Learner dropdown visible and required (blocks save if empty)
- [ ] Skills use toggle chip UI (matching complaint generator pattern, not comma-separated text)
- [ ] Save creates scenario with `isOneTime: true` AND assignment for selected learner
- [ ] Both created atomically (transaction) — if either fails, neither persists
- [ ] Transaction includes `assignedBy` (supervisor) and `accountId`
- [ ] Counselor validated (exists + has counselor role) before transaction
- [ ] Modal closes on success, scenario list refreshes
- [ ] Error displayed in modal if save fails (modal stays open, no data lost)
- [ ] Save button disabled until Title, Learner, and Prompt are filled
- [ ] Category dropdown derives from `ScenarioCategoryValues` (single source of truth, fixes existing bug)

### Change 3: Learner Picker in Complaint Generator
- [ ] Edit/review phase shows learner dropdown (required field)
- [ ] Save creates scenario + assignment atomically (same API path as Change 2)
- [ ] Save button disabled until learner is selected
- [ ] Learner dropdown populated from `counselors` prop

### Change 4: File Upload
- [ ] Upload button visible below complaint textarea in input phase
- [ ] `accept=".pdf,.txt,application/pdf,text/plain"` on file input
- [ ] Client-side file size validation BEFORE reading (10MB max)
- [ ] Client-side file extension validation (show error for .docx, etc.)
- [ ] PDF: uploads to `/api/scenarios/extract-text`, server extracts, populates textarea
- [ ] TXT: reads client-side via `file.text()`, populates textarea
- [ ] Loading spinner during PDF extraction, textarea disabled
- [ ] Shows filename after upload with "x" clear button
- [ ] Error messages for: extraction failure, empty PDF, encrypted PDF, unsupported type, size exceeded
- [ ] Uses `<label>` wrapping hidden input pattern (not programmatic `.click()`)
- [ ] `e.target.value = ""` after reading (allows re-selecting same file)

### Change 5: Promote to Global
- [ ] "Promote to Global" action visible on each one-time scenario card
- [ ] Click shows `window.confirm()` with PII warning
- [ ] If confirmed: sends PUT with `{ isOneTime: false }`
- [ ] Scenario disappears from One-Time list after promotion
- [ ] Scenario appears in Global list on next view
- [ ] Existing assignments remain unaffected

## Edge Cases & Decisions

| Edge Case | Decision |
|-----------|----------|
| No learners in account | Show disabled dropdown with "No learners available" text. Block save. |
| Learner deleted between form open and save | Counselor validation before transaction fails → show error "The selected learner may no longer exist." Transaction never starts, no orphans. |
| PDF with only images (no text) | Server returns 400 "No text found in PDF. The file may contain only images." |
| Encrypted/password-protected PDF | Server returns 400 "Could not read PDF. The file may be encrypted or password-protected." |
| File > 10MB | Client-side validation blocks upload with size error before any network call |
| Unsupported file type (.docx) | Client-side `accept` attribute + extension check blocks with error |
| Large TXT file | Client-side size check before `file.text()` prevents browser freeze |
| Promote scenario with active assignments | Allow. Assignments remain valid. Scenario now reusable. |
| Promote scenario with PII content | `window.confirm` warns supervisor before promoting |
| Generate from Complaint → LLM fails | Existing error handling preserved. User stays in input phase with complaint text intact. |
| Duplicate assignment (same counselor + scenario) | Existing conflict handling applies — returns 409, shown as error. |
| `assignTo` on updateScenarioSchema | Not possible — dedicated `createOneTimeScenarioWithAssignmentSchema` keeps it off the update path |

## Implementation Order

1. **API: Dedicated schema + transaction logic** (30 min) — shared infrastructure for Changes 2 and 3
2. **Change 1: Move button** (5 min) — trivial conditional
3. **Change 5: Promote to Global** (20 min) — simple inline action + confirm + PUT
4. **Change 2: Extend existing form for one-time variant** (1 hr) — add learner dropdown, skills chips, isOneTime flag
5. **Change 4: File upload + extract-text endpoint** (1-2 hrs) — new route, modal UI changes
6. **Change 3: Learner picker in complaint generator** (30 min) — reuses API from step 1

## Files Changed

| File | Change Type | Description |
|------|-------------|-------------|
| `src/lib/validators.ts` | Modify | Add `createOneTimeScenarioWithAssignmentSchema` (dedicated, does not pollute existing schemas) |
| `src/app/api/scenarios/route.ts` | Modify | Try one-time schema first, $transaction with full assignment data |
| `src/components/supervisor-dashboard.tsx` | Modify | Button layout, one-time form variant with learner dropdown + skills chips, promote action |
| `src/components/generate-scenario-modal.tsx` | Modify | Add learner picker (edit phase), file upload (input phase), pass `assignTo` |
| `src/app/api/scenarios/extract-text/route.ts` | **New** | PDF/TXT text extraction (scoped under scenarios domain) |

**No new component files** — extends existing form instead of creating parallel modal.

## Reviewer Feedback Applied

| Reviewer | Feedback | Action Taken |
|----------|----------|--------------|
| All 3 | Don't create new modal — extend existing form | Changed to form variant approach |
| Kieran | Don't add `assignTo` to `createScenarioSchema` — contaminates update schema | Dedicated `createOneTimeScenarioWithAssignmentSchema` |
| Kieran | Transaction missing `assignedBy`, `accountId`, counselor validation | Added all three to transaction code |
| Kieran | Skills should use toggle chips, not comma-separated text | Changed to match existing complaint generator pattern |
| Kieran | Add lightweight confirmation for Promote (PII concern) | Added `window.confirm()` |
| Kieran | Define response type explicitly | Returns scenario + optional `assignmentId` |
| Kieran | Move extract-text under `/api/scenarios/` | Route is now `/api/scenarios/extract-text` |
| Kieran | Client-side TXT size validation before `file.text()` | Added explicit check |
| Kieran | Specify `accept` attribute explicitly | Added `accept=".pdf,.txt,application/pdf,text/plain"` |
| DHH | Fix category dropdown to derive from `ScenarioCategoryValues` | Added to acceptance criteria |
| DHH | Counselor list loaded without `authFetch` — known issue | Noted, not changing in this PR |

## Testing Plan

### Manual Testing
1. Create one-time scenario via extended form → verify assignment appears in counselor dashboard
2. Generate from complaint with learner selected → verify same
3. Upload PDF complaint → verify text populates textarea
4. Upload TXT complaint → verify text populates textarea
5. Upload invalid file (.docx) → verify error
6. Upload large file (>10MB) → verify client-side rejection
7. Upload image-only PDF → verify "no text found" error
8. Promote one-time to global → verify confirm dialog → verify it moves between tabs
9. Verify Global tab no longer shows complaint generator button
10. Verify transaction: invalid counselorId → verify no orphan scenario
11. Verify Save disabled until learner selected (both modals)

### Type Check
```bash
npx tsc --noEmit  # Zero errors
npm run lint       # Zero warnings
```

## References

- Existing scenario form: `src/components/supervisor-dashboard.tsx` (lines 944-1256)
- Existing complaint generator: `src/components/generate-scenario-modal.tsx`
- File upload pattern: `src/components/document-review-button.tsx` (label wrapping)
- PDF extraction pattern: `src/app/api/sessions/[id]/review-document/route.ts`
- Assignment creation: `src/app/api/assignments/route.ts` (for `assignedBy`, `accountId` fields)
- Bug Prevention Pattern #7 (file picker in modals): CLAUDE.md
- Personalized-trainer one-time scenario form: reference screenshots
