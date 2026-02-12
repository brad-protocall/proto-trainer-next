import { NextRequest } from 'next/server'
import prisma from '@/lib/prisma'
import { apiSuccess, apiError, handleApiError, notFound } from '@/lib/api'
import { createScenarioSchema, createOneTimeScenarioWithAssignmentSchema, scenarioQuerySchema } from '@/lib/validators'
import { requireAuth, requireSupervisor } from '@/lib/auth'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

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

    // Helper to resolve accountId (provided or default)
    async function resolveAccountId(providedId: string | null | undefined) {
      if (providedId) {
        const account = await prisma.account.findUnique({ where: { id: providedId } })
        if (!account) return { accountId: null as string | null, error: notFound('Account not found') }
        return { accountId: providedId, error: null }
      }
      const defaultAccount = await prisma.account.findFirst()
      if (!defaultAccount) {
        return {
          accountId: null as string | null,
          error: apiError({ type: 'INTERNAL_ERROR', message: 'No accounts configured. Please create an account first.' }, 500),
        }
      }
      return { accountId: defaultAccount.id, error: null }
    }

    // Helper to save evaluator context file (after scenario creation)
    async function saveEvaluatorContext(scenarioId: string, evaluatorContext: string | undefined) {
      if (!evaluatorContext) return null
      const contextDir = path.join(process.cwd(), 'uploads', 'evaluator_context', scenarioId)
      await mkdir(contextDir, { recursive: true })
      const contextPath = path.join(contextDir, 'context.txt')
      await writeFile(contextPath, evaluatorContext, 'utf-8')
      return prisma.scenario.update({
        where: { id: scenarioId },
        data: { evaluatorContextPath: contextPath },
        include: { creator: { select: { displayName: true } }, account: { select: { name: true } } },
      })
    }

    // Try one-time-with-assignment schema first
    const oneTimeResult = createOneTimeScenarioWithAssignmentSchema.safeParse(body)
    if (oneTimeResult.success) {
      // Validate counselor exists and has correct role
      const counselor = await prisma.user.findUnique({
        where: { id: oneTimeResult.data.assignTo },
      })
      if (!counselor || counselor.role !== 'counselor') {
        return apiError({ type: 'VALIDATION_ERROR', message: 'Invalid learner selected' }, 400)
      }

      const { accountId, error: accountError } = await resolveAccountId(oneTimeResult.data.accountId)
      if (accountError) return accountError

      const result = await prisma.$transaction(async (tx) => {
        const scenario = await tx.scenario.create({
          data: {
            title: oneTimeResult.data.title,
            description: oneTimeResult.data.description,
            prompt: oneTimeResult.data.prompt,
            mode: oneTimeResult.data.mode,
            category: oneTimeResult.data.category || null,
            skills: oneTimeResult.data.skills || [],
            accountId: accountId!,
            isOneTime: true,
            relevantPolicySections: oneTimeResult.data.relevantPolicySections,
            createdBy: user.id,
          },
          include: { creator: { select: { displayName: true } }, account: { select: { name: true } } },
        })

        const assignment = await tx.assignment.create({
          data: {
            scenarioId: scenario.id,
            counselorId: oneTimeResult.data.assignTo,
            accountId: accountId!,
            assignedBy: user.id,
            status: 'pending',
          },
        })

        return { scenario, assignment }
      })

      // Save evaluator context outside transaction (file I/O)
      const updated = await saveEvaluatorContext(result.scenario.id, oneTimeResult.data.evaluatorContext)

      return apiSuccess({ ...(updated || result.scenario), assignmentId: result.assignment.id }, 201)
    }

    // Fall through to standard schema
    const result = createScenarioSchema.safeParse(body)

    if (!result.success) {
      return apiError(
        { type: 'VALIDATION_ERROR', message: 'Validation failed', details: result.error.flatten().fieldErrors as Record<string, unknown> },
        400
      )
    }

    const { accountId, error: accountError } = await resolveAccountId(result.data.accountId)
    if (accountError) return accountError

    const scenario = await prisma.scenario.create({
      data: {
        title: result.data.title,
        description: result.data.description,
        prompt: result.data.prompt,
        mode: result.data.mode,
        category: result.data.category || null,
        skills: result.data.skills || [],
        accountId: accountId!,
        isOneTime: result.data.isOneTime,
        relevantPolicySections: result.data.relevantPolicySections,
        createdBy: user.id,
      },
      include: {
        creator: { select: { displayName: true } },
        account: { select: { name: true } },
      },
    })

    const updated = await saveEvaluatorContext(scenario.id, result.data.evaluatorContext)

    return apiSuccess(updated || scenario, 201)
  } catch (error) {
    return handleApiError(error)
  }
}
