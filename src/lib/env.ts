import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.string(),
  OPENAI_API_KEY: z.string().optional(),
  // DEMO_MODE enables prototype features like user switching (remove for production)
  NEXT_PUBLIC_DEMO_MODE: z.string().optional().transform(val => val === 'true'),
  REALTIME_MODEL: z.string().default('gpt-4o-realtime-preview'),
  REALTIME_VOICE: z.enum(['shimmer', 'alloy', 'echo', 'fable', 'onyx', 'nova']).default('shimmer'),
  REALTIME_PHONE_PROMPT_ID: z.string().optional(),
  CHAT_MODEL: z.string().default('gpt-4.1'),
  CHEXT_SIMULATOR_PROMPT_FILE: z.string().default('chext-simulator.txt'),
  EVALUATOR_PROMPT_ID: z.string().optional(),
  EVALUATOR_MODEL: z.string().default('gpt-4.1'),
  ACCOUNT_POLICIES_VECTOR_STORE_ID: z.string().optional(),
  PORT: z.string().default('3003'),
  // LiveKit
  LIVEKIT_API_KEY: z.string().min(1).optional(),
  LIVEKIT_API_SECRET: z.string().min(1).optional(),
  NEXT_PUBLIC_LIVEKIT_URL: z.string().optional(),
  // Internal service auth (LiveKit agent -> Next.js API)
  INTERNAL_SERVICE_KEY: z.string().min(1).optional(),
})

// Validate at runtime, but allow missing optional fields
export const env = envSchema.parse(process.env)
