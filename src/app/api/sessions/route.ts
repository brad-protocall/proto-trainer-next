import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { apiSuccess, apiError, handleApiError, notFound, conflict, forbidden } from '@/lib/api'
import { createSessionSchema, sessionQuerySchema } from '@/lib/validators'
import { generateInitialGreeting } from '@/lib/openai'
import { requireAuth, canAccessResource } from '@/lib/auth'
import type { User } from '@prisma/client'

/**
 * GET /api/sessions
 * List sessions for a user, defaults to completed free practice sessions
 *
 * Query params:
 *   userId - optional for supervisors, forced to own ID for counselors
 *   status - optional, defaults to 'completed'
 *   type   - 'free_practice' (default) | 'assigned' | 'all'
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    if (authResult.error) return authResult.error
    const user = authResult.user

    const searchParams = Object.fromEntries(request.nextUrl.searchParams)
    const queryResult = sessionQuerySchema.safeParse(searchParams)

    if (!queryResult.success) {
      return apiError(
        { type: 'VALIDATION_ERROR', message: 'Validation failed', details: queryResult.error.flatten().fieldErrors as Record<string, unknown> },
        400
      )
    }

    const { userId, status, type } = queryResult.data

    // Determine target user: counselors are auto-scoped to own sessions
    const targetUserId = user.role === 'counselor' ? user.id : (userId ?? user.id)

    // Build where clause with proper Prisma typing
    const where: Prisma.SessionWhereInput = {
      status: status ?? 'completed',
    }

    // Filter by session type (ownership path)
    if (type === 'assigned') {
      where.assignment = { counselorId: targetUserId }
    } else if (type === 'all') {
      where.OR = [
        { userId: targetUserId },
        { assignment: { counselorId: targetUserId } },
      ]
    } else {
      // Default: free_practice — sessions owned directly by user with no assignment
      where.userId = targetUserId
      where.assignmentId = null
    }

    const sessions = await prisma.session.findMany({
      where,
      include: {
        scenario: {
          select: { id: true, title: true, mode: true, category: true },
        },
        evaluation: {
          select: { id: true, overallScore: true },
        },
        _count: { select: { transcript: true } },
      },
      orderBy: { startedAt: 'desc' },
      take: 50,
    })

    const response = sessions.map(session => ({
      id: session.id,
      assignmentId: session.assignmentId,
      userId: session.userId,
      modelType: session.modelType,
      status: session.status,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      turnCount: session._count.transcript,
      scenario: session.scenario ?? null,
      evaluation: session.evaluation
        ? {
            id: session.evaluation.id,
            overallScore: session.evaluation.overallScore,
          }
        : null,
    }))

    return apiSuccess(response)
  } catch (error) {
    return handleApiError(error)
  }
}

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
 *
 * Phone: No initial greeting - voice AI handles the conversation flow
 * Chat without scenario: Ask what they want to practice (no Pre-Chat Survey yet)
 * Chat with scenario: Generate initial greeting from scenario prompt
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

  // Create session (and optionally initial transcript) in a transaction
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

    // Only create initial transcript turn for CHAT sessions
    // Phone sessions: Voice AI handles conversation flow (no pre-seeded transcript)
    if (data.modelType === 'chat') {
      let initialGreeting: string

      if (scenarioPrompt) {
        // Scenario provided: Generate visitor greeting from scenario
        initialGreeting = await generateInitialGreeting(scenarioPrompt)
      } else {
        // No scenario: Ask what they want to practice (no Pre-Chat Survey yet)
        initialGreeting = "What would you like to practice today? Give me a brief situation and I'll play the visitor."
      }

      await tx.transcriptTurn.create({
        data: {
          sessionId: newSession.id,
          role: 'assistant',
          content: initialGreeting,
          turnOrder: 1,
        },
      })
    }

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
