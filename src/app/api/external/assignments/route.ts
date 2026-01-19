import { NextRequest } from 'next/server'
import prisma from '@/lib/prisma'
import { apiSuccess, apiError, handleApiError, notFound } from '@/lib/api'
import { validateExternalApiKey } from '@/lib/external-auth'

/**
 * GET /api/external/assignments?user_id=X
 * Get pending simulation assignments for a user.
 * Used by personalized-training system to show what simulations are assigned.
 *
 * Auth: X-API-Key header validated against EXTERNAL_API_KEY
 * Query params: user_id (required) - internal user ID
 * Returns: Array of pending simulation assignments
 */
export async function GET(request: NextRequest) {
  try {
    const authError = validateExternalApiKey(request)
    if (authError) return authError

    const userId = request.nextUrl.searchParams.get('user_id')

    if (!userId) {
      return apiError({ type: 'VALIDATION_ERROR', message: 'user_id query parameter is required' }, 400)
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    })

    if (!user) {
      return notFound('User not found')
    }

    const assignments = await prisma.assignment.findMany({
      where: {
        counselorId: userId,
        status: { in: ['pending', 'in_progress'] },
      },
      include: {
        scenario: {
          select: {
            id: true,
            title: true,
            description: true,
            mode: true,
            category: true,
          },
        },
      },
      orderBy: [
        { dueDate: 'asc' },
        { createdAt: 'desc' },
      ],
    })

    return apiSuccess(
      assignments.map(a => ({
        assignment_id: a.id,
        scenario_id: a.scenarioId,
        scenario_title: a.scenario.title,
        scenario_description: a.scenario.description,
        scenario_mode: a.scenario.mode,
        scenario_category: a.scenario.category,
        status: a.status,
        due_date: a.dueDate?.toISOString() ?? null,
        created_at: a.createdAt.toISOString(),
        supervisor_notes: a.supervisorNotes,
      }))
    )
  } catch (error) {
    return handleApiError(error)
  }
}

/**
 * POST /api/external/assignments
 * Create a new simulation assignment.
 * Used by personalized-training system to assign simulations to counselors.
 *
 * Auth: X-API-Key header validated against EXTERNAL_API_KEY
 * Body: { user_id, scenario_id, due_date?, notes? }
 * Returns: Created assignment
 */
export async function POST(request: NextRequest) {
  try {
    const authError = validateExternalApiKey(request)
    if (authError) return authError

    const body = await request.json()
    const { user_id, scenario_id, due_date, notes } = body

    if (!user_id) {
      return apiError({ type: 'VALIDATION_ERROR', message: 'user_id is required' }, 400)
    }

    if (!scenario_id) {
      return apiError({ type: 'VALIDATION_ERROR', message: 'scenario_id is required' }, 400)
    }

    const user = await prisma.user.findUnique({
      where: { id: user_id },
    })

    if (!user) {
      return notFound('User not found')
    }

    const scenario = await prisma.scenario.findUnique({
      where: { id: scenario_id },
    })

    if (!scenario) {
      return notFound('Scenario not found')
    }

    const existingActive = await prisma.assignment.findFirst({
      where: {
        counselorId: user_id,
        scenarioId: scenario_id,
        status: { not: 'completed' },
      },
    })

    if (existingActive) {
      return apiError({ type: 'CONFLICT', message: 'Active assignment already exists for this user and scenario' }, 409)
    }

    const assignment = await prisma.assignment.create({
      data: {
        accountId: scenario.accountId,
        scenarioId: scenario_id,
        counselorId: user_id,
        assignedBy: scenario.createdBy,
        dueDate: due_date ? new Date(due_date) : null,
        supervisorNotes: notes ?? null,
      },
      include: {
        scenario: {
          select: {
            title: true,
            mode: true,
            category: true,
          },
        },
      },
    })

    return apiSuccess({
      assignment_id: assignment.id,
      scenario_id: assignment.scenarioId,
      scenario_title: assignment.scenario.title,
      scenario_mode: assignment.scenario.mode,
      scenario_category: assignment.scenario.category,
      status: assignment.status,
      due_date: assignment.dueDate?.toISOString() ?? null,
      created_at: assignment.createdAt.toISOString(),
    }, 201)
  } catch (error) {
    return handleApiError(error)
  }
}
