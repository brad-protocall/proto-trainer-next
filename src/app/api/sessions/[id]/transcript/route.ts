import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiSuccess, handleApiError, notFound, conflict, forbidden } from '@/lib/api'
import { requireAuth, canAccessResource } from '@/lib/auth'
import { z } from 'zod'

interface RouteParams {
  params: Promise<{ id: string }>
}

// Schema for saving a single transcript turn (voice sessions)
const saveTranscriptTurnSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(50000),
  turnOrder: z.number().int().min(0).optional(),
  attemptNumber: z.number().int().min(1).optional(),
})

// Schema for bulk saving transcript turns
const bulkSaveTranscriptSchema = z.object({
  turns: z.array(saveTranscriptTurnSchema).min(1).max(500),
})

/**
 * POST /api/sessions/[id]/transcript
 * Save transcript turns for voice sessions WITHOUT generating AI responses.
 *
 * This endpoint is specifically for voice training where:
 * - Transcripts are captured from OpenAI Realtime API
 * - Both user and assistant turns are already captured
 * - We just need to persist them to the database
 *
 * Supports two modes:
 * 1. Single turn: { role, content, turnOrder? }
 * 2. Bulk turns: { turns: [{ role, content, turnOrder? }, ...] }
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params

    const authResult = await requireAuth(request)
    if (authResult.error) return authResult.error
    const user = authResult.user

    const body = await request.json()

    // Try bulk format first, then single turn
    const bulkResult = bulkSaveTranscriptSchema.safeParse(body)
    const singleResult = saveTranscriptTurnSchema.safeParse(body)

    if (!bulkResult.success && !singleResult.success) {
      return handleApiError(new z.ZodError(singleResult.error.errors))
    }

    // Get session to verify ownership
    const session = await prisma.session.findUnique({
      where: { id },
      include: {
        assignment: true,
      },
    })

    if (!session) {
      return notFound('Session not found')
    }

    // Check ownership
    const ownerId = session.assignment?.counselorId ?? session.userId
    if (!ownerId || !canAccessResource(user, ownerId)) {
      return forbidden('Cannot save transcript to another user\'s session')
    }

    if (session.status !== 'active') {
      return conflict('Cannot save transcript to inactive session')
    }

    // Determine turns to save
    const turnsToSave = bulkResult.success
      ? bulkResult.data.turns
      : [singleResult.data!]

    // Save all turns in a transaction with proper turnOrder
    const savedTurns = await prisma.$transaction(async (tx) => {
      // Get session's current attempt number for default
      const currentSession = await tx.session.findUnique({
        where: { id },
        select: { currentAttempt: true },
      })
      const defaultAttemptNumber = currentSession?.currentAttempt ?? 1

      // Get current max turnOrder for this attempt
      const maxResult = await tx.transcriptTurn.aggregate({
        where: { sessionId: id, attemptNumber: defaultAttemptNumber },
        _max: { turnOrder: true },
      })
      let nextTurnOrder = (maxResult._max.turnOrder ?? 0) + 1

      const results = []
      for (const turn of turnsToSave) {
        const saved = await tx.transcriptTurn.create({
          data: {
            sessionId: id,
            role: turn.role,
            content: turn.content,
            turnOrder: turn.turnOrder ?? nextTurnOrder,
            attemptNumber: turn.attemptNumber ?? defaultAttemptNumber,
          },
        })
        results.push(saved)
        nextTurnOrder++
      }

      return results
    })

    return apiSuccess({
      saved: savedTurns.length,
      turns: savedTurns.map(t => ({
        id: t.id,
        role: t.role,
        turnOrder: t.turnOrder,
      })),
    })
  } catch (error) {
    return handleApiError(error)
  }
}
