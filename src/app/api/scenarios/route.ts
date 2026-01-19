import { NextRequest } from 'next/server'
import prisma from '@/lib/prisma'
import { apiSuccess, apiError, handleApiError } from '@/lib/api'
import { createScenarioSchema, scenarioQuerySchema } from '@/lib/validators'

export async function GET(request: NextRequest) {
  try {
    const searchParams = Object.fromEntries(request.nextUrl.searchParams)
    const queryResult = scenarioQuerySchema.safeParse(searchParams)

    const scenarios = await prisma.scenario.findMany({
      where: {
        ...(queryResult.success && queryResult.data.category && { category: queryResult.data.category }),
        ...(queryResult.success && queryResult.data.mode && { mode: queryResult.data.mode }),
      },
      include: {
        creator: { select: { displayName: true } },
        account: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return apiSuccess(scenarios)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    // Get user ID from header (matches current app's simple auth)
    const userId = request.headers.get('x-user-id')
    if (!userId) {
      return apiError({ code: 'UNAUTHORIZED', message: 'User ID required' }, 401)
    }

    const body = await request.json()
    const result = createScenarioSchema.safeParse(body)

    if (!result.success) {
      return apiError(
        { code: 'VALIDATION_ERROR', fields: result.error.flatten().fieldErrors as Record<string, string[]> },
        400
      )
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
        createdById: userId,
      },
      include: {
        creator: { select: { displayName: true } },
        account: { select: { name: true } },
      },
    })

    return apiSuccess(scenario)
  } catch (error) {
    return handleApiError(error)
  }
}
