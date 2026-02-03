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
import { Assistant } from './agent.js';

// Load environment variables from a local file.
dotenv.config({ path: '.env.local' });

export default defineAgent({
  prewarm: async (proc: JobProcess) => {
    proc.userData.vad = await silero.VAD.load();
  },
  entry: async (ctx: JobContext) => {
    // Use OpenAI Realtime API for voice (same as current ws-server approach)
    // This gives us the "shimmer" voice and direct speech-to-speech
    const session = new voice.AgentSession({
      llm: new openai.realtime.RealtimeModel({
        voice: 'shimmer',
        model: 'gpt-4o-realtime-preview',
      }),
      vad: ctx.proc.userData.vad! as silero.VAD,
    });

    // Metrics collection for performance monitoring
    const usageCollector = new metrics.UsageCollector();
    session.on(voice.AgentSessionEventTypes.MetricsCollected, (ev) => {
      metrics.logMetrics(ev.metrics);
      usageCollector.collect(ev.metrics);
    });

    const logUsage = async () => {
      const summary = usageCollector.getSummary();
      console.log(`Usage: ${JSON.stringify(summary)}`);
    };

    ctx.addShutdownCallback(logUsage);

    // Start the session with our crisis caller agent
    await session.start({
      agent: new Assistant(),
      room: ctx.room,
    });

    // Join the room and connect to the user
    await ctx.connect();

    // Note: We do NOT generate an initial greeting here because
    // our prompt says the COUNSELOR speaks first, not the caller.
    // The agent will wait for the counselor's greeting before responding.
  },
});

// Run the agent server
cli.runApp(new ServerOptions({ agent: fileURLToPath(import.meta.url) }));
