import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiSuccess, handleApiError, notFound, conflict, forbidden } from '@/lib/api'
import { generateEvaluation } from '@/lib/openai'
import { requireAuth, canAccessResource } from '@/lib/auth'
import type { TranscriptTurn } from '@/types'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/sessions/[id]/evaluate
 * Generate evaluation using OpenAI with transcript
 * Save evaluation to database and update assignment status to completed
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params

    const authResult = await requireAuth(request)
    if (authResult.error) return authResult.error
    const user = authResult.user

    // Get session with transcript and scenario
    const session = await prisma.session.findUnique({
      where: { id },
      include: {
        transcript: {
          orderBy: { turnOrder: 'asc' },
        },
        assignment: {
          include: {
            scenario: {
              include: {
                account: true,
              },
            },
            evaluation: true,
          },
        },
      },
    })

    if (!session) {
      return notFound('Session not found')
    }

    // For assignment-based sessions, check ownership via assignment
    // For free practice sessions, check via userId
    const ownerId = session.assignment?.counselorId ?? session.userId
    if (!ownerId || !canAccessResource(user, ownerId)) {
      return forbidden('Cannot evaluate another user\'s session')
    }

    // Check if evaluation already exists (only for assignment-based sessions)
    if (session.assignment?.evaluation) {
      return conflict('Evaluation already exists for this assignment')
    }

    // Check if there's enough transcript to evaluate
    if (session.transcript.length < 2) {
      return conflict('Not enough conversation to evaluate')
    }

    // Convert transcript to TranscriptTurn format
    const transcriptForEval: TranscriptTurn[] = session.transcript.map((turn) => ({
      id: turn.id,
      session_id: session.id,
      role: turn.role as TranscriptTurn['role'],
      content: turn.content,
      turn_index: turn.turnOrder,
      created_at: turn.createdAt.toISOString(),
    }))

    // Get scenario info - either from assignment or directly from session
    const scenario = session.assignment?.scenario
    const scenarioTitle = scenario?.title ?? 'Free Practice Session'
    const scenarioDescription = scenario?.description ?? null
    const scenarioEvaluatorContext = scenario?.evaluatorContextPath ?? null // TODO: Load from file if needed
    const vectorStoreId = scenario?.account?.vectorStoreId ?? undefined

    // Generate evaluation using OpenAI
    const evaluationResult = await generateEvaluation({
      scenarioTitle,
      scenarioDescription,
      scenarioEvaluatorContext,
      transcript: transcriptForEval,
      vectorStoreId,
    })

    // Save evaluation and update session/assignment in a transaction
    // For free practice sessions (no assignmentId), we only update the session
    if (session.assignmentId) {
      const [evaluation] = await prisma.$transaction([
        // Create evaluation - store full markdown in feedbackJson
        prisma.evaluation.create({
          data: {
            assignmentId: session.assignmentId,
            overallScore: evaluationResult.numericScore,
            feedbackJson: evaluationResult.evaluation,
            strengths: evaluationResult.grade ?? '',
            areasToImprove: '',
            rawResponse: evaluationResult.evaluation,
          },
        }),
        // Update session status
        prisma.session.update({
          where: { id },
          data: {
            status: 'completed',
            endedAt: new Date(),
          },
        }),
        // Update assignment status
        prisma.assignment.update({
          where: { id: session.assignmentId },
          data: {
            status: 'completed',
            completedAt: new Date(),
          },
        }),
      ])

      return apiSuccess({
        evaluation: {
          id: evaluation.id,
          evaluation: evaluationResult.evaluation,
          grade: evaluationResult.grade,
          numericScore: evaluationResult.numericScore,
        },
        session: {
          id: session.id,
          status: 'completed',
          endedAt: new Date(),
        },
      })
    }

    // Free practice session - just update session status, return evaluation result without saving
    await prisma.session.update({
      where: { id },
      data: {
        status: 'completed',
        endedAt: new Date(),
      },
    })

    return apiSuccess({
      evaluation: {
        evaluation: evaluationResult.evaluation,
        grade: evaluationResult.grade,
        numericScore: evaluationResult.numericScore,
      },
      session: {
        id: session.id,
        status: 'completed',
        endedAt: new Date(),
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
