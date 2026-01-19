import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiSuccess, handleApiError, notFound, conflict } from '@/lib/api';
import { generateEvaluation } from '@/lib/openai';
import type { TranscriptTurn } from '@/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/sessions/[id]/evaluate
 * Generate evaluation using OpenAI with transcript
 * Save evaluation to database and update assignment status to completed
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

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
    });

    if (!session) {
      return notFound('Session not found');
    }

    // Check if evaluation already exists
    if (session.assignment.evaluation) {
      return conflict('Evaluation already exists for this assignment');
    }

    // Check if there's enough transcript to evaluate
    if (session.transcript.length < 2) {
      return conflict('Not enough conversation to evaluate');
    }

    // Convert transcript to TranscriptTurn format
    const transcriptForEval: TranscriptTurn[] = session.transcript.map((turn) => ({
      id: turn.id,
      role: turn.role as TranscriptTurn['role'],
      content: turn.content,
      turnOrder: turn.turnOrder,
      createdAt: turn.createdAt,
    }));

    // Generate evaluation using OpenAI
    const evaluationResult = await generateEvaluation({
      scenarioTitle: session.assignment.scenario.title,
      scenarioDescription: session.assignment.scenario.description,
      transcript: transcriptForEval,
      vectorStoreId: session.assignment.scenario.account.vectorStoreId ?? undefined,
    });

    // Save evaluation and update session/assignment in a transaction
    const [evaluation] = await prisma.$transaction([
      // Create evaluation
      prisma.evaluation.create({
        data: {
          assignmentId: session.assignmentId,
          overallScore: evaluationResult.overallScore,
          feedbackJson: JSON.stringify(evaluationResult.feedback),
          strengths: evaluationResult.strengths.join('\n'),
          areasToImprove: evaluationResult.areasToImprove.join('\n'),
          rawResponse: evaluationResult.rawResponse,
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
        },
      }),
    ]);

    return apiSuccess({
      evaluation,
      session: {
        id: session.id,
        status: 'completed',
        endedAt: new Date(),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
