import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiSuccess, handleApiError, notFound, conflict } from '@/lib/api'
import { requireInternalAuth } from '@/lib/auth'
import { z } from 'zod'

const createVoiceSessionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('assignment'),
    assignmentId: z.string().uuid(),
    userId: z.string().uuid(),
  }),
  z.object({
    type: z.literal('free_practice'),
    userId: z.string().uuid(),
    scenarioId: z.string().uuid().optional(),
  }),
])

/**
 * POST /api/internal/sessions
 *
 * Create a voice training session. Called by the LiveKit agent.
 * Authenticates via X-Internal-Service-Key header.
 *
 * Unlike POST /api/sessions (text chat), this does NOT:
 * - Generate an initial text greeting
 * - Create an initial transcript turn
 *
 * For assignments with existing sessions (retries), increments currentAttempt.
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = requireInternalAuth(request)
    if (authResult.error) return authResult.error

    const body = await request.json()
    const data = createVoiceSessionSchema.parse(body)

    if (data.type === 'assignment') {
      return handleAssignmentSession(data.assignmentId, data.userId)
    } else {
      return handleFreePracticeSession(data.userId, data.scenarioId)
    }
  } catch (error) {
    return handleApiError(error)
  }
}

async function handleAssignmentSession(assignmentId: string, userId: string) {
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: {
      scenario: { select: { mode: true } },
      session: true,
    },
  })

  if (!assignment) {
    return notFound('Assignment not found')
  }

  // Verify the user owns this assignment (defense-in-depth)
  if (assignment.learnerId !== userId) {
    return conflict('User does not own this assignment')
  }

  // If session already exists, increment attempt and return existing session ID
  if (assignment.session) {
    const updated = await prisma.session.update({
      where: { id: assignment.session.id },
      data: {
        currentAttempt: { increment: 1 },
        status: 'active',
      },
    })

    return apiSuccess({
      sessionId: updated.id,
      currentAttempt: updated.currentAttempt,
      isRetry: true,
    })
  }

  if (assignment.status === 'completed') {
    return conflict('Cannot create session for completed assignment')
  }

  // Create new session and update assignment status in a transaction
  const session = await prisma.$transaction(async (tx) => {
    const newSession = await tx.session.create({
      data: {
        assignmentId,
        userId,
        scenarioId: assignment.scenarioId,
        modelType: assignment.scenario.mode,
        status: 'active',
      },
    })

    await tx.assignment.update({
      where: { id: assignmentId },
      data: {
        status: 'in_progress',
        startedAt: new Date(),
      },
    })

    return newSession
  })

  return apiSuccess({
    sessionId: session.id,
    currentAttempt: 1,
    isRetry: false,
  }, 201)
}

async function handleFreePracticeSession(userId: string, scenarioId?: string) {
  // Verify scenario exists if provided
  if (scenarioId) {
    const scenario = await prisma.scenario.findUnique({
      where: { id: scenarioId },
      select: { id: true },
    })
    if (!scenario) {
      return notFound('Scenario not found')
    }
  }

  const session = await prisma.session.create({
    data: {
      userId,
      scenarioId,
      modelType: 'phone',
      status: 'active',
    },
  })

  return apiSuccess({
    sessionId: session.id,
    currentAttempt: 1,
    isRetry: false,
  }, 201)
}
