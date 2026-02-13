---
title: "feat: Account Procedures for Evaluator"
type: feat
date: 2026-02-13
status: reviewed
reviewers: dhh-rails, kieran-typescript, code-simplicity, key-choices-summarizer
---

# Account Procedures for Evaluator

## Overview

Enable the AI evaluator to grade counselor performance against organization-specific procedure documents (200+ page PDFs). Supervisors upload procedure sets at the account level, and the system automatically creates a per-account vector store for semantic search. When creating scenarios, supervisors specify which procedure sections are relevant. At evaluation time, the evaluator uses OpenAI's `file_search` to retrieve and grade against the actual procedure text.

**Why this matters**: When a complaint says "counselor failed to follow procedure 6100 (Suicide Risk Assessment)," the supervisor creates a training scenario from that complaint. The evaluator needs to grade whether the counselor follows procedure 6100 correctly in the do-over — not just general crisis counseling standards, but the *specific documented procedure*. The procedures used should always be the most current version, even if the original complaint predates a procedure update.

## Problem Statement

The evaluator currently grades against:
1. **Scenario-specific criteria** (evaluator context) — custom rubric per scenario
2. **General crisis counseling knowledge** — baked into the evaluator prompt

What's missing: the evaluator cannot access or grade against the organization's actual procedure documents. The `Account.vectorStoreId`, `Account.policiesProceduresPath`, and `Scenario.relevantPolicySections` fields all exist in the database schema but are never populated or used at evaluation time.

**Scale**: Hundreds of accounts exist, but 25-50 are expected to have procedure sets uploaded (those with complaints or cohort training needs).

## Proposed Solution

### Three-Layer Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ ACCOUNT LEVEL (uploaded per account, re-uploaded as needed)      │
│ Full procedure PDF → auto-created per-account vector store       │
│ "717 Procedure Set.pdf" (4.6 MB, 200+ pages)                   │
│ Isolated: evaluator can only search THIS account's procedures   │
│ Upload history tracked: who uploaded, when, filename             │
└──────────────────────────┬──────────────────────────────────────┘
                           │ file_search retrieves relevant chunks
┌──────────────────────────┴──────────────────────────────────────┐
│ SCENARIO LEVEL (per scenario)                                    │
│ relevantPolicySections: "6100 Suicide Risk Assessment Procedure, │
│ 2751 Abuse Reporting"                                            │
│ → Injected into evaluator prompt as search/focus guidance        │
│ (No document name needed — store is account-isolated)           │
└──────────────────────────┬──────────────────────────────────────┘
                           │ guides what the evaluator looks for
┌──────────────────────────┴──────────────────────────────────────┐
│ EVALUATION TIME                                                  │
│ Evaluator prompt includes relevantPolicySections as guidance     │
│ file_search retrieves actual procedure text from vector store    │
│ Evaluator grades transcript against specific procedures          │
│ Evaluation notes whether procedure-based grading was used        │
└─────────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

**Per-account vector stores (not shared)**
- Each account gets its own vector store, auto-created on first PDF upload
- Evaluator can only search that account's procedures — no cross-contamination
- Supervisors don't need to specify document name, just section references
- `relevantPolicySections` stays simple: "6100 Suicide Risk Assessment" not "717 Procedure Set → 6100 Suicide Risk Assessment"

**Raw PDF upload to OpenAI**
- OpenAI's Files API natively supports PDF with `purpose: 'assistants'`
- Preserves document structure (headers, sections, tables) for better retrieval
- No need to extract text with `unpdf` first — OpenAI handles PDF parsing internally

**Automatic vector store lifecycle**
- First upload: creates vector store, uploads file, stores IDs on Account
- Replacement upload: uploads new file first, then removes old (safe order — never leaves store empty)
- Supervisor never sees or manages vector stores directly

**Upload-first, delete-second replacement** (from review)
- Upload the new PDF to OpenAI BEFORE deleting the old one
- If the upload fails, the old procedures are still intact and the evaluator still works
- Only after successful upload do we remove the old file

**Always upload current procedures**
- Supervisors should upload procedures even if they uploaded recently — procedures may have changed
- The evaluator should always grade against the CURRENT procedures, not the ones active at the time of the original complaint
- Upload history provides audit trail of what was active when

