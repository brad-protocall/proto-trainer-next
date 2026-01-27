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
      },
    })

    if (!evaluation) {
      return notFound('Evaluation not found')
    }

    // Check authorization - only the counselor or supervisors can view
    if (!canAccessResource(user, evaluation.assignment.counselorId)) {
      return forbidden('Access denied')
    }

    return apiSuccess({
      id: evaluation.id,
      assignmentId: evaluation.assignmentId,
      overallScore: evaluation.overallScore,
      feedbackJson: evaluation.feedbackJson,
      strengths: evaluation.strengths,
      areasToImprove: evaluation.areasToImprove,
      rawResponse: evaluation.rawResponse,
      createdAt: evaluation.createdAt.toISOString(),
      scenario: evaluation.assignment.scenario,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
