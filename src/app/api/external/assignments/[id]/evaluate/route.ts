import { NextRequest } from 'next/server'
import prisma from '@/lib/prisma'
import { apiSuccess, handleApiError, notFound, conflict, invalidId } from '@/lib/api'
import { generateEvaluation } from '@/lib/openai'
import { requireExternalApiKey } from '@/lib/external-auth'
import type { TranscriptTurn } from '@/types'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/external/assignments/{id}/evaluate
 * Trigger evaluation for an assignment (agent-native endpoint)
 *
 * Finds the session associated with the assignment and generates an evaluation.
 * Returns the evaluation result with score, grade, and feedback.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const authError = requireExternalApiKey(request)
  if (authError) return authError

  try {
    const { id: assignmentId } = await params
    const idError = invalidId(assignmentId)
    if (idError) return idError

    // Get assignment with session and scenario info
    const assignment = await prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: {
        session: true,
        scenario: {
          include: {
            account: true,
          },
        },
        evaluation: true,
        learner: {
          select: {
            externalId: true,
          },
        },
      },
    })

    if (!assignment) {
      return notFound('Assignment not found')
    }

    // Check if evaluation already exists
    if (assignment.evaluation) {
      return conflict('Evaluation already exists for this assignment')
    }

    // Check if there's a session
    if (!assignment.session) {
      return conflict('No session found for this assignment - training not started')
    }

    const session = assignment.session

    // Get transcript for the latest attempt
    const latestTranscript = await prisma.transcriptTurn.findMany({
      where: {
        sessionId: session.id,
        attemptNumber: session.currentAttempt,
      },
      orderBy: { turnOrder: 'asc' },
    })

    // Check if there's enough transcript to evaluate
    if (latestTranscript.length < 2) {
      return conflict('Not enough conversation to evaluate')
    }

    // Convert transcript to TranscriptTurn format
    const transcriptForEval: TranscriptTurn[] = latestTranscript.map((turn) => ({
      id: turn.id,
      sessionId: session.id,
      role: turn.role as TranscriptTurn['role'],
      content: turn.content,
      turnOrder: turn.turnOrder,
      createdAt: turn.createdAt.toISOString(),
    }))

    // Get scenario info
    const scenario = assignment.scenario
    const scenarioTitle = scenario.title
    const scenarioDescription = scenario.description
    const scenarioEvaluatorContext = scenario.evaluatorContextPath ?? null
    const vectorStoreId = scenario.account?.vectorStoreId ?? undefined

    // Generate evaluation using OpenAI
    const evaluationResult = await generateEvaluation({
      scenarioTitle,
      scenarioDescription,
      scenarioEvaluatorContext,
      transcript: transcriptForEval,
      vectorStoreId,
    })

    // Save evaluation and update session/assignment in a transaction
    const [evaluation] = await prisma.$transaction([
      // Create evaluation
      prisma.evaluation.create({
        data: {
          assignmentId,
          overallScore: evaluationResult.numericScore,
          feedbackJson: evaluationResult.evaluation,
          strengths: evaluationResult.grade ?? '',
          areasToImprove: '',
          rawResponse: evaluationResult.evaluation,
        },
      }),
      // Update session status
      prisma.session.update({
        where: { id: session.id },
        data: {
          status: 'completed',
          endedAt: new Date(),
        },
      }),
      // Update assignment status
      prisma.assignment.update({
        where: { id: assignmentId },
        data: {
          status: 'completed',
          completedAt: new Date(),
        },
      }),
    ])

    return apiSuccess({
      assignmentId,
      learnerId: assignment.learner.externalId,
      evaluation: {
        id: evaluation.id,
        score: evaluationResult.numericScore,
        grade: evaluationResult.grade,
        feedback: evaluationResult.evaluation,
      },
      session: {
        id: session.id,
        status: 'completed',
        endedAt: new Date().toISOString(),
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
