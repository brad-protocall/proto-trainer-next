import { NextRequest } from 'next/server'
import prisma from '@/lib/prisma'
import { apiSuccess, apiError, handleApiError, notFound } from '@/lib/api'
import { createScenarioSchema, scenarioQuerySchema } from '@/lib/validators'
import { requireAuth, requireSupervisor } from '@/lib/auth'

/**
 * GET /api/scenarios
 * List scenarios - any authenticated user
 * By default, excludes one-time scenarios unless ?isOneTime=true is specified
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    if (authResult.error) return authResult.error

    const searchParams = Object.fromEntries(request.nextUrl.searchParams)
    const queryResult = scenarioQuerySchema.safeParse(searchParams)

    // Build where clause
    const where: Record<string, unknown> = {}

    if (queryResult.success) {
      if (queryResult.data.category) {
        where.category = queryResult.data.category
      }
      if (queryResult.data.mode) {
        where.mode = queryResult.data.mode
      }
      // Handle isOneTime filter
      if (queryResult.data.isOneTime !== undefined) {
        where.isOneTime = queryResult.data.isOneTime === 'true'
      } else {
        // Default: exclude one-time scenarios from list
        where.isOneTime = false
      }
    } else {
      // Default: exclude one-time scenarios from list
      where.isOneTime = false
    }

    // Pagination with defaults
    const limit = queryResult.success ? queryResult.data.limit ?? 100 : 100
    const offset = queryResult.success ? queryResult.data.offset ?? 0 : 0

    const scenarios = await prisma.scenario.findMany({
      where,
      include: {
        creator: { select: { displayName: true } },
        account: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
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
        { type: 'VALIDATION_ERROR', message: 'Validation failed', details: result.error.flatten().fieldErrors as Record<string, unknown> },
        400
      )
    }

    // Determine accountId - use provided, or fall back to first account
    let accountId = result.data.accountId
    if (accountId) {
      const account = await prisma.account.findUnique({
        where: { id: accountId },
      })
      if (!account) {
        return notFound('Account not found')
      }
    } else {
      // Get default account (first one) - accountId is required in schema
      const defaultAccount = await prisma.account.findFirst()
      if (!defaultAccount) {
        return apiError(
          { type: 'INTERNAL_ERROR', message: 'No accounts configured. Please create an account first.' },
          500
        )
      }
      accountId = defaultAccount.id
    }

    const scenario = await prisma.scenario.create({
      data: {
        title: result.data.title,
        description: result.data.description,
        prompt: result.data.prompt,
        mode: result.data.mode,
        category: result.data.category || null,
        skills: result.data.skills || [],
        accountId,
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
