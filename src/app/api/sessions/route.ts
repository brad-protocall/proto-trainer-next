import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiSuccess, handleApiError, notFound, conflict, forbidden } from '@/lib/api'
import { createSessionSchema } from '@/lib/validators'
import { generateInitialGreeting, getDefaultChextPrompt } from '@/lib/openai'
import { requireAuth, canAccessResource } from '@/lib/auth'
import type { User } from '@prisma/client'

/**
 * POST /api/sessions
 * Create a new chat session for an assignment or free practice
 *
 * For assignment-based sessions:
 *   { type: 'assignment', assignmentId: string }
 *
 * For free practice sessions:
 *   { type: 'free_practice', userId: string, modelType: 'phone' | 'chat', scenarioId?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    if (authResult.error) return authResult.error
    const user = authResult.user

    const body = await request.json()
    const data = createSessionSchema.parse(body)

    if (data.type === 'assignment') {
      return handleAssignmentSession(data.assignmentId, user)
    } else {
      return handleFreePracticeSession(data, user)
    }
  } catch (error) {
    return handleApiError(error)
  }
}

/**
 * Handle assignment-based session creation
 */
async function handleAssignmentSession(
  assignmentId: string,
  user: User
) {
  // Check if assignment exists and is in a valid state
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: {
      scenario: true,
      session: true,
    },
  })

  if (!assignment) {
    return notFound('Assignment not found')
  }

  // Check ownership - only the assigned counselor can create a session
  if (!canAccessResource(user, assignment.counselorId)) {
    return forbidden('Cannot create session for another user\'s assignment')
  }

  // Check if a session already exists for this assignment
  if (assignment.session) {
    return conflict('A session already exists for this assignment')
  }

  // Check assignment status
  if (assignment.status === 'completed') {
    return conflict('Cannot create session for completed assignment')
  }

  // Generate initial greeting from AI
  const initialGreeting = await generateInitialGreeting(assignment.scenario.prompt)

  // Create session and initial transcript turn in a transaction
  const session = await prisma.$transaction(async (tx) => {
    // Create the session
    const newSession = await tx.session.create({
      data: {
        assignmentId,
        modelType: assignment.scenario.mode,
        status: 'active',
      },
    })

    // Create the initial AI greeting turn
    await tx.transcriptTurn.create({
      data: {
        sessionId: newSession.id,
        role: 'assistant',
        content: initialGreeting,
        turnOrder: 1,
      },
    })

    // Update assignment status to in_progress
    await tx.assignment.update({
      where: { id: assignmentId },
      data: {
        status: 'in_progress',
        startedAt: new Date(),
      },
    })

    // Return session with transcript
    return tx.session.findUnique({
      where: { id: newSession.id },
      include: {
        transcript: {
          orderBy: { turnOrder: 'asc' },
        },
      },
    })
  })

  return apiSuccess(session, 201)
}

/**
 * Handle free practice session creation
 */
async function handleFreePracticeSession(
  data: { type: 'free_practice'; userId: string; modelType: 'phone' | 'chat'; scenarioId?: string },
  user: User
) {
  // Verify the userId matches the authenticated user
  if (!canAccessResource(user, data.userId)) {
    return forbidden('Cannot create session for another user')
  }

  // If scenarioId provided, verify it exists
  let scenarioPrompt: string | null = null
  if (data.scenarioId) {
    const scenario = await prisma.scenario.findUnique({
      where: { id: data.scenarioId },
      select: { prompt: true },
    })
    if (!scenario) {
      return notFound('Scenario not found')
    }
    scenarioPrompt = scenario.prompt
  }

  // Generate initial greeting - use scenario prompt if provided, otherwise default chext prompt
  const initialGreeting = await generateInitialGreeting(scenarioPrompt ?? getDefaultChextPrompt())

  // Create session and initial transcript turn in a transaction
  const session = await prisma.$transaction(async (tx) => {
    // Create the session
    const newSession = await tx.session.create({
      data: {
        userId: data.userId,
        scenarioId: data.scenarioId,
        modelType: data.modelType,
        status: 'active',
      },
    })

    // Create the initial AI greeting turn
    await tx.transcriptTurn.create({
      data: {
        sessionId: newSession.id,
        role: 'assistant',
        content: initialGreeting,
        turnOrder: 1,
      },
    })

    // Return session with transcript
    return tx.session.findUnique({
      where: { id: newSession.id },
      include: {
        transcript: {
          orderBy: { turnOrder: 'asc' },
        },
      },
    })
  })

  return apiSuccess(session, 201)
}
