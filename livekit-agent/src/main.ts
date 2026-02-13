import {
  type JobContext,
  type JobProcess,
  ServerOptions,
  cli,
  defineAgent,
  metrics,
  voice,
} from '@livekit/agents';
import * as silero from '@livekit/agents-plugin-silero';
import * as openai from '@livekit/agents-plugin-openai';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { createAssistant } from './agent.js';

dotenv.config({ path: '.env.local' });

// Shared constants for participant attribute keys
const AGENT_ATTRS = {
  SESSION_ID: 'session.id',
  ERROR: 'error',
} as const;

// Zod schema for agent dispatch metadata (must match token endpoint)
const AgentDispatchMetadataSchema = z.object({
  assignmentId: z.string().uuid().optional(),
  scenarioId: z.string().uuid().optional(),
  userId: z.string().uuid(),
});

type AgentDispatchMetadata = z.infer<typeof AgentDispatchMetadataSchema>;

// Zod schemas for API response validation (cross-process boundary)
const ScenarioResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({ prompt: z.string() }),
});

const SessionResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    sessionId: z.string(),
    currentAttempt: z.number(),
  }),
});

const TranscriptResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({ saved: z.number() }),
});

interface TranscriptTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** Must match counterpart in src/components/voice-training-view.tsx */
interface TranscriptDataMessage {
  role: 'user' | 'assistant';
  content: string;
  turnOrder: number; // 1-based, matches transcripts.length after push
}

// Environment
const getAppUrl = () => process.env.NEXT_APP_URL ?? 'http://localhost:3003';
const getServiceKey = () => process.env.INTERNAL_SERVICE_KEY ?? '';

/**
 * Fetch scenario prompt from the internal API.
 * Returns null if no scenarioId or fetch fails (falls back to default prompt).
 */
