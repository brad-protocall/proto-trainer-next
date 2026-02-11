# feat: Automatic Prompt-vs-Transcript Consistency Checking

> **SUPERSEDED**: This plan has been consolidated with transcript misuse scanning into a single combined feature. See **`post-session-analysis-scanning.md`** for the updated plan (2026-02-10, after 5-agent review).

> **Goal**: After each session with a scenario, automatically compare what the AI was supposed to do (scenario prompt) vs what it actually did (transcript). Flag drift, character breaks, and missed behaviors.

## Overview

When a scenario says "You are an anxious caller reluctant to give personal information," the AI should behave that way. But sometimes it drifts — too cooperative, introduces elements not in the scenario, or fails to exhibit specified behaviors. This feature surfaces those inconsistencies automatically so the prompt engineer can iterate faster.

## Problem

- Prompt refinement requires manually reading every transcript to see if the AI followed the prompt
- AI drift from scenario is invisible unless someone reviews the full conversation
- At scale, manual review per session is impossible
- Without this feedback loop, bad prompts persist and counselors get inconsistent training experiences

## What Gets Checked

| Check | Example Issue | Severity |
|-------|---------------|----------|
| **Character break** | Scenario says "anxious caller" but AI sounds calm and composed | Warning |
| **Behavior omission** | Scenario says "reluctant to share personal info" but AI freely gives details | Warning |
| **Unauthorized elements** | AI introduces topics/backstory not in the scenario prompt | Info |
| **Difficulty mismatch** | Scenario is "advanced" difficulty but AI is too easy/cooperative | Info |
| **Role confusion** | AI starts giving counseling advice instead of playing the caller | Critical |
| **Prompt leakage** | AI references system instructions or reveals it's following a script | Critical |

## Proposed Solution

### Trigger: After Evaluation Completes (alongside misuse scan)

Same pattern as misuse scanning — fire-and-forget after evaluation:

```
POST /api/sessions/[id]/check-consistency
```

**Only runs for sessions with a scenario** (`session.scenarioId` is not null). Free practice sessions without a scenario skip this check.

### Consistency Check Endpoint

#### `POST /api/sessions/[id]/check-consistency`

**Auth**: Any authenticated user who owns the session.

**Flow**:
1. Load session with scenario (including `scenario.prompt` and `scenario.description`)
2. Load transcript
3. Skip if no scenario (`scenarioId` is null) — return `{ skipped: true, reason: 'no_scenario' }`
4. Skip if < 3 turns
5. Skip if check already ran (idempotency: check for existing `SessionFlag` with `source: 'consistency_check'`)
6. Call OpenAI with consistency checking prompt
7. Parse response for findings
8. Create `SessionFlag` records for any issues
9. Return `{ checked: true, flagCount: N }`

### Consistency Check Prompt

```
You are a quality assurance reviewer for a crisis counselor training simulator.

A scenario prompt was given to an AI to roleplay a specific character. Your job is to compare the scenario prompt against what the AI actually did in the conversation, and identify any inconsistencies.

SCENARIO PROMPT (what the AI was instructed to do):
---
{scenario_prompt}
---

SCENARIO DESCRIPTION (context for what the training session should cover):
---
{scenario_description}
---

ACTUAL TRANSCRIPT (what happened in the conversation):
---
{transcript}
---

Analyze the transcript against the scenario prompt. Check for:

1. CHARACTER CONSISTENCY: Does the AI maintain the personality, emotions, and background described in the prompt? Does it stay in character throughout?

2. BEHAVIOR FIDELITY: Does the AI exhibit all the specific behaviors the prompt specifies? (e.g., "reluctant to share info" → does the AI actually resist sharing?)

3. UNAUTHORIZED ELEMENTS: Does the AI introduce topics, backstory, or details NOT present in the scenario prompt?

4. DIFFICULTY CALIBRATION: If the scenario specifies a difficulty level, does the AI's behavior match? (e.g., "advanced" scenarios should be challenging, not too easy)

5. ROLE BOUNDARIES: Does the AI stay in its role as the caller/client? Does it ever slip into giving advice, breaking the fourth wall, or referencing that it's an AI?

6. PROMPT LEAKAGE: Does the AI reveal any system instructions, reference its scenario prompt, or break immersion?

Respond in this exact JSON format:
{
  "consistent": true/false,
  "overallScore": 1-10,
  "findings": [
    {
      "category": "character_break|behavior_omission|unauthorized_element|difficulty_mismatch|role_confusion|prompt_leakage",
      "severity": "critical|warning|info",
      "summary": "Brief description (max 200 chars)",
      "evidence": "Relevant quote from transcript",
      "promptReference": "Which part of the scenario prompt this relates to"
    }
  ],
  "summary": "2-3 sentence overall assessment"
}

If the AI followed the scenario faithfully, return: { "consistent": true, "overallScore": 9, "findings": [], "summary": "AI maintained character well..." }
```

