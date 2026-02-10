import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { apiSuccess, apiError, handleApiError, notFound, conflict, forbidden } from '@/lib/api'
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

    // Get session with scenario info first
    const session = await prisma.session.findUnique({
      where: { id },
      include: {
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
        scenario: {
          include: {
            account: true,
          },
        },
        evaluation: true,
      },
    })

    if (!session) {
      return notFound('Session not found')
    }

    // For assignment-based sessions, check ownership via assignment
    // For free practice sessions, check via userId
    const ownerId = session.assignment?.counselorId ?? session.userId
    if (!ownerId) {
      return notFound('Session not found')
    }
    if (!canAccessResource(user, ownerId)) {
      return forbidden('Cannot evaluate another user\'s session')
    }

    // Check if evaluation already exists (assignment-based or session-based)
    if (session.assignment?.evaluation || session.evaluation) {
      return conflict('Evaluation already exists for this session')
    }

    // Get transcript for the latest attempt only
    const latestTranscript = await prisma.transcriptTurn.findMany({
      where: {
        sessionId: id,
        attemptNumber: session.currentAttempt,
      },
      orderBy: { turnOrder: 'asc' },
    })

    // Check if there's enough transcript to evaluate.
    // Returns 425 (Too Early) so the client can distinguish this from a true 409 conflict.
    if (latestTranscript.length < 2) {
      return apiError({ type: 'TOO_EARLY', message: 'Transcripts not yet available' }, 425)
    }

    // Convert transcript to TranscriptTurn format (using latest attempt only)
    const transcriptForEval: TranscriptTurn[] = latestTranscript.map((turn) => ({
      id: turn.id,
      sessionId: session.id,
      role: turn.role as TranscriptTurn['role'],
      content: turn.content,
      turnOrder: turn.turnOrder,
      createdAt: turn.createdAt.toISOString(),
    }))

    // Get scenario info - either from assignment or directly from session
    const scenario = session.assignment?.scenario ?? session.scenario
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

    // Save evaluation and update session/assignment in a single transaction.
    // Uses P2002 (unique constraint violation) catch for idempotency under concurrency.
    // Timestamp captured AFTER LLM call so endedAt reflects actual completion time.
    const now = new Date()
    try {
      const evaluation = await prisma.$transaction(async (tx) => {
        const eval_ = await tx.evaluation.create({
          data: {
            ...(session.assignmentId
              ? { assignmentId: session.assignmentId }
              : { sessionId: id }),
            overallScore: evaluationResult.numericScore,
            feedbackJson: evaluationResult.evaluation,
            strengths: evaluationResult.grade ?? '',
            areasToImprove: '',
            rawResponse: evaluationResult.evaluation,
          },
        })

        await tx.session.update({
          where: { id },
          data: { status: 'completed', endedAt: now },
        })

        if (session.assignmentId) {
          await tx.assignment.update({
            where: { id: session.assignmentId },
            data: { status: 'completed', completedAt: now },
          })
        }

        // Save any flags detected during evaluation (same transaction = atomic)
        if (evaluationResult.flags.length > 0) {
          await tx.sessionFlag.createMany({
            data: evaluationResult.flags.map(flag => ({
              sessionId: id,
              type: flag.category,
              severity: flag.severity,
              details: flag.description,
            })),
          })
        }

        return eval_
      })

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
          endedAt: now.toISOString(),
        },
      })
    } catch (error) {
      // P2002: Unique constraint violation — concurrent request already created the evaluation.
      // Transaction rolled back; the other request's commit left the session in "completed" state.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = session.assignmentId
          ? await prisma.evaluation.findUnique({ where: { assignmentId: session.assignmentId } })
          : await prisma.evaluation.findUnique({ where: { sessionId: id } })
        if (existing) {
          return apiSuccess({
            evaluation: {
              id: existing.id,
              evaluation: existing.feedbackJson,
              grade: existing.strengths,
              numericScore: existing.overallScore,
            },
            session: {
              id: session.id,
              status: 'completed',
              endedAt: now.toISOString(),
            },
          })
        }
      }
      throw error
    }
  } catch (error) {
    return handleApiError(error)
  }
}
