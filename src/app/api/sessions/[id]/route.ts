import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiSuccess, handleApiError, notFound, forbidden } from '@/lib/api'
import { requireAuth, canAccessResource } from '@/lib/auth'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/sessions/[id]
 * Get a session with its full transcript
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params

    const authResult = await requireAuth(request)
    if (authResult.error) return authResult.error
    const user = authResult.user

    const session = await prisma.session.findUnique({
      where: { id },
      include: {
        transcript: {
          orderBy: { turnOrder: 'asc' },
        },
        assignment: {
          include: {
            scenario: {
              select: {
                id: true,
                title: true,
                description: true,
                mode: true,
                category: true,
              },
            },
            counselor: {
              select: {
                id: true,
                displayName: true,
              },
            },
            evaluation: {
              select: {
                id: true,
                overallScore: true,
                strengths: true,
                areasToImprove: true,
              },
            },
          },
        },
      },
    })

    if (!session) {
      return notFound('Session not found')
    }

    // Check ownership - only the assigned counselor/session owner or supervisors can view
    const ownerId = session.assignment?.counselorId ?? session.userId
    if (!ownerId || !canAccessResource(user, ownerId)) {
      return forbidden('Cannot view another user\'s session')
    }

    return apiSuccess(session)
  } catch (error) {
    return handleApiError(error)
  }
}
