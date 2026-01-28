import { NextRequest } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { apiSuccess, apiError, handleApiError } from '@/lib/api'
import { ScenarioCategorySchema } from '@/lib/validators'

// Constants for external API
const EXTERNAL_SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000099'
const EXTERNAL_ACCOUNT_ID = '00000000-0000-0000-0000-000000000020'

/**
 * Timing-safe API key comparison to prevent timing attacks
 */
function validateApiKey(request: NextRequest): boolean {
  const apiKey = request.headers.get('X-API-Key')
  const expectedKey = process.env.EXTERNAL_API_KEY

  if (!apiKey || !expectedKey) {
    return false
  }

  // Ensure same length before comparing
  if (apiKey.length !== expectedKey.length) {
    return false
  }

  return timingSafeEqual(Buffer.from(apiKey), Buffer.from(expectedKey))
}

// Request body schema for POST (snake_case for external API)
const CreateScenarioSchema = z.object({
  title: z.string().min(1, 'title is required').max(255),
  description: z.string().max(1000).optional(),
  prompt: z.string().min(1, 'prompt is required'),
  mode: z.enum(['phone', 'chat']).default('phone'),
  category: ScenarioCategorySchema.optional(),
  skills: z.array(z.string()).default([]),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']).default('intermediate'),
  estimated_time: z.number().int().min(5).max(120).default(15),
  is_one_time: z.boolean().default(false),
  relevant_policy_sections: z.string().max(500).optional(),
})

/**
 * Map scenario to external format
 */
function toExternalScenario(s: {
  id: string
  title: string
  description: string | null
  mode: string
  category: string | null
  skill: string | null
  skills: string[]
  difficulty: string | null
  estimatedTime: number | null
  isOneTime: boolean
}) {
  return {
    id: s.id,
    name: s.title,
    description: s.description ?? '',
    mode: s.mode as 'phone' | 'chat',
    category: s.category ?? 'general',
    skill: s.skills[0] ?? s.skill ?? 'general',
    skills: s.skills.length > 0 ? s.skills : (s.skill ? [s.skill] : ['general']),
    difficulty: (s.difficulty ?? 'intermediate') as 'beginner' | 'intermediate' | 'advanced',
    estimatedTime: s.estimatedTime ?? 15,
    isOneTime: s.isOneTime,
  }
}

/**
 * GET /api/external/scenarios
 * List available simulation scenarios for external integrations
 */
export async function GET(request: NextRequest) {
  // Validate API key
  if (!validateApiKey(request)) {
    return apiError({ type: 'UNAUTHORIZED', message: 'Invalid or missing API key' }, 401)
  }

  try {
    const scenarios = await prisma.scenario.findMany({
      where: {
        isOneTime: false, // Only return reusable scenarios
      },
      select: {
        id: true,
        title: true,
        description: true,
        mode: true,
        category: true,
        skill: true,
        skills: true,
        difficulty: true,
        estimatedTime: true,
      },
      orderBy: {
        title: 'asc',
      },
    })

    // Map to external format
    const externalScenarios = scenarios.map((s) => ({
      id: s.id,
      name: s.title,
      description: s.description ?? '',
      mode: s.mode as 'phone' | 'chat',
      category: s.category ?? 'general',

      // DEPRECATED: Use 'skills' array instead
      skill: s.skills[0] ?? s.skill ?? 'general',

      // NEW: Skills array (preferred)
      skills: s.skills.length > 0 ? s.skills : (s.skill ? [s.skill] : ['general']),

      difficulty: (s.difficulty ?? 'intermediate') as 'beginner' | 'intermediate' | 'advanced',
      estimatedTime: s.estimatedTime ?? 15,
    }))

    return apiSuccess({ scenarios: externalScenarios })
  } catch (error) {
    return handleApiError(error)
  }
}

/**
 * POST /api/external/scenarios
 * Create a new scenario for external integrations (e.g., Personalized Training Guide)
 *
 * Supports creating both reusable (global) and one-time scenarios.
 * One-time scenarios (is_one_time: true) are hidden from the GET list.
 */
export async function POST(request: NextRequest) {
  if (!validateApiKey(request)) {
    return apiError({ type: 'UNAUTHORIZED', message: 'Invalid or missing API key' }, 401)
  }

  try {
    const body = await request.json()
    const parsed = CreateScenarioSchema.safeParse(body)

    if (!parsed.success) {
      return apiError(
        {
          type: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
        },
        400
      )
    }

    const {
      title,
      description,
      prompt,
      mode,
      category,
      skills,
      difficulty,
      estimated_time,
      is_one_time,
      relevant_policy_sections,
    } = parsed.data

    // Create the scenario
    const scenario = await prisma.scenario.create({
      data: {
        title,
        description,
        prompt,
        mode,
        category: category ?? null,
        skills,
        difficulty,
        estimatedTime: estimated_time,
        isOneTime: is_one_time,
        relevantPolicySections: relevant_policy_sections,
        createdBy: EXTERNAL_SYSTEM_USER_ID,
        accountId: EXTERNAL_ACCOUNT_ID,
      },
      select: {
        id: true,
        title: true,
        description: true,
        mode: true,
        category: true,
        skill: true,
        skills: true,
        difficulty: true,
        estimatedTime: true,
        isOneTime: true,
      },
    })

    return apiSuccess({ scenario: toExternalScenario(scenario) }, 201)
  } catch (error) {
    return handleApiError(error)
  }
}
