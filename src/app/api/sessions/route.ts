import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiSuccess, handleApiError, notFound, conflict } from '@/lib/api';
import { createSessionSchema } from '@/lib/validators';
import { generateInitialGreeting } from '@/lib/openai';

/**
 * POST /api/sessions
 * Create a new chat session for an assignment and return initial AI greeting
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = createSessionSchema.parse(body);

    // Check if assignment exists and is in a valid state
    const assignment = await prisma.assignment.findUnique({
      where: { id: data.assignmentId },
      include: {
        scenario: true,
        session: true,
      },
    });

    if (!assignment) {
      return notFound('Assignment not found');
    }

    // Check if a session already exists for this assignment
    if (assignment.session) {
      return conflict('A session already exists for this assignment');
    }

    // Check assignment status
    if (assignment.status === 'completed') {
      return conflict('Cannot create session for completed assignment');
    }

    // Generate initial greeting from AI
    const initialGreeting = await generateInitialGreeting(assignment.scenario.prompt);

    // Create session and initial transcript turn in a transaction
    const session = await prisma.$transaction(async (tx) => {
      // Create the session
      const newSession = await tx.session.create({
        data: {
          assignmentId: data.assignmentId,
          status: 'active',
        },
      });

      // Create the initial AI greeting turn
      await tx.transcriptTurn.create({
        data: {
          sessionId: newSession.id,
          role: 'assistant',
          content: initialGreeting,
          turnOrder: 1,
        },
      });

      // Update assignment status to in_progress
      await tx.assignment.update({
        where: { id: data.assignmentId },
        data: { status: 'in_progress' },
      });

      // Return session with transcript
      return tx.session.findUnique({
        where: { id: newSession.id },
        include: {
          transcript: {
            orderBy: { turnOrder: 'asc' },
          },
        },
      });
    });

    return apiSuccess(session, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
