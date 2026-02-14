import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiSuccess, handleApiError, notFound, invalidId } from '@/lib/api'
import { requireInternalAuth } from '@/lib/auth'
import { z } from 'zod'

interface RouteParams {
  params: Promise<{ id: string }>
}

const bulkTranscriptSchema = z.object({
  turns: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().min(1).max(50000),
    turnOrder: z.number().int().min(0),
    attemptNumber: z.number().int().positive().optional(),
  })).min(1).max(500),
})

/**
 * POST /api/internal/sessions/[id]/transcript
 *
 * Bulk save transcript turns for a voice session. Called by the LiveKit agent
 * on shutdown to persist the full conversation.
 * Authenticates via X-Internal-Service-Key header.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const idError = invalidId(id)
    if (idError) return idError

    const authResult = requireInternalAuth(request)
    if (authResult.error) return authResult.error

    const body = await request.json()
    const data = bulkTranscriptSchema.parse(body)

    // Verify session exists
    const session = await prisma.session.findUnique({
      where: { id },
      select: { id: true, currentAttempt: true },
    })

    if (!session) {
      return notFound('Session not found')
    }

    const defaultAttemptNumber = session.currentAttempt ?? 1

    // Idempotent: delete existing turns for this attempt, then bulk insert.
    // "Most turns wins" — skip overwrite if existing transcript is more complete.
    // Both client (fast path) and agent (shutdown) may persist; keep the longer one.
    const turnData = data.turns.map((turn) => ({
      sessionId: id,
      role: turn.role,
      content: turn.content,
      turnOrder: turn.turnOrder,
      attemptNumber: turn.attemptNumber ?? defaultAttemptNumber,
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
      sessionId: id,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
