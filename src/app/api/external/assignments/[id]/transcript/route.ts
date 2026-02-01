import { NextRequest } from 'next/server'
import prisma from '@/lib/prisma'
import { apiSuccess, apiError, handleApiError, notFound, conflict } from '@/lib/api'
import { requireExternalApiKey } from '@/lib/external-auth'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/external/assignments/{id}/transcript
 * Get transcript for an assignment (agent-native endpoint)
 *
 * Returns all transcript turns for the assignment's session.
 * Supports optional query params:
 *   ?attempt=N - Get specific attempt (default: latest)
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const authError = requireExternalApiKey(request)
  if (authError) return authError

  try {
    const { id: assignmentId } = await params
    const { searchParams } = new URL(request.url)
    const attemptParam = searchParams.get('attempt')

    // Get assignment with session
    const assignment = await prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: {
        session: true,
        counselor: {
          select: {
            externalId: true,
          },
        },
        scenario: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    })

    if (!assignment) {
      return notFound('Assignment not found')
    }

    if (!assignment.session) {
      return conflict('No session found for this assignment - training not started')
    }

    const session = assignment.session

    // Determine which attempt to fetch
    const attemptNumber = attemptParam
      ? parseInt(attemptParam, 10)
      : session.currentAttempt

    if (isNaN(attemptNumber) || attemptNumber < 1) {
      return apiError({ type: 'VALIDATION_ERROR', message: 'Invalid attempt number' }, 400)
    }

    // Get transcript turns for the specified attempt
    const transcript = await prisma.transcriptTurn.findMany({
      where: {
        sessionId: session.id,
        attemptNumber,
      },
      orderBy: { turnOrder: 'asc' },
    })

    return apiSuccess({
      assignmentId,
      sessionId: session.id,
      counselorId: assignment.counselor.externalId,
      scenarioId: assignment.scenario.id,
      scenarioTitle: assignment.scenario.title,
      attemptNumber,
      totalAttempts: session.currentAttempt,
      turns: transcript.map((turn) => ({
        id: turn.id,
        role: turn.role,
        content: turn.content,
        turnOrder: turn.turnOrder,
        createdAt: turn.createdAt.toISOString(),
      })),
    })
  } catch (error) {
    return handleApiError(error)
  }
}
