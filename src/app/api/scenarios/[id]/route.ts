import { NextRequest } from 'next/server'
import prisma from '@/lib/prisma'
import { apiSuccess, apiError, handleApiError, notFound } from '@/lib/api'
import { updateScenarioSchema } from '@/lib/validators'
import { requireAuth, requireSupervisor } from '@/lib/auth'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/scenarios/[id]
 * Get a specific scenario - any authenticated user
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params

    const authResult = await requireAuth(request)
    if (authResult.error) return authResult.error

    const scenario = await prisma.scenario.findUnique({
      where: { id },
      include: {
        creator: { select: { displayName: true } },
        account: { select: { name: true } },
      },
    })

    if (!scenario) {
      return notFound('Scenario not found')
    }

    return apiSuccess(scenario)
  } catch (error) {
    return handleApiError(error)
  }
}

/**
 * PUT /api/scenarios/[id]
 * Update a scenario - supervisor only
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params

    const authResult = await requireSupervisor(request)
    if (authResult.error) return authResult.error

    const existingScenario = await prisma.scenario.findUnique({
      where: { id },
    })

    if (!existingScenario) {
      return notFound('Scenario not found')
    }

    const body = await request.json()
    const result = updateScenarioSchema.safeParse(body)

    if (!result.success) {
      return apiError(
        { type: 'VALIDATION_ERROR', message: 'Validation failed', details: result.error.flatten().fieldErrors as Record<string, unknown> },
        400
      )
    }

    const scenario = await prisma.scenario.update({
      where: { id },
      data: result.data,
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

/**
 * DELETE /api/scenarios/[id]
 * Delete a scenario - supervisor only
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params

    const authResult = await requireSupervisor(request)
    if (authResult.error) return authResult.error

    const scenario = await prisma.scenario.findUnique({
      where: { id },
    })

    if (!scenario) {
      return notFound('Scenario not found')
    }

    await prisma.scenario.delete({
      where: { id },
    })

    return new Response(null, { status: 204 })
  } catch (error) {
    return handleApiError(error)
  }
}
