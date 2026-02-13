# feat: Scenario Generation from Complaint (#12)

Generate training scenarios from complaint emails using AI structured outputs.

**Type**: Enhancement
**Priority**: Active backlog
**Complexity**: Medium
**Estimated effort**: 1 session

---

## Overview

Supervisors paste complaint email text into a form. AI generates a training scenario (title, description, caller prompt, evaluator context, category, skills). Supervisor reviews and edits all fields before saving as a one-time scenario.

This is a PTG→PTN parity feature. PTG already has this capability; this plan ports it to the Next.js codebase using existing patterns.

## Problem Statement

Currently, supervisors must manually write every scenario field from scratch. When a real complaint comes in that would make a great training scenario, the supervisor has to mentally extract the situation, imagine a realistic caller, write roleplay instructions, and define evaluation criteria — a 15-30 minute process. AI can do the heavy lifting in 3-5 seconds, with the supervisor reviewing and refining.

## Proposed Solution

### Architecture

```
┌──────────────────────┐     ┌──────────────────────────┐     ┌────────────┐
│ Supervisor Dashboard │────▶│ POST /api/scenarios/     │────▶│ OpenAI API │
│ (Generate button)    │     │      generate            │     │ (gpt-4.1)  │
│                      │     │                          │     │            │
│ GenerateScenario     │◀────│ zodResponseFormat +      │◀────│ Structured │
│ Modal (new component)│     │ requireSupervisor        │     │ Outputs    │
│                      │     │                          │     └────────────┘
│ Save ───────────────▶│ POST /api/scenarios (existing) │
└──────────────────────┘     └──────────────────────────┘
```

**Key technical decision**: Use OpenAI's `zodResponseFormat` with `getOpenAI().beta.chat.completions.parse()` for guaranteed structured JSON output. This is the recommended approach for generating structured fields (vs. function calling, which is for tool selection). The codebase already uses `openai` SDK v4.104.0 which supports this.

### User Flow

```
[Scenarios Tab] → [Click "Generate from Complaint"]
  → [Modal Phase 1: Paste complaint text + optional instructions]
    → [Click "Generate Scenario"]
      → [Loading spinner (3-5s)]
        → [Modal Phase 2: Editable form with AI-generated fields]
          → [Review, edit any field]
            → [Click "Save Scenario"]
              → [POST /api/scenarios (existing endpoint)]
                → [Modal closes, list refreshes, toast: "Scenario created"]
```

---

## Implementation Plan

### Phase 1: OpenAI Helper + Schemas

**Modify**: `src/lib/validators.ts` — add input and output schemas
**Modify**: `src/lib/openai.ts` — add `generateScenarioFromComplaint()` helper
**New file**: `prompts/scenario-generator.txt`

**Input schema** (add to `src/lib/validators.ts`):

```typescript
export const generateScenarioSchema = z.object({
  sourceText: z.string()
    .min(50, 'Provide at least 50 characters of complaint text')
    .max(15000, 'Complaint text must be under 15,000 characters'),
  additionalInstructions: z.string().max(1000).optional(),
})
```

**Output schema** (add to `src/lib/validators.ts`):

```typescript
// NOTE: Uses .nullable() not .optional() — required by OpenAI strict mode.
// All fields required in strict mode; use nullable union for "might not apply."
export const generatedScenarioSchema = z.object({
  title: z.string().max(255),
  description: z.string(),
  prompt: z.string(),
  evaluatorContext: z.string(),
  category: z.enum(ScenarioCategoryValues).nullable(),
  skills: z.array(SkillSchema),
})

export type GeneratedScenario = z.infer<typeof generatedScenarioSchema>
```

**Why 6 fields, not 10:**
- `mode`: Cut — AI can't infer phone vs. chat from text. Default to "phone" in the form; supervisor changes if needed.
- `difficulty`, `estimatedTime`: Cut — not in `createScenarioSchema`, would be silently dropped on save. Use existing `inferDifficulty()` / `estimateTime()` from `src/lib/skills.ts` server-side if needed later.
- `confidenceNotes`: Cut — supervisor already reviews every field directly. Ephemeral meta-commentary adds schema complexity and token cost for marginal value.

