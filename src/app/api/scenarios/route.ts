import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiSuccess, handleApiError, validationError } from '@/lib/api'
import { getCurrentUser } from '@/lib/auth'
import { createScenarioSchema, scenarioQuerySchema } from '@/lib/validators'

/**
 * GET /api/scenarios
 *
 * List all scenarios with optional filters.
 * Returns scenarios with creator and account info.
 * Query params:
 *   - category: 'onboarding' | 'refresher' | 'advanced' | 'assessment' (optional)
 *   - mode: 'phone' | 'chat' (optional)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = Object.fromEntries(request.nextUrl.searchParams)
    const queryResult = scenarioQuerySchema.safeParse(searchParams)

    // Extract validated query params
    const { category, mode } = queryResult.success
      ? queryResult.data
      : { category: undefined, mode: undefined }

    const scenarios = await prisma.scenario.findMany({
      where: {
        ...(category ? { category } : {}),
        ...(mode ? { mode } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        creator: {
          select: {
            id: true,
            displayName: true,
            email: true,
          },
        },
        account: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    return apiSuccess(scenarios)
  } catch (error) {
    return handleApiError(error)
  }
}

/**
 * POST /api/scenarios
 *
 * Create a new scenario.
 * Body:
 *   - title: string (required)
 *   - description: string (optional)
 *   - prompt: string (required)
 *   - mode: 'phone' | 'chat' (default: 'phone')
 *   - category: 'onboarding' | 'refresher' | 'advanced' | 'assessment' (optional)
 *   - accountId: uuid (optional)
 *   - isOneTime: boolean (default: false)
 *   - relevantPolicySections: string (optional)
 */
export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      return validationError('User not authenticated')
    }

    const body = await request.json().catch(() => null)

    if (!body) {
      return validationError('Invalid JSON body')
    }

    const result = createScenarioSchema.safeParse(body)

    if (!result.success) {
      return validationError('Validation failed', result.error.flatten().fieldErrors as Record<string, string[]>)
    }

    const scenario = await prisma.scenario.create({
      data: {
        title: result.data.title,
        description: result.data.description,
        prompt: result.data.prompt,
        mode: result.data.mode,
        category: result.data.category,
        accountId: result.data.accountId,
        isOneTime: result.data.isOneTime,
        relevantPolicySections: result.data.relevantPolicySections,
        createdBy: currentUser.id,
      },
      include: {
        creator: {
          select: {
            id: true,
            displayName: true,
            email: true,
          },
        },
        account: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    return apiSuccess(scenario)
  } catch (error) {
    return handleApiError(error)
  }
}
