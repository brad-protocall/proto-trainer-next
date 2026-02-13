# feat: Document Consistency Review (Port from PTG)

> **Goal**: After completing a training session and receiving evaluation feedback, learners can optionally upload a PDF of their post-session documentation. The system extracts text, compares it against the session transcript, and returns a scored assessment with specific gaps identified.

**Priority**: Active
**Complexity**: Medium (follows established patterns, one new dependency)
**Branch**: `feat/document-consistency-review`

**Review status**: Plan reviewed by 3 agents (DHH, Kieran-TS, Simplicity). Simplified per feedback.

---

## Overview

Direct port of PTG Feature #15 (Stream A2). The "full fluency loop": learner practices conversation → gets feedback → writes documentation → gets feedback on that too.

Key value: catches fabricated details, missed safety concerns, and incomplete documentation — the hardest things for supervisors to catch manually.

## Flow

```
Learner completes session → Gets AI evaluation feedback
→ Clicks "Review Documentation" → Uploads PDF
→ Backend extracts text → Sends to LLM with transcript
→ Returns three scored dimensions + specific gaps
→ Results stored and displayed with color-coded bars
```

## Design Decisions

| Question | Decision | Rationale |
|----------|----------|-----------|
| Re-upload? | One review per session (match PTG) | Simplest. Idempotency via unique constraint. |
| Store PDF? | No. Extract text in memory, discard. | PTG pattern. No storage infra needed. |
| PDF library | `unpdf` | Serverless-optimized, maintained by UnJS, ships TS types, uses `Uint8Array` |
| Prompt style | Local `.txt` file, loaded with `loadPrompt()` directly | No accessor/env var needed for prototype |
| LLM output | `zodResponseFormat` structured output | Flat schema — scores as top-level numbers |
| LLM context | Transcript + documentation + scenario prompt (if exists) | Scenario-aware review catches domain-specific gaps |
| Cascade delete | `onDelete: Cascade` | Matches Recording, TranscriptTurn pattern |
| Min transcript | 3 turns | Prevents meaningless reviews on empty sessions |
| Button after review | Changes to "View Documentation Review" | Prevents 409 confusion |
| Text truncation | 30,000 chars max | ~7,500 tokens, keeps costs ~$0.03/review |
| Demo mode | Deferred | No other LLM endpoint has demo mode. Mock at API level if needed. |
| Rate limiting | Deferred | One-per-session idempotency is sufficient for prototype. |
| Short transcript status | 400 Bad Request | Not 425 — this is a permanent condition, not a timing issue |

---

## Database Schema

```prisma
model DocumentReview {
  id                   String   @id @default(uuid())
  sessionId            String   @unique @map("session_id")
  fileName             String   @map("file_name")              // Original name, display only
  transcriptAccuracy   Int      @map("transcript_accuracy")    // 0-100
  guidelinesCompliance Int      @map("guidelines_compliance")  // 0-100
  overallScore         Int      @map("overall_score")          // 0-100
  specificGaps         Json     @map("specific_gaps")          // Array of gap objects
  reviewText           String   @map("review_text")            // Full LLM narrative
  createdAt            DateTime @default(now()) @map("created_at")

  session Session @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@map("document_reviews")
}
```

Add to Session model:
```prisma
documentReview DocumentReview?
```

**Notes from review**:
- `specificGaps` uses `Json` type (not `String`) — matches `SessionFlag.metadata` pattern, avoids manual JSON.parse/stringify
- Dropped `fileSizeBytes` and `extractedTextLength` — never queried or displayed (YAGNI)
- No `extractedText` column — only needed during LLM call, not after

---

## Zod Schema (Flat — Per Review Feedback)

```typescript
// src/lib/validators.ts

export const DocumentGapTypeValues = ['fabrication', 'omission', 'minimization', 'inaccuracy', 'formatting'] as const
export const DocumentGapSeverityValues = ['critical', 'important', 'minor'] as const

export const documentReviewResultSchema = z.object({
  transcriptAccuracy: z.number().int().min(0).max(100),
  guidelinesCompliance: z.number().int().min(0).max(100),
  overallScore: z.number().int().min(0).max(100),
  specificGaps: z.array(z.object({
    type: z.enum(DocumentGapTypeValues),
    detail: z.string(),
    severity: z.enum(DocumentGapSeverityValues),
  })),
  narrative: z.string(),
})

export type DocumentReviewResult = z.infer<typeof documentReviewResultSchema>
```

