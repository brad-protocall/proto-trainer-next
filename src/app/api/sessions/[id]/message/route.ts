import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiSuccess, handleApiError, notFound, conflict, forbidden } from '@/lib/api'
import { sendMessageSchema } from '@/lib/validators'
import { getChatCompletion, getDefaultChextPrompt } from '@/lib/openai'
import { requireAuth, canAccessResource } from '@/lib/auth'
import type { TranscriptTurn } from '@/types'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/sessions/[id]/message
 * Send a user message and get AI response, save both to transcript
 *
 * IMPORTANT: Uses atomic transaction to fix race condition with turnOrder
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params

    const authResult = await requireAuth(request)
    if (authResult.error) return authResult.error
    const user = authResult.user

    const body = await request.json()
    const data = sendMessageSchema.parse(body)

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
    })

    if (!session) {
      return notFound('Session not found')
    }

    // For assignment-based sessions, check ownership via assignment
    // For free practice sessions, check via userId
    const ownerId = session.assignment?.counselorId ?? session.userId
    if (!ownerId || !canAccessResource(user, ownerId)) {
      return forbidden('Cannot send message to another user\'s session')
    }

    if (session.status !== 'active') {
      return conflict('Cannot send message to inactive session')
    }

    // Convert transcript to TranscriptTurn format for OpenAI helper
    const transcriptForAI: TranscriptTurn[] = session.transcript.map((turn) => ({
      id: turn.id,
      sessionId: session.id,
      role: turn.role as TranscriptTurn['role'],
      content: turn.content,
      turnOrder: turn.turnOrder,
      createdAt: turn.createdAt.toISOString(),
    }))

    // Add the user's message to the transcript for AI
    transcriptForAI.push({
      id: 'pending',
      sessionId: session.id,
      role: 'user',
      content: data.content,
      turnOrder: transcriptForAI.length + 1,
      createdAt: new Date().toISOString(),
    })

    // Get scenario prompt - either from assignment or use default chext prompt for free practice
    const scenarioPrompt = session.assignment?.scenario?.prompt ?? getDefaultChextPrompt()
    const vectorStoreId = session.assignment?.scenario?.account?.vectorStoreId ?? undefined

    // Get AI response
    const aiResponse = await getChatCompletion({
      scenarioPrompt,
      transcript: transcriptForAI,
      vectorStoreId,
    })

    // ATOMIC: Save both messages in a transaction with atomic turnOrder calculation
    // This fixes the race condition where concurrent requests could get the same turnOrder
    const result = await prisma.$transaction(async (tx) => {
      // Get max turnOrder atomically within the transaction
      const maxResult = await tx.transcriptTurn.aggregate({
        where: { sessionId: id },
        _max: { turnOrder: true },
      })
      const nextTurnOrder = (maxResult._max.turnOrder ?? 0) + 1

      // Save user message
      const userMessage = await tx.transcriptTurn.create({
        data: {
          sessionId: id,
          role: 'user',
          content: data.content,
          turnOrder: nextTurnOrder,
        },
      })

      // Save AI response
      const aiMessage = await tx.transcriptTurn.create({
        data: {
          sessionId: id,
          role: 'assistant',
          content: aiResponse,
          turnOrder: nextTurnOrder + 1,
        },
      })

      return { userMessage, aiMessage }
    })

    return apiSuccess(result)
  } catch (error) {
    return handleApiError(error)
  }
}
