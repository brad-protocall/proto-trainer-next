# feat: Replace ws-server with LiveKit for voice AI training

**Type:** Enhancement (infrastructure migration)
**Priority:** P0
**Status:** Ready for implementation

---

## Overview

Replace the custom `ws-server/` WebSocket relay (port 3004) with LiveKit Cloud for all voice AI training. The LiveKit spike (commit `41375b0`) proved voice quality, cloud deployment, and token-based auth all work. This plan covers the full production integration.

**What changes:** Voice transport layer only. All REST APIs, database schema, text chat training, supervisor dashboard, and External API (PTG integration) are completely unaffected.

**What we gain:**
- Token-based JWT auth (eliminates P1 WebSocket security issue)
- No self-hosted WebSocket process (eliminates port 3004 and ws-server/)
- Better voice quality via WebRTC (echo cancellation, NAT traversal)
- Simplified deployment (only port 3003 needs exposure)
- Cloud-managed agent scaling

---

## Architecture: Before and After

```
BEFORE:
Browser --> raw WebSocket (port 3004) --> ws-server --> OpenAI Realtime API
  |                                          |
  |-- AudioWorklet + PCM16 encoding          |-- Session creation
  |-- Custom AudioPlayer                     |-- Transcript capture
  |-- Manual reconnection                    |-- Recording (WAV)

AFTER:
Browser --> WebRTC --> LiveKit Cloud SFU --> LiveKit Agent --> OpenAI Realtime API
  |                                            |
  |-- LiveKitRoom component                    |-- Session creation (internal API)
  |-- useVoiceAssistant() hook                 |-- Transcript capture (bulk POST)
  |-- Built-in reconnection                    |-- Session ID via participant attrs
```

**Important:** `POST /api/sessions` (text chat) is untouched. Voice sessions use a new `POST /api/internal/sessions` endpoint that skips greeting generation.

---

## Design Decisions

- **No custom hook.** LiveKit SDK provides `useVoiceAssistant()`, `useConnectionState()`, and `useRoomContext()`. The only custom logic (token fetch, session ID read, evaluation retry) goes directly in the component or a small utility function. The current `use-realtime-voice.ts` needed a hook because it managed 8 refs (WebSocket, AudioContext, AudioWorklet, MediaStream). LiveKit manages zero refs -- the SDK does it all.
- **Agent owns session lifecycle.** The agent creates DB sessions, handles attempt tracking, and persists transcripts. The token endpoint's only job is auth validation and token generation.
- **Internal API for voice sessions.** `POST /api/internal/sessions` authenticates via `INTERNAL_SERVICE_KEY`, skips `generateInitialGreeting()`, returns just the session ID. Text chat sessions continue using the existing `POST /api/sessions` endpoint unchanged.
- **Shared metadata contract.** Zod schema validates agent dispatch metadata (`{ assignmentId, scenarioId, userId }`) at runtime in the agent. Matching interface in Next.js for the token endpoint.
- **Shared attribute constants.** Participant attribute keys (`session.id`, `error`) defined as constants in both codebases to prevent string typo bugs.
- **Room names use UUID.** `training-${crypto.randomUUID().slice(0, 8)}` -- simple, unique, doesn't leak assignment IDs.
- **Best-effort transcript persistence.** Agent retries once on failure. Client evaluation retry (5x, 2s delay) handles the timing gap. Acceptable for prototype.
- **TOCTOU risk accepted.** Token TTL is 1 hour. Agent trusts token metadata. Assignment `in_progress` status prevents deletion.

---

## Technical Approach

### Phase A: Backend (Agent + Token Endpoint + Internal API)

**Goal:** Make the agent production-ready and create the server-side infrastructure.

#### A.1 Internal Voice Session Endpoint

Create `POST /api/internal/sessions` for agent-to-API session creation:

```typescript
// src/app/api/internal/sessions/route.ts
// Authenticates via X-Internal-Service-Key header
// Does NOT call generateInitialGreeting() (voice doesn't need text greetings)
// Returns { sessionId }
// Handles attempt tracking: if assignment already has a session, increments currentAttempt

import { z } from "zod";

const createVoiceSessionSchema = z.object({
  type: z.enum(["assignment", "free_practice"]),
  assignmentId: z.string().uuid().optional(),
  userId: z.string().uuid(),
  scenarioId: z.string().uuid().optional(),
});
```

