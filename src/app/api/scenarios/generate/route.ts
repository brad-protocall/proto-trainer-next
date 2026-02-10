import { NextRequest } from 'next/server'
import { requireSupervisor } from '@/lib/auth'
import { apiSuccess, apiError, handleApiError } from '@/lib/api'
import { generateScenarioSchema } from '@/lib/validators'
import { generateScenarioFromComplaint, ScenarioGenerationError } from '@/lib/openai'

/**
 * POST /api/scenarios/generate
 * Generate scenario fields from complaint text - supervisor only
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireSupervisor(request)
    if (authResult.error) return authResult.error

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
    if (error instanceof ScenarioGenerationError && error.type === 'refusal') {
      return apiError(
        { type: 'VALIDATION_ERROR', message: 'Could not generate from this text' },
        422
      )
    }

    return handleApiError(error)
  }
}
