import { NextRequest } from 'next/server'
import { timingSafeEqual, createHash } from 'crypto'
import prisma from '@/lib/prisma'
import { apiSuccess, apiError, handleApiError, notFound, conflict } from '@/lib/api'

/**
 * Timing-safe API key comparison.
 * Uses SHA-256 hashing to ensure constant-time comparison regardless of key lengths.
 */
function validateApiKey(request: NextRequest): boolean {
  const apiKey = request.headers.get('X-API-Key')
  const expectedKey = process.env.EXTERNAL_API_KEY

  if (!apiKey || !expectedKey) {
    return false
  }

  // Hash both keys to ensure constant-length comparison (prevents length oracle)
  const providedHash = createHash('sha256').update(apiKey).digest()
  const expectedHash = createHash('sha256').update(expectedKey).digest()

  return timingSafeEqual(providedHash, expectedHash)
}

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
  if (!validateApiKey(request)) {
    return apiError({ type: 'UNAUTHORIZED', message: 'Invalid or missing API key' }, 401)
  }

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
      return notFound(`Assignment '${assignmentId}' not found`)
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
