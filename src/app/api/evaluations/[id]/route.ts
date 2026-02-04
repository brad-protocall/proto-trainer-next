import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiSuccess, handleApiError, notFound, forbidden } from '@/lib/api'
import { requireAuth, canAccessResource } from '@/lib/auth'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/evaluations/[id]
 * Get an evaluation by ID
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params

    const authResult = await requireAuth(request)
    if (authResult.error) return authResult.error
    const user = authResult.user

    const evaluation = await prisma.evaluation.findUnique({
      where: { id },
      include: {
        assignment: {
          select: {
            id: true,
            counselorId: true,
            scenario: {
              select: {
                id: true,
                title: true,
              },
            },
          },
        },
        session: {
          select: {
            id: true,
            userId: true,
            scenario: {
              select: {
                id: true,
                title: true,
              },
            },
          },
        },
      },
    })

    if (!evaluation) {
      return notFound('Evaluation not found')
    }

    // Check authorization - only the counselor/session owner or supervisors can view
    const ownerId = evaluation.assignment?.counselorId ?? evaluation.session?.userId
    if (!ownerId || !canAccessResource(user, ownerId)) {
      return forbidden('Access denied')
    }

    // Get scenario from assignment or session
    const scenario = evaluation.assignment?.scenario ?? evaluation.session?.scenario ?? null

    return apiSuccess({
      id: evaluation.id,
      assignmentId: evaluation.assignmentId,
      sessionId: evaluation.sessionId,
      overallScore: evaluation.overallScore,
      feedbackJson: evaluation.feedbackJson,
      strengths: evaluation.strengths,
      areasToImprove: evaluation.areasToImprove,
      rawResponse: evaluation.rawResponse,
      createdAt: evaluation.createdAt.toISOString(),
      scenario,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