**Files:** `src/app/api/internal/sessions/route.ts` (new)

#### A.2 Internal Transcript Endpoint

Create `POST /api/internal/sessions/[id]/transcript` for bulk transcript persistence:

```typescript
// src/app/api/internal/sessions/[id]/transcript/route.ts
// Authenticates via X-Internal-Service-Key header
// Accepts { turns: Array<{ role, content, turnOrder, attemptNumber }> }
// Bulk-inserts TranscriptTurn records

import { z } from "zod";

const bulkTranscriptSchema = z.object({
  turns: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string(),
    turnOrder: z.number().int().positive(),
    attemptNumber: z.number().int().positive().optional(),
  })),
});
```

**Files:** `src/app/api/internal/sessions/[id]/transcript/route.ts` (new)

#### A.3 INTERNAL_SERVICE_KEY Validation

Add a shared auth helper for internal endpoints:

```typescript
// In src/lib/auth.ts (add to existing)
export function requireInternalAuth(request: Request): void {
  const key = request.headers.get("X-Internal-Service-Key");
  if (!key || key !== process.env.INTERNAL_SERVICE_KEY) {
    throw new Error("Unauthorized");
  }
}
```

**Files:** `src/lib/auth.ts` (modify), `src/lib/env.ts` (add `INTERNAL_SERVICE_KEY`)

#### A.4 Dynamic Scenario Prompts (Agent)

Currently the crisis caller prompt is hardcoded in `livekit-agent/src/agent.ts`. The agent needs to:

1. Read `ctx.job.metadata` to get assignment context
2. Validate metadata with Zod schema:
   ```typescript
   const AgentDispatchMetadataSchema = z.object({
     assignmentId: z.string().uuid().optional(),
     scenarioId: z.string().uuid().optional(),
     userId: z.string().uuid(),
   });
   ```
3. If `scenarioId` exists, fetch prompt from `GET /api/scenarios/{scenarioId}`
4. If no `scenarioId`, load default crisis caller prompt
5. Pass the prompt as instructions to `openai.realtime.RealtimeModel`

**Files:** `livekit-agent/src/agent.ts`, `livekit-agent/src/main.ts`

#### A.5 Session Creation (Agent)

The agent creates the DB session on startup (mirrors ws-server behavior):

1. Call `POST ${NEXT_APP_URL}/api/internal/sessions` with `INTERNAL_SERVICE_KEY` header
2. Store returned `sessionId` for transcript persistence
3. Communicate `sessionId` back to client via participant attributes:
   ```typescript
   const AGENT_ATTRS = { SESSION_ID: "session.id", ERROR: "error" } as const;
   ctx.room.localParticipant.setAttributes({ [AGENT_ATTRS.SESSION_ID]: dbSessionId });
   ```
4. If session creation fails after 3 retries (2s backoff), set error attribute and disconnect

**Files:** `livekit-agent/src/main.ts`

#### A.6 Transcript Capture and Persistence (Agent)

Listen for agent session events and persist on shutdown:

```typescript
// Capture events during conversation
session.on(AgentSessionEventTypes.UserInputTranscribed, ...)
session.on(AgentSessionEventTypes.ConversationItemAdded, ...)

// Persist on shutdown via internal API
ctx.addShutdownCallback(async () => {
  await fetch(`${NEXT_APP_URL}/api/internal/sessions/${dbSessionId}/transcript`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Service-Key": process.env.INTERNAL_SERVICE_KEY,
    },
    body: JSON.stringify({ turns: transcripts }),
  });
});
```

**Files:** `livekit-agent/src/main.ts`

#### A.7 Agent Environment Variables

The agent (running in LiveKit Cloud) needs:

- `NEXT_APP_URL` -- Public URL of the Next.js app (for API calls)
- `INTERNAL_SERVICE_KEY` -- Auth key for agent-to-API calls (must match Next.js env)

**Local development:** Use ngrok or similar to expose localhost:3003 to the cloud-deployed agent. Set `NEXT_APP_URL` to the ngrok URL. Alternative: run agent locally with `lk agent run` during development.

**Files:** `livekit-agent/.env.local`

#### A.8 Token Endpoint

