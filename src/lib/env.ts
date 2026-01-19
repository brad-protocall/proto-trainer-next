import { z } from 'zod';

const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3003'),

  // Database
  DATABASE_URL: z.string(),

  // OpenAI
  OPENAI_API_KEY: z.string(),

  // Chat simulator (optional stored prompt)
  CHAT_SIMULATOR_PROMPT_ID: z.string().optional(),
  CHAT_SIMULATOR_MODEL: z.string().default('gpt-4o'),

  // Evaluator (optional stored prompt)
  EVALUATOR_PROMPT_ID: z.string().optional(),
  EVALUATOR_MODEL: z.string().default('gpt-4.1'),

  // Realtime voice (optional)
  REALTIME_MODEL: z.string().default('gpt-4o-realtime-preview'),
  REALTIME_VOICE: z.string().default('shimmer'),
  REALTIME_PHONE_PROMPT_ID: z.string().optional(),

  // WebSocket
  WS_PORT: z.string().default('3004'),
  NEXT_PUBLIC_WS_URL: z.string().default('ws://localhost:3004'),

  // Optional: Vector store for policy file_search
  ACCOUNT_POLICIES_VECTOR_STORE_ID: z.string().optional(),
});

// Parse and validate environment variables
function validateEnv() {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error('Invalid environment variables:');
    console.error(parsed.error.flatten().fieldErrors);
    throw new Error('Invalid environment configuration');
  }

  return parsed.data;
}

// Export validated environment
export const env = validateEnv();

// Type export for use elsewhere
export type Env = z.infer<typeof envSchema>;