**Why `SkillSchema` instead of `z.array(z.string())`:** The existing `SkillSchema` is `z.enum(VALID_SKILLS)` — a strict enum of 15 known skills. Using it in the output schema lets `zodResponseFormat` constrain the AI at the token level to only return valid skills. Free-text strings would pass generation but fail validation on save via `POST /api/scenarios`.

**OpenAI helper** (add to `src/lib/openai.ts`):

```typescript
export async function generateScenarioFromComplaint(
  sourceText: string,
  additionalInstructions?: string
): Promise<GeneratedScenario> {
  const systemPrompt = loadPrompt('scenario-generator.txt')
  const openai = getOpenAI()

  const completion = await openai.beta.chat.completions.parse({
    model: process.env.CHAT_MODEL ?? 'gpt-4.1',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: buildUserMessage(sourceText, additionalInstructions) },
    ],
    response_format: zodResponseFormat(generatedScenarioSchema, 'generated_scenario'),
    temperature: 0.7,
  }, {
    timeout: 15000,  // 15s hard timeout — prevents hung requests
  })

  const message = completion.choices[0]?.message
  if (message?.refusal) {
    throw new ScenarioGenerationError('refusal', message.refusal)
  }
  if (!message?.parsed) {
    throw new ScenarioGenerationError('parse_failure', 'No valid response from AI')
  }
  return message.parsed
}
```

This follows the existing pattern where all OpenAI calls are centralized in `src/lib/openai.ts` (see `generateEvaluation`, `getChatCompletion`, etc.). The route handler stays thin.

### Phase 2: API Route

**New file**: `src/app/api/scenarios/generate/route.ts`

**Pattern**: Follows existing `POST /api/scenarios/route.ts` (lines 67-127) — `requireSupervisor` → validate input → call helper → return result.

```typescript
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireSupervisor(request)
    if (authResult.error) return authResult.error

    const body = await request.json()
    const result = generateScenarioSchema.safeParse(body)
    if (!result.success) {
      return apiError({ type: 'VALIDATION_ERROR', ... }, 400)
    }

    const generated = await generateScenarioFromComplaint(
      result.data.sourceText,
      result.data.additionalInstructions
    )
    return apiSuccess(generated)
  } catch (error) {
    if (error instanceof ScenarioGenerationError) {
      if (error.type === 'refusal') return apiError({ ... }, 422)
    }
    return handleApiError(error)  // catches everything else (rate limit, timeout, etc.)
  }
}
```

**Error handling** — 3 cases, not 5:

| Error | Response | Notes |
|-------|----------|-------|
| Content moderation refusal | 422 "Could not generate from this text" | Explicit catch via `ScenarioGenerationError` |
| Missing API key | 503 "AI generation not configured" | Thrown by `getOpenAI()` when key absent |
| Everything else (rate limit, timeout, parse failure) | 500 via `handleApiError` catch-all | Rare cases handled generically |

**No demo mode mock.** If `OPENAI_API_KEY` is missing, the endpoint returns 503 — consistent with every other AI feature in the app. Demos use the Pi deployment which has a real key.

### Phase 3: Prompt File

**New file**: `prompts/scenario-generator.txt`

System prompt instructs the AI to:
1. Transform complaint text into a realistic caller character (second person: "You are...")
2. Generate a concise title (under 80 chars)
3. Write a 1-2 sentence description focused on skills practiced
4. Create detailed roleplay instructions (200-500 words) with name, age, emotional state, backstory, behavioral cues
5. Define evaluation criteria (what to assess, key moments, excellent vs. poor responses)
6. Suggest category from the predefined list, or null if unclear
7. Pick skills from the predefined list: `risk-assessment`, `safety-planning`, `de-escalation`, `active-listening`, etc. (from `src/lib/skills.ts`)
8. **Critical**: Never include real PII from the source text — transform into fictional equivalents
9. **Crisis context framing**: Include note that input is real crisis counseling complaint text and may contain descriptions of violence, self-harm, etc. — this is expected and reduces false-positive content moderation refusals