**Notes from review**:
- Flat schema (no nested `{ score, summary }` objects) — scores map 1:1 to DB columns
- No `.max()` on LLM string fields — let the prompt guide length, Zod constraints cause parse failures
- `narrative` replaces per-dimension summaries — one narrative is more useful than three redundant summaries
- Dropped `documentUploadSchema` — session ID comes from URL params, not request body

---

## API Endpoints

### `POST /api/sessions/[id]/review-document`

**Auth**: `requireAuth` (learner owns session, or supervisor)
**Content-Type**: `multipart/form-data`
**Body**: FormData with `file` (PDF)

**Validation order**:
1. Auth + session ownership
2. Session has evaluation (409 if not)
3. No existing review (409 if duplicate)
4. File exists and is not empty
5. File size ≤ 10MB
6. Magic bytes: `%PDF-` at byte 0
7. Text extraction succeeds and is non-empty
8. Transcript has 3+ turns (400 if insufficient)

**Success response**:
```json
{
  "ok": true,
  "data": {
    "id": "uuid",
    "sessionId": "uuid",
    "fileName": "post-call-notes.pdf",
    "transcriptAccuracy": 82,
    "guidelinesCompliance": 75,
    "overallScore": 78,
    "specificGaps": [
      { "type": "omission", "detail": "Safety assessment not documented", "severity": "critical" },
      { "type": "inaccuracy", "detail": "Caller age listed as 34, transcript shows 28", "severity": "important" }
    ],
    "reviewText": "The documentation demonstrates...",
    "createdAt": "2026-02-12T..."
  }
}
```

**Error responses**:
| Status | Condition |
|--------|-----------|
| 400 | Missing/empty file, wrong type, no text extractable, password-protected, transcript too short |
| 401 | Not authenticated |
| 403 | Not session owner (and not supervisor) |
| 404 | Session not found |
| 409 | No evaluation exists / review already exists |
| 500 | LLM failure, extraction crash |

### `GET /api/sessions/[id]/review-document`

**Auth**: `requireAuth` (session owner or supervisor)
**Returns**: Existing DocumentReview or 404

---

## File Structure (Simplified — 3 New Files)

| File | Action | Description |
|------|--------|-------------|
| `prisma/schema.prisma` | Modify | Add `DocumentReview` model + Session back-reference |
| `prompts/document-reviewer.txt` | **New** | System prompt for document review LLM |
| `src/app/api/sessions/[id]/review-document/route.ts` | **New** | POST + GET — all backend logic inline |
| `src/components/document-review-button.tsx` | **New** | Upload button + results display |
| `src/lib/validators.ts` | Modify | Add `documentReviewResultSchema` |
| `src/types/index.ts` | Modify | Add `DocumentReview` type, `hasDocumentReview` on session responses |

**Notes from review**:
- No `src/lib/pdf.ts` — PDF validation is 3 inline lines, extraction is 2 lines via `unpdf`
- No `src/lib/document-review.ts` shared helper — only one caller, inline in route handler
- No `DocumentReviewError` class — use plain `Error`, `handleApiError` catches it
- No `getDocumentReviewerPromptFile()` accessor — call `loadPrompt()` directly
- No new env vars — reuse `CHAT_MODEL` for model selection

---

## Implementation Steps

### Step 1: Database + Dependencies

1. Add `DocumentReview` model to `prisma/schema.prisma`
2. Add `documentReview DocumentReview?` back-reference on Session
3. Run `npx prisma migrate dev --name add_document_review`
4. Run `npm install unpdf`
5. Add Zod schema to `src/lib/validators.ts`
6. Add types to `src/types/index.ts`

**Verify**: `npx tsc --noEmit` passes

### Step 2: Backend (Prompt + Route Handler)

Create `prompts/document-reviewer.txt` with:
- Anti-manipulation preamble (treat document as DATA)
- Three scoring dimensions with rubrics
- Gap categorization (fabrication, omission, minimization, inaccuracy, formatting)
- Severity guide (critical, important, minor)
- Score thresholds (80+ professional, 60-79 improvement, <60 retraining)

