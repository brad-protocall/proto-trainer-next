import { NextRequest } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { apiSuccess, apiError, handleApiError, notFound } from '@/lib/api'

// Constants for external API
const EXTERNAL_SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000099'
const EXTERNAL_ACCOUNT_ID = '00000000-0000-0000-0000-000000000020'

/**
 * Timing-safe API key comparison
 */
function validateApiKey(request: NextRequest): boolean {
  const apiKey = request.headers.get('X-API-Key')
  const expectedKey = process.env.EXTERNAL_API_KEY

  if (!apiKey || !expectedKey) {
    return false
  }

  if (apiKey.length !== expectedKey.length) {
    return false
  }

  return timingSafeEqual(Buffer.from(apiKey), Buffer.from(expectedKey))
}

// Request body schema for POST
const CreateAssignmentSchema = z.object({
  user_id: z.string().min(1, 'user_id is required'),
  scenario_id: z.string().uuid('scenario_id must be a valid UUID'),
  due_date: z.string().datetime().optional(),
})

/**
 * Map assignment to external format
 */
function toExternalAssignment(assignment: {
  id: string
  scenario: { id: string; title: string }
  createdAt: Date
  dueDate: Date | null
  status: string
}) {
  return {
    id: assignment.id,
    simulationId: assignment.scenario.id,
    simulationName: assignment.scenario.title,
    assignedAt: assignment.createdAt.toISOString(),
    dueDate: assignment.dueDate?.toISOString() ?? undefined,
    status: assignment.status as 'pending' | 'in_progress' | 'completed',
  }
}

/**
 * GET /api/external/assignments?user_id={externalId}
 * List assignments for a counselor by their external ID
 */
export async function GET(request: NextRequest) {
  if (!validateApiKey(request)) {
    return apiError({ type: 'UNAUTHORIZED', message: 'Invalid or missing API key' }, 401)
  }

  try {
    const { searchParams } = new URL(request.url)
    const externalUserId = searchParams.get('user_id')

    if (!externalUserId) {
      return apiError(
        { type: 'VALIDATION_ERROR', message: 'user_id query parameter is required' },
        400
      )
    }

    // Look up user by external ID
    const user = await prisma.user.findUnique({
      where: { externalId: externalUserId },
    })

    if (!user) {
      return notFound(`User with external ID '${externalUserId}' not found`)
    }

    // Get assignments for this user
    const assignments = await prisma.assignment.findMany({
      where: {
        counselorId: user.id,
      },
      include: {
        scenario: {
          select: {
            id: true,
            title: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    const externalAssignments = assignments.map(toExternalAssignment)

    return apiSuccess({ assignments: externalAssignments })
  } catch (error) {
    return handleApiError(error)
  }
}

/**
 * POST /api/external/assignments
 * Create a new assignment for a counselor
 */
export async function POST(request: NextRequest) {
  if (!validateApiKey(request)) {
    return apiError({ type: 'UNAUTHORIZED', message: 'Invalid or missing API key' }, 401)
  }

  try {
    const body = await request.json()
    const parsed = CreateAssignmentSchema.safeParse(body)

    if (!parsed.success) {
      return apiError(
        {
          type: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
        },
        400
      )
    }

    const { user_id: externalUserId, scenario_id: scenarioId, due_date: dueDate } = parsed.data

    // Look up user by external ID - DO NOT auto-create
    const user = await prisma.user.findUnique({
      where: { externalId: externalUserId },
    })

    if (!user) {
      return notFound(
        `User with external ID '${externalUserId}' not found. Create user first via your admin system.`
      )
    }

    // Verify scenario exists
    const scenario = await prisma.scenario.findUnique({
      where: { id: scenarioId },
      select: { id: true, title: true },
    })

    if (!scenario) {
      return notFound(`Scenario '${scenarioId}' not found`)
    }

    // Create the assignment
    const assignment = await prisma.assignment.create({
      data: {
        scenarioId: scenario.id,
        counselorId: user.id,
        assignedBy: EXTERNAL_SYSTEM_USER_ID,
        accountId: EXTERNAL_ACCOUNT_ID,
        status: 'pending',
        dueDate: dueDate ? new Date(dueDate) : null,
      },
      include: {
        scenario: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    })

    return apiSuccess({ assignment: toExternalAssignment(assignment) }, 201)
  } catch (error) {
    return handleApiError(error)
  }
}