### Phase 4: Generate Scenario Modal (New Component)

**New file**: `src/components/generate-scenario-modal.tsx`

Extracted as its own component from day one, following the `BulkImportModal` precedent (`src/components/bulk-import-modal.tsx`). This keeps the 1505-line supervisor dashboard from growing further and isolates re-render scope.

**Component interface:**

```typescript
interface GenerateScenarioModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void   // triggers loadScenarios() in parent
  userId?: string          // for authFetch
}
```

**State management** — two variables, not a 4-state string:

```typescript
const [generatedScenario, setGeneratedScenario] = useState<GeneratedScenario | null>(null)
const [isLoading, setIsLoading] = useState(false)
```

| `generatedScenario` | `isLoading` | UI Phase |
|---|---|---|
| null | false | Input (paste complaint) |
| null | true | Generating (spinner) |
| non-null | false | Editing (review form) |
| non-null | true | Saving |

**Phase 1 — Input:**
- Large textarea for complaint text (min 50 chars)
- Smaller textarea for optional additional instructions
- PII warning: "Remove any customer names, emails, or personal information before generating."
- "Generate Scenario" button (disabled until 50+ chars)

**Phase 2 — Review & Edit:**
- Header: "Review the AI-generated fields below and edit as needed"
- All generated fields in editable form inputs matching existing scenario form style
- Mode dropdown (defaulted to "phone", editable by supervisor)
- Category dropdown (existing `SCENARIO_CATEGORIES`)
- Skills as editable tags/checkboxes from predefined list
- "Start Over" button → returns to Phase 1 (preserves original complaint text)
- "Save Scenario" button → calls existing `POST /api/scenarios` with `isOneTime: true`
- "Cancel" button → closes modal

**Loading state**: Simple spinner + "Generating scenario... This usually takes 3-5 seconds." Matches existing loading patterns in the codebase.

### Phase 5: Dashboard Integration

**Modify**: `src/components/supervisor-dashboard.tsx` — minimal changes (~10 lines)

1. Add `showGenerate` boolean state
2. Add "Generate from Complaint" button in Scenarios tab header
3. Render `<GenerateScenarioModal>` with callbacks

### Prerequisite Fix: Evaluator Context Persistence

**Modify**: `src/app/api/scenarios/route.ts`

**The problem**: The existing `POST /api/scenarios` route accepts `evaluatorContext` in its Zod schema (`validators.ts:65`) but **never writes it anywhere**. The Prisma create call ignores the field. This means the AI-generated evaluator context would be silently dropped on save. This bug also affects manually-entered evaluator context via the existing create form.

**The fix**: Add evaluator context file persistence to the existing POST handler, matching the pattern from the import route (`src/app/api/scenarios/import/route.ts:98-108`):

```typescript
// After prisma.scenario.create():
if (data.evaluatorContext) {
  const contextDir = path.join(process.cwd(), 'uploads', 'evaluator_context', scenario.id)
  await mkdir(contextDir, { recursive: true })
  const contextPath = path.join(contextDir, 'context.txt')
  await writeFile(contextPath, data.evaluatorContext, 'utf-8')
  await prisma.scenario.update({
    where: { id: scenario.id },
    data: { evaluatorContextPath: contextPath }
  })
}
```

This fixes a pre-existing bug AND enables the generate feature to persist evaluator context via the standard save flow.

---

## Resolved Design Decisions

Identified by spec-flow analysis and plan review. Resolved using existing codebase patterns:

| Question | Resolution | Rationale |
|----------|------------|-----------|
| **Evaluator context storage** | Fix `POST /api/scenarios` to persist evaluator context as file (pre-existing bug) | Matches import route pattern. Fixes existing gap. |
| **Account ID** | Use supervisor's account. If no `accountId` provided, fall back to first Account in DB | Matches existing `POST /api/scenarios` pattern (line 89-91) |
| **Skills validation** | `SkillSchema` enum in output schema constrains AI at token level. Supervisor edits from predefined list before save | Prevents invalid skills from reaching the save endpoint |
| **Regeneration** | "Start Over" button returns to Phase 1, preserving original complaint text | Simplest MVP. Per-field regeneration can be added later |
| **Demo mode** | No mock. Missing API key returns 503 error | Consistent with all other AI features (chat, voice, eval). Demos use Pi with real key |
| **Form validation** | Same rules as existing `createScenarioSchema` — title, prompt required | Reuses existing validation on save |
| **Duplicate detection** | Not needed — these are from unique complaints | Per user's clarification |
| **Cancel during generation** | No cancel button — user waits or closes modal | Generation is 3-5s. AbortController adds complexity for little gain |
| **isOneTime default** | Always `true` for generated scenarios. Can be toggled later via existing UI | Per user requirement: "one-time, but kept in case they should become global" |
| **Mode field** | Not AI-generated. Defaults to "phone" in the form; supervisor changes if needed | AI can't meaningfully infer phone vs. chat from complaint text |
| **difficulty / estimatedTime** | Not AI-generated. Use existing `inferDifficulty()` / `estimateTime()` if needed later | Not in `createScenarioSchema`; would be silently dropped on save |
| **Naming convention** | camelCase in both input and output schemas | Matches all internal `validators.ts` schemas. Snake_case only for external API |
| **OpenAI helper location** | `generateScenarioFromComplaint()` in `src/lib/openai.ts` | All OpenAI calls centralized there. Route handler stays thin |
| **Component extraction** | New `generate-scenario-modal.tsx` from day one | Dashboard already 1505 lines. Follows `BulkImportModal` precedent |
| **State management** | `generatedScenario | null` + `isLoading` boolean | Simpler than 4-state string. Two variables cover all phases |

---

## Acceptance Criteria

### Functional

- [ ] Supervisor can click "Generate from Complaint" on Scenarios tab
- [ ] Modal accepts complaint text (50-15,000 chars) and optional instructions
- [ ] AI generates scenario fields (title, description, prompt, evaluatorContext, category, skills)
- [ ] All generated fields are editable before saving
- [ ] Mode defaults to "phone" and is editable in the form
- [ ] "Start Over" returns to paste step with original text preserved
- [ ] Save creates scenario with `isOneTime: true`
- [ ] Evaluator context persisted to file on save (via fixed POST endpoint)
- [ ] New scenario appears in "One-Time" scenarios view
- [ ] PII warning displayed below complaint textarea

### Error Handling

- [ ] Content moderation refusal → 422 with clear message
- [ ] Missing API key → 503 "AI generation not configured"
- [ ] Other failures → 500 via catch-all
- [ ] Complaint text preserved on all errors (no data loss)

### Technical

- [ ] `npx tsc --noEmit` passes
- [ ] `npm run build` succeeds
- [ ] `npm run lint` passes
- [ ] New Zod schemas in `src/lib/validators.ts` (single source of truth)
- [ ] OpenAI helper in `src/lib/openai.ts` (not inline in route)
- [ ] Modal extracted to its own component (not inline in dashboard)
- [ ] Route handler follows existing auth + validation + response pattern
- [ ] No OpenAI calls from browser (server-side only)
- [ ] camelCase field names in both schemas

---

## Files Changed

