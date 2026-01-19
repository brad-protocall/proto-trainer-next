import { z } from 'zod'

// =============================================================================
// Environment Variable Schema
// =============================================================================

const envSchema = z.object({
  // Development ports
  PORT: z.string().default('3003'),
  WS_PORT: z.string().default('3004'),
  NEXT_PUBLIC_WS_URL: z.string().url().optional(),

  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // OpenAI API
  OPENAI_API_KEY: z.string().optional(),

  // Realtime API (voice training)
  REALTIME_MODEL: z.string().default('gpt-4o-realtime-preview'),
  REALTIME_VOICE: z.string().default('shimmer'),
  REALTIME_PHONE_PROMPT_ID: z.string().optional(),

  // Chat API (text training)
  CHAT_SIMULATOR_PROMPT_ID: z.string().optional(),
  CHAT_SIMULATOR_MODEL: z.string().default('gpt-4o'),

  // Evaluator API
  EVALUATOR_PROMPT_ID: z.string().optional(),
  EVALUATOR_MODEL: z.string().default('gpt-4.1'),

  // Optional: Vector store for policy file_search
  ACCOUNT_POLICIES_VECTOR_STORE_ID: z.string().optional(),

  // Node environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
})

// =============================================================================
// Type Definition
// =============================================================================

export type Env = z.infer<typeof envSchema>

// =============================================================================
// Validation and Export
// =============================================================================

function validateEnv(): Env {
  const parsed = envSchema.safeParse(process.env)

  if (!parsed.success) {
    console.error('Invalid environment variables:')
    console.error(parsed.error.flatten().fieldErrors)
    throw new Error('Invalid environment configuration')
  }

  return parsed.data
}

/**
 * Validated environment variables.
 * Access via `env.DATABASE_URL`, `env.OPENAI_API_KEY`, etc.
 */
export const env = validateEnv()