**Account number validation on upload**
- Procedure PDFs contain the account number in their content
- On upload, extract text from the first page and verify the account number matches
- Hard block if mismatch — reject the upload with a clear error message
- Prevents uploading the wrong account's procedures

**Upload history tracking**
- Each upload recorded in a `procedureHistory` JSON field on Account
- Entries: `{filename, uploadedAt, uploadedBy, previousFilename?}`
- Most recent entry = current procedures; older entries = audit trail
- Requires one small database migration (new JSON field)

## Technical Approach

### What Already Exists (DO NOT recreate)

| Component | Location | Status |
|-----------|----------|--------|
| `Account.vectorStoreId` | `prisma/schema.prisma:33` | Field exists, never populated via UI |
| `Account.policiesProceduresPath` | `prisma/schema.prisma:32` | Field exists, never populated via UI |
| `Scenario.relevantPolicySections` | `prisma/schema.prisma:53` | Field exists, never read at eval time |
| `uploadPolicyToVectorStore()` | `src/lib/openai.ts:136-156` | Function exists, needs safe replace semantics |
| `findOrCreateVectorStore()` | `src/lib/openai.ts:125-131` | Function exists, needs optimization (see below) |
| Responses API with file_search | `src/lib/openai.ts:278-292` | Working, used when vectorStoreId present |
| vectorStoreId resolution chain | `evaluate/route.ts:108` | `scenario.account.vectorStoreId` already resolved |
| PDF magic bytes validation | `review-document/route.ts:72` | Pattern established |
| PDF text extraction (`unpdf`) | `extract-text/route.ts` | Working, reuse for account number validation |
| `<label>` file upload pattern | Multiple components | Established pattern for modal-safe uploads |

### What Needs to Be Built

**Single phase** (Phases 1+2 merged per review — upload alone delivers no value without evaluation wiring).

##### 1. Add `procedureHistory` JSON field to Account

**File**: `prisma/schema.prisma`

Add a JSON field to track upload history:

```prisma
model Account {
  // ... existing fields
  procedureHistory Json? @map("procedure_history") // Array of {filename, uploadedAt, uploadedBy}
}
```

**Migration**: `npx prisma migrate dev --name add-procedure-history`

##### 2. Extend Account PATCH API for PDF uploads with validation

**File**: `src/app/api/accounts/[id]/route.ts`

Current state: Only accepts `.txt` and `.md` files (lines 73-79). No file size limit.

Changes:
- Add `.pdf` to allowed extensions
- Add PDF magic bytes validation (pattern from `review-document/route.ts`)
- Add file size limit: **20 MB**
- **Account number validation**: Extract text from first page using `unpdf`, check for account number/name match. Hard block on mismatch.
- Try/catch around `uploadPolicyToVectorStore()` — clean up local file on failure
- Append to `procedureHistory` JSON array on success
- Return upload status

```typescript
// Pseudocode for account number validation
const ALLOWED_EXTENSIONS = ['.txt', '.md', '.pdf']
const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20 MB

// After file validation, before vector store upload:
if (fileName.endsWith('.pdf')) {
  // Validate PDF magic bytes
  const header = buffer.subarray(0, 5).toString('ascii')
  if (header !== '%PDF-') {
    return apiError({ type: 'VALIDATION_ERROR', message: 'Invalid PDF file' }, 400)
  }

  // Extract text from first page to verify account number
  const { text } = await extractText(new Uint8Array(buffer), { mergePages: false })
  const firstPageText = Array.isArray(text) ? text[0] : text
  if (!firstPageText?.includes(account.name)) {
    return apiError({
      type: 'VALIDATION_ERROR',
      message: `This PDF does not appear to belong to account "${account.name}". Upload rejected.`
    }, 400)
  }
}

// Upload to vector store (safe order: upload new, then delete old)
try {
  const result = await uploadPolicyToVectorStore(id, localPath, account.vectorStoreId)
  // Update account with vectorStoreId, policiesProceduresPath, and append to procedureHistory
  await prisma.account.update({
    where: { id },
    data: {
      vectorStoreId: result.vectorStoreId,
      policiesProceduresPath: localPath,
      procedureHistory: [
        ...(account.procedureHistory as any[] ?? []),
        { filename: fileName, uploadedAt: new Date().toISOString(), uploadedBy: user.id }
      ]
    }
  })
} catch (error) {
  await unlink(localPath).catch(() => {}) // Clean up local file on failure
  throw error
}
```

