import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { apiSuccess, apiError, handleApiError, notFound, forbidden } from '@/lib/api'
import { analyzeSessionTranscript } from '@/lib/openai'
import { requireAuth } from '@/lib/auth'
import { checkRateLimit } from '@/lib/rate-limit'
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

    // Auth: only supervisors can trigger manual analysis
    const authResult = await requireAuth(request)
    if (authResult.error) return authResult.error
    const user = authResult.user

    if (user.role !== 'supervisor') {
      return forbidden('Supervisor access required')
    }

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

    // Idempotency: check for existing analysis flags
    const existingAnalysisFlags = await prisma.sessionFlag.count({
      where: { sessionId: id, source: 'analysis' },
    })

    if (existingAnalysisFlags > 0) {
      return apiSuccess({
        analyzed: false,
        reason: 'already_analyzed',
        flagCount: existingAnalysisFlags,
      })
    }

    // Load transcript for latest attempt (same query as evaluate route)
    const latestTranscript = await prisma.transcriptTurn.findMany({
      where: {
        sessionId: id,
        attemptNumber: session.currentAttempt,
      },
      orderBy: { turnOrder: 'asc' },
    })

    // Skip if < 3 transcript turns
    if (latestTranscript.length < 3) {
      return apiSuccess({
        analyzed: false,
        reason: 'insufficient_transcript',
      })
    }

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

    // Call analyzeSessionTranscript
    const result = await analyzeSessionTranscript({
      transcript: transcriptForAnalysis,
      scenarioPrompt: scenario?.prompt ?? null,
      scenarioDescription: scenario?.description ?? null,
    })

    // Create SessionFlag records for all findings
    const flagsToCreate: Prisma.SessionFlagCreateManyInput[] = []

    // Misuse findings
    for (const finding of result.misuse.findings) {
      flagsToCreate.push({
        sessionId: id,
        type: finding.category,
        severity: finding.severity,
        details: finding.summary,
        metadata: { evidence: finding.evidence },
        source: 'analysis',
      })
    }

    // Consistency findings
    for (const finding of result.consistency.findings) {
      flagsToCreate.push({
        sessionId: id,
        type: finding.category,
        severity: finding.severity,
        details: finding.summary,
        metadata: {
          evidence: finding.evidence,
          promptReference: finding.promptReference,
          overallScore: result.consistency.overallScore,
        },
        source: 'analysis',
      })
    }

    // If no findings from either category: create single 'analysis_clean' flag
    if (flagsToCreate.length === 0) {
      flagsToCreate.push({
        sessionId: id,
        type: 'analysis_clean',
        severity: 'info',
        details: 'Post-session analysis completed — no issues found.',
        metadata: {
          overallConsistencyScore: result.consistency.overallScore,
          consistencySummary: result.consistency.summary,
        },
        source: 'analysis',
      })
    }

    // Persist all flags
    await prisma.sessionFlag.createMany({
      data: flagsToCreate,
    })

    return apiSuccess({
      analyzed: true,
      flagCount: flagsToCreate.length,
      overallConsistencyScore: result.consistency.overallScore,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