Create `src/app/api/sessions/[id]/review-document/route.ts`:
- **POST**: Auth → load session w/ evaluation + transcript + documentReview → validate guards → parse FormData → validate PDF (magic bytes) → extract text via `unpdf` → truncate to 30k chars → build LLM prompt (transcript + document + scenario) → `getOpenAI().beta.chat.completions.parse()` with `zodResponseFormat` → persist `DocumentReview` → return result
- **GET**: Auth → ownership check → find review → return or 404

Route handler is ~80 lines, fully self-contained. No external helpers needed.

**Verify**: Test with curl + sample PDF

### Step 3: Frontend

Create `src/components/document-review-button.tsx`:

**States**:
- `idle` → "Review Documentation" button (hidden file input, triggers PDF picker)
- `uploading` → "Uploading..." with elapsed timer
- `reviewing` → "Reviewing documentation..." with elapsed timer (~10-20s)
- `complete` → Three color-coded score bars + gaps list + narrative
- `error` → Error message with contextual guidance
- `has-review` → "View Documentation Review" (loads existing via GET)

**Score bar colors** (match PTG):
- Green: 80+ | Yellow: 60-79 | Red: <60

Wire into counselor dashboard:
- Add `hasDocumentReview` to session API response (or query inline)
- Show component after evaluation results
- Works for both assignment and free practice sessions

**Verify**: Full flow — upload PDF after evaluation, see scores

### Step 4: Verify

```bash
npx tsc --noEmit          # Zero type errors
npm run lint              # Zero lint errors
```

Manual E2E test:
1. Complete a chat session
2. Click evaluate to get feedback
3. Upload a PDF
4. See scores and gaps
5. Refresh — button shows "View Documentation Review"
6. Click — existing results load
7. Try uploading again — 409 error

---

## Acceptance Criteria

- [ ] Learner sees "Review Documentation" button after receiving evaluation feedback
- [ ] PDF upload accepted (validates size, magic bytes)
- [ ] Empty/image-only/password-protected PDFs rejected with helpful messages
- [ ] System extracts text and compares against transcript (+ scenario if available)
- [ ] Three scores displayed with color-coded bars (green 80+, yellow 60-79, red <60)
- [ ] Specific gaps listed with category and severity
- [ ] Full narrative review text displayed
- [ ] One review per session (409 on duplicate)
- [ ] Button changes to "View Documentation Review" after review exists
- [ ] Supervisors can view any learner's document reviews
- [ ] Works for both chat and voice sessions
- [ ] `npx tsc --noEmit` passes
- [ ] `npm run lint` passes

## Future Enhancements (Not in Scope)

- Re-upload with revised documentation (allow multiple attempts)
- Organization documentation standards via vector store
- Supervisor-initiated reviews
- Side-by-side diff view (transcript vs documentation)
- Aggregate documentation scores per learner (dashboard metric)
- Demo mode with mock scores (add if needed for stakeholder demos)
- Rate limiting (add if abuse becomes a concern)

---

## References

- PTG implementation: `routes_document_review.py`, `DocumentReviewButton.jsx`
- Evaluation flow: `src/app/api/sessions/[id]/evaluate/route.ts`
- File upload pattern: `src/app/api/recordings/upload/route.ts`
- Structured output: `src/lib/openai.ts` (`analyzeSessionTranscript`)
- Prompt loading: `src/lib/prompts.ts` → `loadPrompt()`

## Review Log

**2026-02-11**: 3-agent review (DHH, Kieran-TS, Simplicity)
- DHH: "Ship it." Two minor flags (JSON string type, HTTP 425). Both addressed.
- Kieran: 6 findings. Accepted: flat schema (no data loss), `Json` type, `Uint8Array`, `NEXT_PUBLIC_DEMO_MODE`, expose `hasDocumentReview`. Partially accepted: helper signature (resolved by inlining).
- Simplicity: Collapsed 6 new files → 3. Dropped: shared helper, pdf.ts, error class, prompt accessor, demo mode, rate limiting, upload schema. ~50% LOC reduction.
