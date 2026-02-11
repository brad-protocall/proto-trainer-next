# PTG → PTN Feature Parity Backlog

Features originated in Proto Training Guide (PTG) that need to be ported to Proto Trainer Next (PTN).

**Created**: 2026-02-10
**Source**: PTG feature audit

---

## Active Backlog

### Feature #12: Scenario Generation from Complaint

**Priority**: Active — build when ready
**Complexity**: Medium (AI prompt + UI workflow)
**Depends on**: Nothing

**Summary**: Supervisor pastes a complaint email, AI generates a full training scenario.

**Workflow**:
1. Supervisor navigates to scenario creation area
2. Pastes raw complaint email text into a form
3. AI generates: title, description, caller prompt, evaluator context
4. Supervisor reviews and edits the generated fields before saving
5. Saved as a **one-time scenario** (not visible in global scenario list)
6. Supervisor can later promote it to a global/reusable scenario if it proves useful

**Technical Notes**:
- Straightforward port — single OpenAI Chat Completions call to extract/generate scenario fields
- UI: form with "Paste Complaint" textarea → "Generate" button → editable preview → "Save"
- Scenario model already supports `isOneTime` field
- No similarity report needed (complaints are unique by nature)

**Acceptance Criteria**:
- [ ] Supervisor can paste complaint text and generate scenario
- [ ] All generated fields (title, description, prompt, evaluator context) are editable before save
- [ ] Scenario saved as one-time by default
- [ ] One-time scenarios can be promoted to reusable (existing functionality)
- [ ] Works in demo mode without API key (mock generation)

---

### Feature #15: Document Consistency Review

**Priority**: Active — build when ready
**Complexity**: High (vector store setup + PDF upload + comparison report)
**Depends on**: Nothing (but pairs well with existing evaluation flow)

**Summary**: After completing a simulation, learner uploads their post-session documentation (PDF). System compares it against the transcript and organization's documentation standards (stored in OpenAI vector store). Produces a standalone report.

**Workflow**:
1. Learner completes a training session (chat or voice) and receives evaluation feedback
2. Learner writes their documentation (just as they would after a real call)
3. Learner uploads documentation as PDF — **this step is optional, not required**
4. System compares the PDF against:
   - The session transcript (what actually happened in the conversation)
   - Documentation standards (uploaded once by supervisor to OpenAI vector store)
5. System generates a standalone consistency report covering:
   - Documentation quality vs. standards
   - Accuracy relative to what was said in the conversation
   - Combined feedback on both clinical conversation AND documentation skills

**Vector Store Setup** (one-time per organization):
- Supervisor uploads the documentation guidelines/standards document
- Stored in OpenAI's built-in vector store (Assistants API / file_search)
- One vector store per account/organization
- Referenced by `policiesVectorFileId` on Account model (or similar)

**Technical Notes**:
- PDF upload endpoint (FormData, size limit)
- OpenAI file_search tool for comparing against documentation standards
- Transcript already available in DB — include in comparison prompt
- Report is a **separate standalone artifact**, not merged into the evaluation score
- "Full fluency loop": learner practices conversation → gets feedback → writes documentation → gets feedback on that too

**Acceptance Criteria**:
- [ ] Supervisor can upload documentation standards (one-time setup per org)
- [ ] Learner sees optional "Upload Documentation" button after session feedback
- [ ] PDF upload accepted (with size/type validation)
- [ ] System generates consistency report comparing doc vs transcript vs standards
- [ ] Report is standalone (separate from evaluation)
- [ ] Upload is optional — learner can skip without penalty
- [ ] Works for both chat and voice sessions
- [ ] Demo mode: mock report without API calls

---

### Post-Session Analysis Scanning (Misuse + Consistency)

**Priority**: Active — build when ready
**Complexity**: Medium (single LLM call + Prisma migration)
**Depends on**: Nothing (SessionFlag model already exists)
**Plan**: `plans/post-session-analysis-scanning.md` (consolidated from two original plans after 5-agent review)

**Summary**: After every evaluation, automatically scan the transcript for misuse (jailbreak, inappropriate, off-topic) and prompt consistency (character breaks, behavior drift, role confusion). Combined into a single LLM call. Server-side trigger (not frontend). Defense-in-depth with existing evaluator safety checks.

**Key decisions** (2026-02-10):
- Combined endpoint (`/api/sessions/[id]/analyze`) — single LLM call, ~40% cheaper
- `source` field on SessionFlag via Prisma migration (for idempotency + deduplication)
- Defense-in-depth: evaluator keeps its safety checks, scanner adds redundant layer
- Server-side trigger from evaluate route (not frontend fire-and-forget)
- Uses `gpt-4.1-mini` + `zodResponseFormat` for structured output

---

## Long-Term / Nice-to-Have

### Feature #13: Synchronized Transcript + Audio Playback

**Priority**: Long-term nice-to-have
**Complexity**: High (timestamp infrastructure + bidirectional sync UI)
**Depends on**: Re-adding `captured_at` timestamps to transcript turns

**Summary**: Split view where clicking a transcript turn jumps audio to that moment, and as audio plays, the current transcript turn highlights.

**Prerequisite**: PTN dropped `captured_at` timestamps on transcript turns. Must add these back before this feature is possible.

**Workflow**:
1. User opens a completed session with both transcript and recording
2. Split view: transcript on one side, audio player on the other
3. Click any transcript turn → audio seeks to that turn's timestamp
4. As audio plays → current transcript turn highlights automatically
5. Available to both supervisors and learners

**Where it appears**: Replaces/enhances the current recording playback page (where the play button currently lives on the dashboard).

**Technical Notes**:
- PTG stores `captured_at` per transcript turn (start time of each turn)
- PTN would need to:
  1. Add `captured_at` column to TranscriptTurn model
  2. Populate timestamps during session (chat: on message receipt, voice: from LiveKit agent)
  3. Build split-view UI component with HTML5 Audio API for seeking
  4. Bidirectional sync logic (click→seek + timeupdate→highlight)
- Timestamp granularity: per transcript turn (not per word)

**Acceptance Criteria**:
- [ ] `captured_at` timestamps stored on every transcript turn
- [ ] Split view renders transcript + audio player
- [ ] Click transcript turn → audio seeks to correct position
- [ ] Audio playback → current turn highlights
- [ ] Works for voice sessions (which have recordings)
- [ ] Accessible to both supervisors and learners

---

## Reference: Features Already at Parity

These PTG features already exist in PTN (from earlier migration work):

| Feature | PTN Status | Notes |
|---------|-----------|-------|
| Chat training sessions | Done | Full chat with AI roleplay |
| Voice training sessions | Done | LiveKit Cloud + OpenAI Realtime |
| Session evaluation | Done | AI-generated feedback with flags |
| Free practice (no assignment) | Done | #38, #39 |
| Supervisor dashboard | Done | Assignments, flags, scenario management |
| Learner dashboard | Done | Assignments, free practice, feedback |
| Recording (voice) | Done | Browser-side recording (#40) |
| Post-session analysis (flags, safety) | Done | #40 |
| CSV scenario import | Done | Bulk import endpoint |
| External API (PTG integration) | Done | Scenarios, assignments, evaluation |
| One-time scenarios | Done | Via external API |
| Evaluator context | Done | Per-scenario evaluator context field |

---

## Feature Not Applicable to PTN

| # | Feature | Why N/A |
|---|---------|---------|
| 14 | Pi single-process serving | Architecture-specific to PTG (FastAPI serves React). Next.js already serves frontend + API on one port. |
