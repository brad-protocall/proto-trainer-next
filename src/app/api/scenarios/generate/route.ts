import { NextRequest } from 'next/server'
import { requireSupervisor } from '@/lib/auth'
import { apiSuccess, apiError, handleApiError } from '@/lib/api'
import { generateScenarioSchema } from '@/lib/validators'
import { generateScenarioFromComplaint, ScenarioGenerationError } from '@/lib/openai'
import { checkRateLimit } from '@/lib/rate-limit'

/**
 * POST /api/scenarios/generate
 * Generate scenario fields from complaint text - supervisor only
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireSupervisor(request)
    if (authResult.error) return authResult.error
    const user = authResult.user

    // Rate limit: 10 requests per minute per user
    if (!checkRateLimit(`generate:${user.id}`, 10, 60_000)) {
      return apiError(
        { type: 'RATE_LIMITED', message: 'Too many generation requests. Please wait a minute.' },
        429
      )
    }

    const body = await request.json()
    const result = generateScenarioSchema.safeParse(body)

    if (!result.success) {
      return apiError(
        { type: 'VALIDATION_ERROR', message: 'Validation failed', details: result.error.flatten().fieldErrors as Record<string, unknown> },
        400
      )
    }

    const generated = await generateScenarioFromComplaint(
      result.data.sourceText,
      result.data.additionalInstructions
    )

    return apiSuccess(generated)
  } catch (error) {
    if (error instanceof ScenarioGenerationError) {
      if (error.type === 'refusal') {
        return apiError(
          { type: 'VALIDATION_ERROR', message: 'Could not generate from this text' },
          422
        )
      }
      if (error.type === 'parse_failure') {
        return apiError(
          { type: 'UPSTREAM_ERROR', message: 'AI generated an unexpected response format. Please try again.' },
          502
        )
      }
    }

    return handleApiError(error)
  }
}
