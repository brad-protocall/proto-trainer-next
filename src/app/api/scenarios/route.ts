import { NextRequest } from 'next/server'
import prisma from '@/lib/prisma'
import { apiSuccess, apiError, handleApiError, notFound } from '@/lib/api'
import { createScenarioSchema, scenarioQuerySchema } from '@/lib/validators'
import { requireAuth, requireSupervisor } from '@/lib/auth'

/**
 * GET /api/scenarios
 * List scenarios - any authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    if (authResult.error) return authResult.error

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

/**
 * POST /api/scenarios
 * Create a scenario - supervisor only
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireSupervisor(request)
    if (authResult.error) return authResult.error
    const user = authResult.user

    const body = await request.json()
    const result = createScenarioSchema.safeParse(body)

    if (!result.success) {
      return apiError(
        { code: 'VALIDATION_ERROR', fields: result.error.flatten().fieldErrors as Record<string, string[]> },
        400
      )
    }

    // Verify account exists if accountId is provided
    if (result.data.accountId) {
      const account = await prisma.account.findUnique({
        where: { id: result.data.accountId },
      })
      if (!account) {
        return notFound('Account not found')
      }
    }

    const scenario = await prisma.scenario.create({
      data: {
        title: result.data.title,
        description: result.data.description,
        prompt: result.data.prompt,
        mode: result.data.mode,
        category: result.data.category,
        accountId: result.data.accountId!,
        isOneTime: result.data.isOneTime,
        relevantPolicySections: result.data.relevantPolicySections,
        createdBy: user.id,
      },
      include: {
        creator: { select: { displayName: true } },
        account: { select: { name: true } },
      },
    })

    return apiSuccess(scenario, 201)
  } catch (error) {
    return handleApiError(error)
  }
}