##### 3. Update vector store upload with safe replace semantics

**File**: `src/lib/openai.ts` — update `uploadPolicyToVectorStore()`

Changes:
- Accept optional `existingVectorStoreId` to avoid listing all stores (pagination fix from review)
- Upload new file FIRST, then delete old files (safe order from review)
- Return file indexing status

```typescript
export async function uploadPolicyToVectorStore(
  accountId: string,
  filePath: string,
  existingVectorStoreId?: string | null
): Promise<{ fileId: string; vectorStoreId: string; status: string }> {
  // Use existing store ID if available (avoids listing all stores)
  let vectorStore: VectorStore
  if (existingVectorStoreId) {
    try {
      vectorStore = await openai.vectorStores.retrieve(existingVectorStoreId)
    } catch {
      // Stale ID — create new store
      vectorStore = await findOrCreateVectorStore(`account-${accountId}-policies`)
    }
  } else {
    vectorStore = await findOrCreateVectorStore(`account-${accountId}-policies`)
  }

  // Upload new file FIRST (safe: old file still exists if this fails)
  const fileStream = fs.createReadStream(filePath)
  const uploadedFile = await openai.files.create({ file: fileStream, purpose: 'assistants' })
  const vsFile = await openai.vectorStores.files.create(vectorStore.id, { file_id: uploadedFile.id })

  // THEN remove old files (safe: new file already in store)
  const existingFiles = await openai.vectorStores.files.list(vectorStore.id)
  for (const file of existingFiles.data) {
    if (file.id === uploadedFile.id) continue // Skip the one we just added
    await openai.vectorStores.files.del(vectorStore.id, file.id)
    await openai.files.del(file.id).catch(() => {}) // Best-effort cleanup
  }

  return { fileId: uploadedFile.id, vectorStoreId: vectorStore.id, status: vsFile.status }
}
```

##### 4. Account procedures UI in supervisor dashboard

**File**: `src/components/supervisor/scenario-tab.tsx` (inline next to account dropdown)

Current state: No account management UI. The `+ New` account button shows `alert("Account creation coming soon")`.

Changes:
- Add inline upload button next to the account dropdown (not a separate settings section — keep it simple per simplicity review)
- Show current procedure filename and upload date if procedures exist
- Upload button using `<label>` pattern (modal-safe)
- Show upload history on hover or in expandable section

```
┌─ Account: [717 (NM Crisis Line) ▼]                 ┐
│                                                      │
│ 📄 717 Procedure Set.pdf · Uploaded Feb 13          │
│ [Upload New Procedures]                             │
│                                                      │
│ ─── or if no procedures: ───                        │
│                                                      │
│ No procedures uploaded. [Upload Procedures PDF]     │
└──────────────────────────────────────────────────────┘
```

##### 5. Wire relevantPolicySections into evaluation

**File**: `src/lib/openai.ts` — update `generateEvaluation()`

Changes:
- Add `relevantPolicySections` to function options (extract a named `GenerateEvaluationOptions` interface per Kieran review)
- Inject into user message under `## RELEVANT PROCEDURES` heading
- Position: after SCENARIO EVALUATOR CONTEXT, before TRANSCRIPT

```typescript
interface GenerateEvaluationOptions {
  scenarioTitle: string
  scenarioDescription: string | null
  scenarioEvaluatorContext?: string | null
  relevantPolicySections?: string | null  // NEW
  transcript: TranscriptTurn[]
  vectorStoreId?: string
}

// In generateEvaluation(), after building scenario context:
if (relevantPolicySections) {
  userMessage += '\n## RELEVANT PROCEDURES\n'
  userMessage += 'The following procedure sections are most relevant to this evaluation. '
  userMessage += 'Use file_search to retrieve these sections and assess compliance:\n'
  userMessage += relevantPolicySections + '\n\n'
}
```

**File**: `src/app/api/sessions/[id]/evaluate/route.ts`

Changes:
- Pass `scenario.relevantPolicySections` to `generateEvaluation()`

##### 6. Show relevantPolicySections for one-time scenarios

**File**: `src/components/supervisor/scenario-tab.tsx`

Current state: Account selection and relevantPolicySections fields are hidden when `formVariant === "one-time"`.

Change: Show these fields for one-time scenarios. This is the primary use case (complaint → one-time scenario → procedure-aware evaluation).

