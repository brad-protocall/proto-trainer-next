import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiSuccess, handleApiError, notFound, invalidId } from '@/lib/api'
import { requireInternalAuth } from '@/lib/auth'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/internal/scenarios/[id]
 *
 * Return scenario prompt for the LiveKit agent.
 * Authenticates via X-Internal-Service-Key header.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const idError = invalidId(id)
    if (idError) return idError

    const authResult = requireInternalAuth(request)
    if (authResult.error) return authResult.error

    const scenario = await prisma.scenario.findUnique({
      where: { id },
      select: { id: true, prompt: true, title: true, mode: true },
    })

    if (!scenario) {
      return notFound('Scenario not found')
    }

    return apiSuccess(scenario)
  } catch (error) {
    return handleApiError(error)
  }
}