**Model**: gpt-4.1, temp 0.3 (same as evaluator and scanner).

### LLM Function in openai.ts

Add `checkPromptConsistency()` to `src/lib/openai.ts`:

```typescript
export async function checkPromptConsistency(options: {
  scenarioPrompt: string
  scenarioDescription: string | null
  transcript: TranscriptTurn[]
}): Promise<{ consistent: boolean; overallScore: number; findings: ConsistencyFinding[] }>
```

## Files Changed

| File | Change |
|------|--------|
| `src/lib/openai.ts` | Add `checkPromptConsistency()` function |
| `src/app/api/sessions/[id]/check-consistency/route.ts` | **New**: POST endpoint for consistency check |
| `src/lib/validators.ts` | Add `consistencyCheckResultSchema` Zod schema |
| `src/types/index.ts` | Add `ConsistencyFinding` interface |
| `src/components/voice-training-view.tsx` | Fire-and-forget consistency check after evaluation (if session has scenario) |
| `src/components/chat-training-view.tsx` | Same |

## Acceptance Criteria

- [ ] `POST /api/sessions/[id]/check-consistency` runs LLM consistency check
- [ ] Check only runs for sessions with a scenario (skips open free practice)
- [ ] Check is idempotent
- [ ] Role confusion and prompt leakage flagged as `severity: critical`
- [ ] Character breaks and behavior omissions flagged as `severity: warning`
- [ ] Consistent sessions get a `consistency_clean` flag (audit trail)
- [ ] `overallScore` is stored (useful for tracking prompt quality over time)
- [ ] Frontend fires check after evaluation (fire-and-forget)
- [ ] Supervisor sees consistency flags in `GET /api/flags`
- [ ] `npx tsc --noEmit` passes
- [ ] `npm run lint` passes

## Dependencies

- Depends on: Post-Session Feedback feature (creates the `SessionFlag` model)
- Uses: Same `GET /api/flags` supervisor endpoint

## Value for Prompt Engineering

This is the **feedback loop for prompt refinement**. Without it:
- Write scenario prompt → counselors use it → hope it works → manually read transcripts to verify

With it:
- Write scenario prompt → counselors use it → system tells you what drifted → fix the prompt → verify improvement

**Key metric**: `overallScore` over time per scenario. If Scenario X averages 8/10 consistency but Scenario Y averages 5/10, you know where to focus prompt refinement.

## Cost Estimate

Similar to misuse scanning: ~$0.03-0.08 per check (larger input due to scenario prompt). At 100 sessions/week, ~$3-8/week. Only runs on sessions with scenarios, so free practice reduces the count.

## Future Improvements (SWE Handoff)

- Aggregate consistency scores per scenario (dashboard view)
- Auto-suggest prompt improvements based on recurring findings
- A/B testing: compare consistency between prompt versions
- Scenario "health score" derived from consistency data
