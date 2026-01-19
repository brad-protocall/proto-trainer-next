import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiSuccess, handleApiError, notFoundError, validationError } from '@/lib/api'
import { updateScenarioSchema } from '@/lib/validators'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/scenarios/[id]
 *
 * Get a single scenario by ID with creator and account info.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params

    const scenario = await prisma.scenario.findUnique({
      where: { id },
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

    if (!scenario) {
      return notFoundError('Scenario not found', 'scenario')
    }

    return apiSuccess(scenario)
  } catch (error) {
    return handleApiError(error)
  }
}

/**
 * PUT /api/scenarios/[id]
 *
 * Update a scenario.
 * Body (all optional):
 *   - title: string
 *   - description: string
 *   - prompt: string
 *   - mode: 'phone' | 'chat'
 *   - category: 'onboarding' | 'refresher' | 'advanced' | 'assessment'
 *   - accountId: uuid
 *   - isOneTime: boolean
 *   - relevantPolicySections: string
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params

    // Check if scenario exists
    const existing = await prisma.scenario.findUnique({
      where: { id },
    })

    if (!existing) {
      return notFoundError('Scenario not found', 'scenario')
    }

    const body = await request.json().catch(() => null)

    if (!body) {
      return validationError('Invalid JSON body')
    }

    const result = updateScenarioSchema.safeParse(body)

    if (!result.success) {
      return validationError('Validation failed', result.error.flatten().fieldErrors as Record<string, string[]>)
    }

    const scenario = await prisma.scenario.update({
      where: { id },
      data: {
        ...(result.data.title !== undefined && { title: result.data.title }),
        ...(result.data.description !== undefined && { description: result.data.description }),
        ...(result.data.prompt !== undefined && { prompt: result.data.prompt }),
        ...(result.data.mode !== undefined && { mode: result.data.mode }),
        ...(result.data.category !== undefined && { category: result.data.category }),
        ...(result.data.accountId !== undefined && { accountId: result.data.accountId }),
        ...(result.data.isOneTime !== undefined && { isOneTime: result.data.isOneTime }),
        ...(result.data.relevantPolicySections !== undefined && { relevantPolicySections: result.data.relevantPolicySections }),
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

/**
 * DELETE /api/scenarios/[id]
 *
 * Delete a scenario.
 * Returns the deleted scenario.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params

    // Check if scenario exists
    const existing = await prisma.scenario.findUnique({
      where: { id },
    })

    if (!existing) {
      return notFoundError('Scenario not found', 'scenario')
    }

    // Delete the scenario
    const scenario = await prisma.scenario.delete({
      where: { id },
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
