import { NextRequest } from 'next/server'
import { timingSafeEqual, createHash } from 'crypto'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { apiSuccess, apiError, handleApiError, notFound } from '@/lib/api'

// Constants for external API
const EXTERNAL_SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000099'
const EXTERNAL_ACCOUNT_ID = '00000000-0000-0000-0000-000000000020'

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

    // Check for existing active assignment (prevent duplicates)
    const existingActive = await prisma.assignment.findFirst({
      where: {
        counselorId: user.id,
        scenarioId: scenarioId,
        status: { not: 'completed' },
      },
    })

    if (existingActive) {
      return apiError(
        {
          type: 'CONFLICT',
          message: `Active assignment already exists for this counselor and scenario`,
        },
        409
      )
    }

    // Create the assignment
    // Note: A partial unique index prevents race conditions at the DB level
    // If two concurrent requests pass the findFirst check, one will fail here
    try {
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
    } catch (createError) {
      // Handle unique constraint violation (race condition caught by DB index)
      if (
        createError instanceof Error &&
        createError.message.includes('Unique constraint failed')
      ) {
        return apiError(
          {
            type: 'CONFLICT',
            message: 'Active assignment already exists for this counselor and scenario',
          },
          409
        )
      }
      throw createError
    }
  } catch (error) {
    return handleApiError(error)
  }
}
