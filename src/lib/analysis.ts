import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { analyzeSessionTranscript } from '@/lib/openai'
import type { TranscriptTurn } from '@/types'

export interface AnalyzeSessionResult {
  analyzed: true
  flagCount: number
  overallConsistencyScore: number | null
}

export interface AnalyzeSessionSkipped {
  analyzed: false
  reason: 'insufficient_transcript' | 'already_analyzed'
  flagCount?: number
}

/**
 * Run post-session analysis (misuse + consistency scanning) and persist flags.
 * Designed to be called fire-and-forget after evaluation completes,
 * or directly from the manual analyze endpoint.
 *
 * Idempotent: skips if analysis flags already exist for this session.
 * Creates 'analysis_clean' flag if no issues found (audit trail).
 */
export async function analyzeSession(
  sessionId: string,
  scenario: { prompt: string; description: string | null } | null,
  transcript: TranscriptTurn[]
): Promise<AnalyzeSessionResult | AnalyzeSessionSkipped> {
  // Skip if < 3 transcript turns (too short to meaningfully scan)
  if (transcript.length < 3) {
    return { analyzed: false, reason: 'insufficient_transcript' }
  }

  // Idempotency: check for existing analysis flags
  const existingAnalysisFlags = await prisma.sessionFlag.count({
    where: { sessionId, source: 'analysis' },
  })
  if (existingAnalysisFlags > 0) {
    return { analyzed: false, reason: 'already_analyzed', flagCount: existingAnalysisFlags }
  }

  // Call LLM analysis
  const result = await analyzeSessionTranscript({
    transcript,
    scenarioPrompt: scenario?.prompt ?? null,
    scenarioDescription: scenario?.description ?? null,
  })

  // Build flag records
  const flagsToCreate: Prisma.SessionFlagCreateManyInput[] = []

  for (const finding of result.misuse.findings) {
    flagsToCreate.push({
      sessionId,
      type: finding.category,
      severity: finding.severity,
      details: finding.summary,
      metadata: { evidence: finding.evidence },
      source: 'analysis',
    })
  }

  for (const finding of result.consistency.findings) {
    flagsToCreate.push({
      sessionId,
      type: finding.category,
      severity: finding.severity,
      details: finding.summary,
      metadata: {
        evidence: finding.evidence,
        promptReference: finding.promptReference,
        overallConsistencyScore: result.consistency.overallScore,
      },
      source: 'analysis',
    })
  }

  // If no findings: create 'analysis_clean' flag (audit trail that scan ran)
  if (flagsToCreate.length === 0) {
    flagsToCreate.push({
      sessionId,
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

  await prisma.sessionFlag.createMany({
    data: flagsToCreate,
  })

  return {
    analyzed: true,
    flagCount: flagsToCreate.length,
    overallConsistencyScore: result.consistency.overallScore,
  }
}
