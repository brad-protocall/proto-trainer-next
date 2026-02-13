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
      select: {
        id: true,
        status: true,
        currentAttempt: true,
        userId: true,
        assignment: { select: { counselorId: true } },
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

    // Get session's current attempt number for default
    const defaultAttemptNumber = session.currentAttempt ?? 1

    // Idempotent: delete existing turns for this attempt, then bulk insert.
    // "Most turns wins" — skip overwrite if existing transcript is more complete.
    // Both client (fast path) and agent (shutdown) may persist; keep the longer one.
    const turnData = turnsToSave.map((turn, i) => ({
      sessionId: id,
      role: turn.role,
      content: turn.content,
      turnOrder: turn.turnOrder ?? i + 1,
      attemptNumber: defaultAttemptNumber,
    }))

    const result = await prisma.$transaction(async (tx) => {
      const existingCount = await tx.transcriptTurn.count({
        where: { sessionId: id, attemptNumber: defaultAttemptNumber },
      })

      if (existingCount > turnData.length) {
        return { count: existingCount }
      }

      await tx.transcriptTurn.deleteMany({
        where: { sessionId: id, attemptNumber: defaultAttemptNumber },
      })

      return tx.transcriptTurn.createMany({ data: turnData })
    })

    return apiSuccess({
      saved: result.count,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
