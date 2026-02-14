import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiSuccess, handleApiError, notFound, forbidden, badRequest } from '@/lib/api'
import { requireAuth, canAccessResource } from '@/lib/auth'
import { z } from 'zod'

interface RouteParams {
  params: Promise<{ id: string }>
}

const patchSessionSchema = z.object({
  incrementAttempt: z.boolean().optional(),
})

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
        evaluation: {
          select: {
            id: true,
            overallScore: true,
            feedbackJson: true,
            strengths: true,
            areasToImprove: true,
          },
        },
        scenario: {
          select: {
            id: true,
            title: true,
            description: true,
            mode: true,
            category: true,
          },
        },
        documentReview: {
          select: { id: true },
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
            learner: {
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

    // Check ownership - only the assigned learner/session owner or supervisors can view
    const ownerId = session.assignment?.learnerId ?? session.userId
    if (!ownerId || !canAccessResource(user, ownerId)) {
      return forbidden('Cannot view another user\'s session')
    }

    // Transform: replace documentReview object with boolean flag
    const { documentReview, ...sessionData } = session
    return apiSuccess({ ...sessionData, hasDocumentReview: !!documentReview })
  } catch (error) {
    return handleApiError(error)
  }
}

/**
 * PATCH /api/sessions/[id]
 * Update session properties (e.g., increment attempt number for retry)
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params

    const authResult = await requireAuth(request)
    if (authResult.error) return authResult.error
    const user = authResult.user

    const body = await request.json()
    const result = patchSessionSchema.safeParse(body)

    if (!result.success) {
      return badRequest('Invalid request body')
    }

    const session = await prisma.session.findUnique({
      where: { id },
      include: {
        assignment: true,
      },
    })

    if (!session) {
      return notFound('Session not found')
    }

    // Check ownership
    const ownerId = session.assignment?.learnerId ?? session.userId
    if (!ownerId || !canAccessResource(user, ownerId)) {
      return forbidden('Cannot modify another user\'s session')
    }

    // Handle incrementAttempt
    if (result.data.incrementAttempt) {
      const updated = await prisma.session.update({
        where: { id },
        data: {
          currentAttempt: { increment: 1 },
          status: 'active', // Reset to active for new attempt
        },
      })

      return apiSuccess({
        id: updated.id,
        currentAttempt: updated.currentAttempt,
        status: updated.status,
      })
    }

    return apiSuccess({ id: session.id })
  } catch (error) {
    return handleApiError(error)
  }
}