| File | Change | Lines (est.) |
|------|--------|-------------|
| `src/lib/validators.ts` | Add `generateScenarioSchema`, `generatedScenarioSchema` | +20 |
| `src/lib/openai.ts` | Add `generateScenarioFromComplaint()` helper | +40 |
| `src/app/api/scenarios/generate/route.ts` | **New** — generation endpoint (thin) | ~40 |
| `src/app/api/scenarios/route.ts` | Fix evaluator context persistence in POST | +15 |
| `prompts/scenario-generator.txt` | **New** — system prompt for generation | ~50 |
| `src/components/generate-scenario-modal.tsx` | **New** — generate modal component | ~120 |
| `src/components/supervisor-dashboard.tsx` | Add button + render modal (~10 lines) | +10 |
| `src/types/index.ts` | Re-export `GeneratedScenario` type | +3 |

**Total**: ~300 lines across 8 files (3 new, 5 modified)

---

## Dependencies & Risks

| Risk | Mitigation |
|------|------------|
| OpenAI structured outputs could fail on edge cases | `zodResponseFormat` guarantees schema compliance; refusal handled explicitly |
| Long generation times (>5s) | 15s timeout on SDK call; loading message sets expectations |
| PII in complaint text sent to OpenAI | Warning label + prompt instructs AI to transform PII into fictional equivalents. For production: consider server-side PII detection or OpenAI DPA |
| `SkillSchema` enum may not work with `zodResponseFormat` strict mode | Verify during implementation. Fallback: `z.array(z.string())` + post-generation validation against `VALID_SKILLS` |
| Content moderation may block legitimate crisis complaints | System prompt includes crisis-context framing to reduce false-positive refusals |

---

## Future Enhancements (Not in Scope)

- Per-field "Regenerate" buttons (re-run single field)
- "Regenerate with new instructions" (iterative refinement)
- Complaint text similarity check against existing scenarios
- Batch generation from multiple complaints
- Server-side PII scrubbing before sending to OpenAI
- Per-user rate limiting on generate endpoint (P2 — same gap as evaluate endpoint)
- Dedicated `SCENARIO_GENERATOR_MODEL` env var (e.g., `gpt-4.1-mini` for lower cost/latency)

---

## Review History

**Plan review (2026-02-10):** Reviewed by DHH-style, Kieran-TypeScript, and Code Simplicity reviewers. Key changes from v1:
- Schema reduced from 10 fields to 6 (cut mode, difficulty, estimatedTime, confidenceNotes)
- Modal extracted to own component (was inline in dashboard)
- OpenAI call centralized in `openai.ts` helper (was inline in route)
- Fixed camelCase naming (was snake_case in schemas)
- Fixed `skills` to use `SkillSchema` enum (was untyped `z.string()`)
- Discovered evaluator context persistence bug in existing POST /api/scenarios
- Cut demo mode mock, skeleton loader, AI badges, character counter, unsaved changes dialog
- Simplified state from 4-state string to `generatedScenario | null` + `isLoading`
- Simplified error handling from 5 cases to 3

---

## References

### Internal
- `src/app/api/scenarios/route.ts:67-127` — Existing scenario creation pattern
- `src/app/api/scenarios/import/route.ts:90-108` — Evaluator context file storage pattern
- `src/lib/openai.ts:31-47` — `getChatCompletionSimple` pattern
- `src/lib/openai.ts:235-297` — `generateEvaluation` pattern (closest analogy)
- `src/lib/validators.ts:55-76` — `createScenarioSchema` (validation target for save)
- `src/lib/skills.ts:5-21` — Predefined skills list + `SkillSchema`
- `src/lib/skills.ts:67-97` — `inferDifficulty()`, `estimateTime()` heuristics
- `src/components/supervisor-dashboard.tsx:936-1247` — Existing scenario form modal
- `src/components/bulk-import-modal.tsx` — Extracted modal precedent
- `prompts/evaluator-v1.txt` — Example prompt file

### External
- [OpenAI Structured Outputs Guide](https://platform.openai.com/docs/guides/structured-outputs)
- [OpenAI Node SDK zodResponseFormat](https://github.com/openai/openai-node/blob/master/helpers.md)
- Feature backlog: `plans/ptg-parity-feature-backlog.md`
