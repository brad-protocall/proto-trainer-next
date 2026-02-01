import { NextRequest } from 'next/server'
import { timingSafeEqual, createHash } from 'crypto'
import prisma from '@/lib/prisma'
import { apiSuccess, apiError, handleApiError, notFound } from '@/lib/api'

/**
 * Timing-safe API key comparison.
 * Uses SHA-256 hashing to ensure constant-time comparison regardless of key lengths.
 */
function validateApiKey(request: NextRequest): boolean {
  const apiKey = request.headers.get('X-API-Key')
  const expectedKey = process.env.EXTERNAL_API_KEY

  if (!apiKey || !expectedKey) {
    return false
  }

  // Hash both keys to ensure constant-length comparison (prevents length oracle)
  const providedHash = createHash('sha256').update(apiKey).digest()
  const expectedHash = createHash('sha256').update(expectedKey).digest()

  return timingSafeEqual(providedHash, expectedHash)
}

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/external/assignments/{id}/result
 * Get evaluation result for a completed assignment
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  if (!validateApiKey(request)) {
    return apiError({ type: 'UNAUTHORIZED', message: 'Invalid or missing API key' }, 401)
  }

  try {
    const { id: assignmentId } = await params

    // Get assignment with evaluation and counselor info
    const assignment = await prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: {
        evaluation: true,
        counselor: {
          select: {
            externalId: true,
          },
        },
        scenario: {
          select: {
            id: true,
            skill: true,
          },
        },
      },
    })

    if (!assignment) {
      return notFound(`Assignment '${assignmentId}' not found`)
    }

    // If no evaluation yet, return null result
    if (!assignment.evaluation) {
      return apiSuccess({
        result: null,
        message: 'Assignment not yet completed or evaluated',
      })
    }

    const evaluation = assignment.evaluation

    // Build skills array from overall score and scenario skill
    // We're being honest - we only have overall score, not per-skill breakdown
    const skills: Array<{ skill: string; score: number; notes?: string }> = []

    if (assignment.scenario.skill) {
      skills.push({
        skill: assignment.scenario.skill,
        score: Math.round(evaluation.overallScore),
        notes: evaluation.strengths,
      })
    } else {
      // Generic skill entry when no specific skill defined
      skills.push({
        skill: 'overall',
        score: Math.round(evaluation.overallScore),
        notes: evaluation.strengths,
      })
    }

    const result = {
      assignmentId: assignment.id,
      simulationId: assignment.scenario.id,
      counselorId: assignment.counselor.externalId,
      score: Math.round(evaluation.overallScore),
      feedback: evaluation.areasToImprove
        ? `Strengths: ${evaluation.strengths}\n\nAreas to Improve: ${evaluation.areasToImprove}`
        : evaluation.strengths,
      completedAt: assignment.completedAt?.toISOString() ?? evaluation.createdAt.toISOString(),
      skills,
    }

    return apiSuccess({ result })
  } catch (error) {
    return handleApiError(error)
  }
}