##### 7. Graceful fallback with visible indicator

**File**: `src/lib/openai.ts` — in `generateEvaluation()`

Changes:
- Wrap Responses API call in try/catch
- On failure, log warning **with session/scenario context** (DHH review) and fall back to Chat Completions
- Add `max_output_tokens: 3000` to Responses API call
- Return a `usedFileSearch: boolean` flag in `EvaluationResponse` so the evaluation can indicate whether procedures were consulted

```typescript
if (vectorStoreId) {
  try {
    const response = await openai.responses.create({
      model: process.env.EVALUATOR_MODEL ?? 'gpt-4.1',
      instructions: systemPrompt,
      input: userMessage,
      tools: [{ type: 'file_search', vector_store_ids: [vectorStoreId] }],
      temperature: 0.3,
      max_output_tokens: 3000,
    })
    const result = processRawEvaluation(response.output_text ?? '')
    return { ...result, usedFileSearch: true }
  } catch (error) {
    console.error(
      `[WARN] file_search failed for vectorStore ${vectorStoreId}, ` +
      `session ${sessionId}, scenario ${scenarioId}. Falling back to standard evaluation:`,
      error
    )
    // Fall through to Chat Completions path
  }
}
// ... Chat Completions path returns { ...result, usedFileSearch: false }
```

##### 8. Minor: update evaluator prompt

**File**: `prompts/evaluator-v1.txt`

Clarify Tier 2/3 language to reference `relevantPolicySections` as the guide for what to search for in the knowledge base. Minor wording adjustment.

## Alternative Approaches Considered

### 1. Single shared vector store for all accounts
- **Rejected because**: With 25-50 accounts' procedures in one store, file_search returns results from all accounts. Per-account stores provide clean isolation and simpler evaluator prompts.

### 2. Extract text with unpdf, upload as .txt
- **Rejected because**: OpenAI's Files API natively parses PDFs with better chunking. Preserves document structure for better retrieval quality.

### 3. Per-scenario procedure uploads
- **Rejected because**: One procedure set per account. Upload once, reference per scenario via `relevantPolicySections`.

### 4. Delete-then-upload replacement order
- **Rejected because**: If upload fails after deletion, account has no procedures. Upload-first, delete-second is safer (from code review).

### 5. Complaint generator auto-suggests procedure sections (Phase 3)
- **Deferred**: Supervisors already know which sections are relevant from the complaint. They can type them in the `relevantPolicySections` field manually. Auto-suggestion is a convenience optimization — build it later if supervisors request it.

## Acceptance Criteria

### Functional Requirements

- [ ] Supervisor can upload a PDF (up to 20 MB) to an account via the supervisor dashboard
- [ ] Upload validates account number in PDF matches the target account (hard block on mismatch)
- [ ] Vector store is auto-created on first upload, transparent to supervisor
- [ ] PDF is stored locally and uploaded to per-account OpenAI vector store
- [ ] Re-uploading safely replaces procedures (upload new first, then delete old)
- [ ] Upload history tracked in `procedureHistory` JSON (filename, date, who)
- [ ] Upload status visible in UI (uploading, ready, error)
- [ ] Supervisor can specify `relevantPolicySections` when creating any scenario type (global, one-time)
- [ ] Evaluator receives `relevantPolicySections` in prompt at evaluation time
- [ ] Evaluator uses `file_search` to retrieve actual procedure text when account has a vector store
- [ ] Evaluation indicates whether procedure-based grading was used (`usedFileSearch` flag)
- [ ] Evaluation works normally (Chat Completions fallback) when no vector store exists
- [ ] Stale/deleted vector store fails gracefully with fallback + visible indicator, not 500 error

### Non-Functional Requirements

- [ ] File upload completes within 60 seconds for 20 MB PDFs
- [ ] Evaluation with file_search adds < 5 seconds latency
- [ ] `max_output_tokens` set on Responses API path (bounded cost)

### Quality Gates

- [ ] `npx tsc --noEmit` — zero type errors after each sub-step
- [ ] `npm run lint` — zero lint errors
- [ ] E2E: upload PDF → create scenario with relevant sections → complete session → evaluate → verify evaluation references procedures
- [ ] E2E: upload PDF with wrong account number → verify hard block with clear error
- [ ] E2E: evaluate scenario where account has no procedures → standard evaluation (no error)
- [ ] E2E: re-upload procedures → verify old file removed, new file active