Upgrade `src/app/api/livekit/token/route.ts` from spike to production:

1. Change from GET to POST
2. Validate `x-user-id` header (existing auth pattern)
3. Validate body with Zod schema:
   ```typescript
   export const createLiveKitTokenSchema = z.object({
     assignmentId: z.string().uuid().optional(),
     scenarioId: z.string().uuid().optional(),
   });
   ```
4. If `assignmentId` provided, verify ownership via DB lookup
5. Generate room name: `training-${crypto.randomUUID().slice(0, 8)}`
6. Encode agent dispatch with `RoomAgentDispatch` containing metadata
7. Return using existing patterns: `apiSuccess({ token, serverUrl, roomName })`
8. Errors use `badRequest()`, `forbidden()`, etc.

```typescript
import { AccessToken, RoomAgentDispatch, RoomConfiguration } from "livekit-server-sdk";
```

**Files:** `src/app/api/livekit/token/route.ts`, `src/lib/validators.ts` (add schema)

#### A.9 Redeploy Agent

After all agent changes: `cd livekit-agent && lk agent deploy`

---

### Phase B: Frontend Swap + Cleanup

**Goal:** Replace the voice UI with LiveKit React components and delete all old code in the same pass.

#### B.1 Update VoiceTrainingView

Modify `src/components/voice-training-view.tsx`:

1. Add token fetch as `handleConnect` async function (no custom hook)
2. Conditionally render `<LiveKitRoom>` when token is available:
   ```typescript
   {token && serverUrl && (
     <LiveKitRoom token={token} serverUrl={serverUrl} onDisconnected={handleDisconnect}>
       <RoomAudioRenderer />
       <VoiceAssistantControlBar />
       <BarVisualizer />
       {children}
     </LiveKitRoom>
   )}
   ```
3. Inside `<LiveKitRoom>`, use `useVoiceAssistant()` for agent state
4. Read session ID from agent participant attributes with null check:
   ```typescript
   const AGENT_ATTRS = { SESSION_ID: "session.id", ERROR: "error" } as const;
   const sessionId = agentAttributes?.[AGENT_ATTRS.SESSION_ID];
   if (!sessionId) {
     setError("Agent failed to create session. Please try again.");
     return;
   }
   ```
5. Keep evaluation retry logic as plain async function (~30 lines)
6. Keep evaluation modal unchanged
7. Keep "Get Feedback" button unchanged

**Files:** `src/components/voice-training-view.tsx`

#### B.2 Delete Old Voice Infrastructure

All in the same commit as B.1:

| File/Directory | Reason |
|----------------|--------|
| `ws-server/` (entire directory) | Replaced by LiveKit agent |
| `src/hooks/use-realtime-voice.ts` | Replaced by LiveKit SDK hooks in component |
| `src/lib/audio.ts` | `AudioPlayer`, PCM16 utils no longer needed |
| `public/audio-processor.js` | AudioWorklet no longer needed |
| `src/app/spike/livekit/page.tsx` | Spike page served its purpose |

#### B.3 Update Configuration

