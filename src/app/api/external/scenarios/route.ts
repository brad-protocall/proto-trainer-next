import { NextRequest } from 'next/server'
import { timingSafeEqual } from 'crypto'
import prisma from '@/lib/prisma'
import { apiSuccess, apiError, handleApiError } from '@/lib/api'

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
      skill: s.skill ?? 'general',
      difficulty: (s.difficulty ?? 'intermediate') as 'beginner' | 'intermediate' | 'advanced',
      estimatedTime: s.estimatedTime ?? 15,
    }))

    return apiSuccess({ scenarios: externalScenarios })
  } catch (error) {
    return handleApiError(error)
  }
}