## Dependencies & Prerequisites

- OpenAI Files API supports PDF upload with `purpose: 'assistants'` (confirmed)
- OpenAI Vector Stores API available (confirmed, already used in codebase)
- **One small database migration needed**: Add `procedureHistory` JSON field to Account
- No new npm packages needed (`unpdf` already in codebase for text extraction)

## Risk Analysis & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Large PDF upload timeout | Medium | Medium | 20 MB limit; 60-second target |
| Vector store indexing delay | Medium | Low | Evaluations run minutes/hours after upload |
| Stale vector store at OpenAI | Low | Medium | Try/catch with Chat Completions fallback + visible indicator |
| Account number not found in PDF first page | Medium | Low | Text extraction may vary — error message guides supervisor to verify manually |
| `findOrCreateVectorStore()` pagination with 50+ stores | Low | Low | Use existing `vectorStoreId` from Account; only list on first upload |
| Upload failure leaves orphan local file | Low | Low | Try/catch cleanup with `unlink` |

## Files Changed

### Modified Files

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `procedureHistory` JSON field to Account |
| `src/app/api/accounts/[id]/route.ts` | Accept PDF, size limit, magic bytes, account number validation, upload history |
| `src/lib/openai.ts` | Safe replace semantics, `existingVectorStoreId` param, `GenerateEvaluationOptions` interface, `relevantPolicySections` injection, fallback with context logging, `usedFileSearch` flag, `max_output_tokens` |
| `src/app/api/sessions/[id]/evaluate/route.ts` | Pass `relevantPolicySections` to `generateEvaluation()` |
| `src/components/supervisor/scenario-tab.tsx` | Inline account procedures upload UI; show account/relevantPolicySections for one-time scenarios |
| `prompts/evaluator-v1.txt` | Clarify Tier 2/3 wording for `relevantPolicySections` guidance |
| `src/types/index.ts` | Add `procedureHistory` type to Account interface; add `usedFileSearch` to EvaluationResponse |

### New Migration

```
prisma/migrations/YYYYMMDD_add_procedure_history/migration.sql
```

### Deferred to Follow-Up

| Item | Reason |
|------|--------|
| Complaint generator auto-suggests `relevantPolicySections` | Supervisors can type manually; build if requested |
| Account selector in complaint generation modal | Can set account when editing scenario directly |
| CSV import `relevant_policy_sections` column | Rarely needed in bulk imports; API already accepts it |
| Automated TOC extraction from PDF | Supervisors know their procedures; add if requested |
| Account number prefix convention for scenario titles | Related but separate convention change |

## References

### Internal References
- Evaluator prompt information hierarchy: `prompts/evaluator-v1.txt:10-26`
- Vector store upload function: `src/lib/openai.ts:136-156`
- Evaluation dual-path (Chat vs Responses API): `src/lib/openai.ts:247-307`
- PDF magic bytes validation pattern: `src/app/api/sessions/[id]/review-document/route.ts:72`
- PDF text extraction pattern: `src/app/api/scenarios/extract-text/route.ts`
- File upload in modal pattern: `CLAUDE.md` Bug Prevention Pattern #7

### Institutional Learnings Applied
- File picker must use `<label>` wrapping (Pattern #7) — for modal-safe PDF upload
- API-frontend types must be updated atomically (Contract mismatch solution)
- Schema fallthrough needs explicit guards (Pattern #9) — account upload validation
- Upload-first-delete-second for safe replacement (from code review)
- Use stored IDs instead of listing all resources (from code review)

### Review Findings Incorporated
- **DHH**: Cut Phase 3, fix findOrCreateVectorStore pagination, reverse delete/upload order, log session context on fallback
- **Kieran**: Extract `GenerateEvaluationOptions` interface, add `usedFileSearch` to response, cleanup on failure
- **Simplicity**: Merge Phase 1+2, drop CSV column and char limit increase, simplify UI to inline button
- **Key Choices**: Add upload audit trail, add visible indicator when procedure grading unavailable, note data governance (not a concern per stakeholder)

### Related Issues & PRs
- Completed: #46 (Document Consistency Review — same PDF handling patterns)
- Completed: #12 (Scenario Generation — complaint flow being extended)
- Completed: #47 (One-Time Scenario Workflow — one-time form being extended)
