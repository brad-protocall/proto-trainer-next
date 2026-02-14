import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiSuccess, apiError, handleApiError, notFound, invalidId } from '@/lib/api'
import { requireSupervisor } from '@/lib/auth'
import { checkRateLimit } from '@/lib/rate-limit'
import { analyzeSession } from '@/lib/analysis'
import type { TranscriptTurn } from '@/types'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/sessions/[id]/analyze
 * Manually trigger or re-trigger post-session analysis (misuse + consistency scanning).
 * Supervisor-only endpoint. Idempotent — skips if analysis already ran for this session.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const idError = invalidId(id)
    if (idError) return idError

    // Auth: only supervisors can trigger manual analysis
    const authResult = await requireSupervisor(request)
    if (authResult.error) return authResult.error

    // Rate limit: 5 per session per hour
    if (!checkRateLimit(`analyze:${id}`, 5, 3600000)) {
      return apiError({ type: 'RATE_LIMITED', message: 'Analysis rate limit exceeded. Try again later.' }, 429)
    }

    // Load session with scenario (same pattern as evaluate route)
    const session = await prisma.session.findUnique({
      where: { id },
      include: {
        assignment: {
          include: {
            scenario: true,
          },
        },
        scenario: true,
      },
    })

    if (!session) {
      return notFound('Session not found')
    }

    // Load transcript for latest attempt (same query as evaluate route)
    const latestTranscript = await prisma.transcriptTurn.findMany({
      where: {
        sessionId: id,
        attemptNumber: session.currentAttempt,
      },
      orderBy: { turnOrder: 'asc' },
    })

    // Convert transcript to TranscriptTurn format
    const transcriptForAnalysis: TranscriptTurn[] = latestTranscript.map((turn) => ({
      id: turn.id,
      sessionId: session.id,
      role: turn.role as TranscriptTurn['role'],
      content: turn.content,
      turnOrder: turn.turnOrder,
      createdAt: turn.createdAt.toISOString(),
    }))

    // Get scenario info
    const scenario = session.assignment?.scenario ?? session.scenario

    // Delegate to shared analysis helper (handles idempotency, LLM call, flag creation)
    const result = await analyzeSession(
      id,
      scenario ? { prompt: scenario.prompt, description: scenario.description } : null,
      transcriptForAnalysis
    )

    return apiSuccess(result)
  } catch (error) {
    return handleApiError(error)
  }
}