async function fetchScenarioPrompt(scenarioId: string): Promise<string | null> {
  try {
    const response = await fetch(`${getAppUrl()}/api/internal/scenarios/${scenarioId}`, {
      headers: {
        'X-Internal-Service-Key': getServiceKey(),
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      console.error(`[Agent] Failed to fetch scenario ${scenarioId}: ${response.status}`);
      return null;
    }
    const parsed = ScenarioResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      console.error(`[Agent] Unexpected scenario response shape:`, parsed.error.message);
      return null;
    }
    return parsed.data.data.prompt;
  } catch (error) {
    console.error(`[Agent] Error fetching scenario:`, error);
    return null;
  }
}

/**
 * Create a DB session via the internal API.
 * Returns { sessionId, currentAttempt } or null on failure.
 */
async function createDbSession(
  metadata: AgentDispatchMetadata,
  retries = 3,
): Promise<{ sessionId: string; currentAttempt: number } | null> {
  const body = metadata.assignmentId
    ? { type: 'assignment', assignmentId: metadata.assignmentId, userId: metadata.userId }
    : { type: 'free_practice', userId: metadata.userId, scenarioId: metadata.scenarioId };

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(`${getAppUrl()}/api/internal/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Service-Key': getServiceKey(),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });

      if (response.ok) {
        const parsed = SessionResponseSchema.safeParse(await response.json());
        if (parsed.success) {
          console.log(
            `[Agent] DB session created: ${parsed.data.data.sessionId} (attempt ${parsed.data.data.currentAttempt})`,
          );
          return parsed.data.data;
        }
        console.error(`[Agent] Unexpected session response shape:`, parsed.error.message);
      }

      console.error(`[Agent] Session creation failed (${attempt}/${retries}): ${response.status}`);
    } catch (error) {
      console.error(`[Agent] Session creation error (${attempt}/${retries}):`, error);
    }

    if (attempt < retries) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  return null;
}

/**
 * Persist transcript turns to the DB via the internal API.
 * Retries once on failure using the same loop pattern as createDbSession.
 */
async function persistTranscripts(
  sessionId: string,
  turns: TranscriptTurn[],
  attemptNumber: number,
): Promise<void> {
  if (turns.length === 0) {
    console.log('[Agent] No transcript turns to persist');
    return;
  }

  const payload = {
    turns: turns.map((turn, i) => ({
      role: turn.role,
      content: turn.content,
      turnOrder: i + 1,
      attemptNumber,
    })),
  };

  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(
        `${getAppUrl()}/api/internal/sessions/${sessionId}/transcript`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Internal-Service-Key': getServiceKey(),
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10000),
        },
      );

      if (response.ok) {
        const parsed = TranscriptResponseSchema.safeParse(await response.json());
        const saved = parsed.success ? parsed.data.data.saved : '?';
        console.log(`[Agent] Transcripts persisted: ${saved} turns saved`);
        return;
      }

      console.error(
        `[Agent] Persist transcripts failed (${attempt}/${maxAttempts}): ${response.status}`,
      );
    } catch (error) {
      console.error(
        `[Agent] Persist transcripts error (${attempt}/${maxAttempts}):`,
        error,
      );
    }
  }
}

/** Publish a transcript turn to the client via data channel (fire-and-forget). */
function publishTranscriptTurn(
  ctx: JobContext,
  role: 'user' | 'assistant',
  content: string,
  turnOrder: number,
): void {
  const msg: TranscriptDataMessage = { role, content, turnOrder };
  ctx.room.localParticipant
    ?.publishData(new TextEncoder().encode(JSON.stringify(msg)), {
      reliable: true,
      topic: 'transcript',
    })
    .catch((err) => console.warn('[Agent] Data channel publish failed:', err));
}

export default defineAgent({
  prewarm: async (proc: JobProcess) => {
    proc.userData.vad = await silero.VAD.load();
  },
  entry: async (ctx: JobContext) => {
    // 1. Parse job metadata
    let metadata: AgentDispatchMetadata;
    try {
      metadata = AgentDispatchMetadataSchema.parse(JSON.parse(ctx.job.metadata ?? '{}'));
      console.log(
        `[Agent] Metadata: assignmentId=${metadata.assignmentId ?? 'none'}, scenarioId=${metadata.scenarioId ?? 'none'}, userId=${metadata.userId}`,
      );
    } catch (error) {
      console.error('[Agent] Invalid job metadata:', error);
      await ctx.connect();
      await ctx.room.localParticipant?.setAttributes({
        [AGENT_ATTRS.ERROR]: 'Invalid session configuration',
      });
      return;
    }

    // 2. Fetch scenario prompt and create DB session in parallel
    const [scenarioPromptResult, sessionResult] = await Promise.all([
      metadata.scenarioId
        ? fetchScenarioPrompt(metadata.scenarioId)
        : Promise.resolve(null),
      createDbSession(metadata),
    ]);

    const scenarioPrompt = scenarioPromptResult ?? undefined;
    if (scenarioPrompt) {
      console.log(`[Agent] Using scenario prompt (${scenarioPrompt.length} chars)`);
    } else {
      console.log(`[Agent] ${metadata.scenarioId ? 'Scenario fetch failed' : 'No scenarioId'}, using default prompt`);
    }

    if (!sessionResult) {
      console.error('[Agent] Failed to create DB session after retries');
      await ctx.connect();
      await ctx.room.localParticipant?.setAttributes({
        [AGENT_ATTRS.ERROR]: 'Session creation failed',
      });
      return;
    }

    const { sessionId: dbSessionId, currentAttempt } = sessionResult;

    // 4. Set up transcript capture
    const transcripts: TranscriptTurn[] = [];

    // 5. Create voice session with dynamic prompt
    const session = new voice.AgentSession({
      llm: new openai.realtime.RealtimeModel({
        voice: 'shimmer',
        model: 'gpt-4o-realtime-preview',
      }),
      vad: ctx.proc.userData.vad! as silero.VAD,
    });

    // Capture user speech transcriptions
    session.on(voice.AgentSessionEventTypes.UserInputTranscribed, (event) => {
      if (event.isFinal && event.transcript) {
        transcripts.push({ role: 'user', content: event.transcript });
        console.log(`[Transcript] User: ${event.transcript.substring(0, 60)}...`);
        publishTranscriptTurn(ctx, 'user', event.transcript, transcripts.length);
      }
    });

    // Capture agent responses
    session.on(voice.AgentSessionEventTypes.ConversationItemAdded, (event) => {
      if (event.item.role === 'assistant' && event.item.textContent) {
        transcripts.push({ role: 'assistant', content: event.item.textContent });
        console.log(`[Transcript] Assistant: ${event.item.textContent.substring(0, 60)}...`);
        publishTranscriptTurn(ctx, 'assistant', event.item.textContent, transcripts.length);
      }
    });

    // Metrics collection
    const usageCollector = new metrics.UsageCollector();
    session.on(voice.AgentSessionEventTypes.MetricsCollected, (ev) => {
      metrics.logMetrics(ev.metrics);
      usageCollector.collect(ev.metrics);
    });

    // 6. Register shutdown callback to persist transcripts
    ctx.addShutdownCallback(async () => {
      console.log(`[Agent] Shutdown: persisting ${transcripts.length} transcript turns`);
      await persistTranscripts(dbSessionId, transcripts, currentAttempt);

      const summary = usageCollector.getSummary();
      console.log(`[Agent] Usage: ${JSON.stringify(summary)}`);
    });

    // 7. Start the session and connect
    await session.start({
      agent: createAssistant(scenarioPrompt),
      room: ctx.room,
    });

    await ctx.connect();

    // 8. Communicate session ID to client via participant attributes
    await ctx.room.localParticipant?.setAttributes({
      [AGENT_ATTRS.SESSION_ID]: dbSessionId,
    });

    console.log(`[Agent] Ready. Session ${dbSessionId}, attempt ${currentAttempt}`);

    // The agent waits for the counselor to speak first (per prompt instructions).
    // No initial greeting is generated.
  },
});

cli.runApp(new ServerOptions({ agent: fileURLToPath(import.meta.url) }));
