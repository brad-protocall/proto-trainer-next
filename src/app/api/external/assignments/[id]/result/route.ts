import { NextRequest } from 'next/server'
import prisma from '@/lib/prisma'
import { apiSuccess, handleApiError, notFound, invalidId } from '@/lib/api'
import { requireExternalApiKey } from '@/lib/external-auth'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/external/assignments/{id}/result
 * Get evaluation result for a completed assignment
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const authError = requireExternalApiKey(request)
  if (authError) return authError

  try {
    const { id: assignmentId } = await params
    const idError = invalidId(assignmentId)
    if (idError) return idError

    // Get assignment with evaluation and learner info
    const assignment = await prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: {
        evaluation: true,
        learner: {
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
      return notFound('Assignment not found')
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
      learnerId: assignment.learner.externalId,
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
