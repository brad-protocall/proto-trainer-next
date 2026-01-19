import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiSuccess, handleApiError, notFound, conflict } from '@/lib/api';
import { sendMessageSchema } from '@/lib/validators';
import { getChatCompletion } from '@/lib/openai';
import type { TranscriptTurn } from '@/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/sessions/[id]/message
 * Send a user message and get AI response, save both to transcript
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const data = sendMessageSchema.parse(body);

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
          },
        },
      },
    });

    if (!session) {
      return notFound('Session not found');
    }

    if (session.status !== 'active') {
      return conflict('Cannot send message to inactive session');
    }

    // Get current turn order
    const lastTurn = session.transcript[session.transcript.length - 1];
    const nextTurnOrder = (lastTurn?.turnOrder ?? 0) + 1;

    // Convert transcript to TranscriptTurn format for OpenAI helper
    const transcriptForAI: TranscriptTurn[] = session.transcript.map((turn) => ({
      id: turn.id,
      role: turn.role as TranscriptTurn['role'],
      content: turn.content,
      turnOrder: turn.turnOrder,
      createdAt: turn.createdAt,
    }));

    // Add the user's message to the transcript for AI
    transcriptForAI.push({
      id: 'pending',
      role: 'user',
      content: data.content,
      turnOrder: nextTurnOrder,
      createdAt: new Date(),
    });

    // Get AI response
    const aiResponse = await getChatCompletion({
      scenarioPrompt: session.assignment.scenario.prompt,
      transcript: transcriptForAI,
      vectorStoreId: session.assignment.scenario.account.vectorStoreId ?? undefined,
    });

    // Save both messages in a transaction
    const [userMessage, aiMessage] = await prisma.$transaction([
      // Save user message
      prisma.transcriptTurn.create({
        data: {
          sessionId: id,
          role: 'user',
          content: data.content,
          turnOrder: nextTurnOrder,
        },
      }),
      // Save AI response
      prisma.transcriptTurn.create({
        data: {
          sessionId: id,
          role: 'assistant',
          content: aiResponse,
          turnOrder: nextTurnOrder + 1,
        },
      }),
    ]);

    return apiSuccess({
      userMessage,
      aiMessage,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