| File | Change |
|------|--------|
| `package.json` | Remove `ws:dev` and `ws:start` scripts |
| `.env.example` | Remove `WS_PORT`, `NEXT_PUBLIC_WS_URL`. Add `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `NEXT_PUBLIC_LIVEKIT_URL`, `INTERNAL_SERVICE_KEY` |
| `src/lib/env.ts` | Remove `WS_PORT` validation. Add required LiveKit validation: `LIVEKIT_API_KEY: z.string().min(1)`, `LIVEKIT_API_SECRET: z.string().min(1)`, `NEXT_PUBLIC_LIVEKIT_URL: z.string().url()`, `INTERNAL_SERVICE_KEY: z.string().min(1)` |
| `src/types/index.ts` | Remove `RealtimeMessageType`, `RealtimeMessage`, `RealtimeVoice`. Keep `ConnectionStatus`, `EvaluationResult`. |
| `CLAUDE.md` | Update architecture table, port assignments, quick start, env vars. Remove ws-server references. |

---

## Acceptance Criteria

### Functional Requirements

- [ ] Assigned training: counselor can start voice training on an assigned scenario
- [ ] Free practice: counselor can start voice training without an assignment
- [ ] Dynamic prompts: agent uses the scenario-specific prompt for assigned training
- [ ] Default prompt: agent uses crisis caller prompt for free practice
- [ ] Session creation: DB session created via internal API when agent joins room
- [ ] Transcript capture: all conversation turns persisted to DB on session end
- [ ] Session ID: client receives session ID from agent for evaluation
- [ ] Evaluation: "Get Feedback" triggers evaluation and displays results
- [ ] Attempt tracking: retries on same assignment increment attempt counter
- [ ] Connection status: UI shows connecting/connected/disconnected states
- [ ] Error handling: agent failure or network issues show appropriate error messages

### Non-Functional Requirements

- [ ] No regression in voice quality
- [ ] Port 3004 no longer required
- [ ] `npm run ws:dev` no longer required to start voice training
- [ ] Text chat training completely unaffected (`POST /api/sessions` unchanged)
- [ ] External API (`/api/external/*`) works identically
- [ ] Supervisor dashboard completely unaffected
- [ ] Type check passes: `npx tsc --noEmit`
- [ ] Lint passes: `npm run lint`

### Quality Gates

- [ ] All ws-server/ references removed from codebase
- [ ] No `NEXT_PUBLIC_WS_URL` or `WS_PORT` references remain
- [ ] Agent deployed and running on LiveKit Cloud
- [ ] Demo tested: assigned training end-to-end
- [ ] Demo tested: free practice end-to-end

---

## Edge Cases

| Edge Case | Mitigation |
|-----------|------------|
| Agent fails to start | `LiveKitRoom` `onError` callback shows error to user. Timeout with retry prompt. |
| Browser tab closed without disconnect | LiveKit detects participant leave. Agent shutdown callback fires, transcripts persist. |
| Evaluation before transcripts persisted | Existing retry logic: client retries up to 5 times with 2s delay on 409 response. |

---

## What's NOT in Scope

1. **Audio recording (WAV files)** -- LiveKit has built-in recording (Egress) but configuring it is a separate task. `requireRecording` field ignored for now.
2. **Authentication overhaul** -- Still using `x-user-id` header for REST API. JWT/session auth is separate P0.
3. **CSRF protection** -- Separate P2.
4. **Chat training changes** -- Completely separate system, unaffected.
5. **Database schema changes** -- None needed.
6. **New features** -- 1:1 replacement of voice transport only.
7. **Reconnection after network drop** -- LiveKit SDK auto-reconnects. If reconnect fails, session ends with partial transcript. Full resume flow is out of scope.
8. **Browser compatibility edge cases** -- LiveKit handles WebRTC cross-browser. Test during demo, fix as found.

---

## Dependencies

| Dependency | Status |
|------------|--------|
| LiveKit Cloud account | Done (spike) |
| `@livekit/components-react` | Installed (2.9.19) |
| `livekit-client` | Installed (2.17.0) |
| `livekit-server-sdk` | Installed (2.15.0) |
| `@livekit/agents` | Installed in livekit-agent/ (^1.0.40) |
| LiveKit agent deployed | Done (Agent ID: CA_GUpZ97G5vvd3) |
| `lk` CLI | Installed via brew |

---

## References

### Internal
- LiveKit spike plan: `docs/plans/livekit-spike.md`
- Current voice hook: `src/hooks/use-realtime-voice.ts`
- Current WS relay: `ws-server/realtime-session.ts`
- Voice training UI: `src/components/voice-training-view.tsx`
- Token spike: `src/app/api/livekit/token/route.ts`
- Agent code: `livekit-agent/src/main.ts`

### External
- [LiveKit Agent Dispatch](https://docs.livekit.io/agents/server/agent-dispatch)
- [LiveKit External Data / Job Metadata](https://docs.livekit.io/agents/build/external-data)
- [LiveKit Agent Events](https://docs.livekit.io/agents/build/events)
- [LiveKit React Components](https://docs.livekit.io/agents/start/frontend)
- [useVoiceAssistant Hook](https://docs.livekit.io/reference/components/react/hook/usevoiceassistant/)
- [useTranscriptions Hook](https://docs.livekit.io/reference/components/react/hook/usetranscriptions/)
- [Agent Starter React](https://github.com/livekit-examples/agent-starter-react)
- [Participant Attributes](https://docs.livekit.io/home/client/state/participant-attributes)
