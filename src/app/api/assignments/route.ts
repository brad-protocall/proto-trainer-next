import { NextRequest } from 'next/server'
import prisma from '@/lib/prisma'
import { apiSuccess, apiError, handleApiError } from '@/lib/api'
import { createAssignmentSchema, bulkAssignmentSchema, assignmentQuerySchema } from '@/lib/validators'
import { getCurrentUser } from '@/lib/auth'
import type { AssignmentResponse, BulkAssignmentResponse, ScenarioMode, AssignmentStatus } from '@/types'

// Bulk operation limits
const MAX_BULK_ASSIGNMENTS = 500

function buildAssignmentResponse(assignment: {
  id: string
  accountId: string | null
  scenarioId: string
  counselorId: string
  assignedBy: string
  status: string
  createdAt: Date
  dueDate: Date | null
  startedAt: Date | null
  completedAt: Date | null
  sessionId: string | null
  evaluationId: string | null
  supervisorNotes: string | null
  scenario: { title: string; mode: string }
  counselor: { displayName: string | null }
  supervisor: { displayName: string | null }
}, hasTranscript = false): AssignmentResponse {
  const now = new Date()
  const isOverdue = assignment.status !== 'completed' &&
                   assignment.dueDate !== null &&
                   new Date(assignment.dueDate) < now

  return {
    id: assignment.id,
    accountId: assignment.accountId,
    scenarioId: assignment.scenarioId,
    scenarioTitle: assignment.scenario.title,
    scenarioMode: assignment.scenario.mode as ScenarioMode,
    counselorId: assignment.counselorId,
    counselorName: assignment.counselor.displayName,
    assignedBy: assignment.assignedBy,
    assignedByName: assignment.supervisor.displayName,
    status: assignment.status as AssignmentStatus,
    createdAt: assignment.createdAt.toISOString(),
    dueDate: assignment.dueDate?.toISOString() ?? null,
    startedAt: assignment.startedAt?.toISOString() ?? null,
    completedAt: assignment.completedAt?.toISOString() ?? null,
    sessionId: assignment.sessionId,
    evaluationId: assignment.evaluationId,
    supervisorNotes: assignment.supervisorNotes,
    isOverdue,
    hasTranscript,
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return apiError({ code: 'UNAUTHORIZED', message: 'Not authenticated' }, 401)
    }

    // Parse and validate query params
    const searchParams = Object.fromEntries(request.nextUrl.searchParams)
    const queryResult = assignmentQuerySchema.safeParse(searchParams)

    if (!queryResult.success) {
      return apiError(
        { code: 'VALIDATION_ERROR', fields: queryResult.error.flatten().fieldErrors as Record<string, string[]> },
        400
      )
    }

    const { counselorId, status, scenarioId, limit } = queryResult.data

    // Build where clause based on role and filters
    const where: Record<string, unknown> = {}

    // Role-based filtering
    if (user.role === 'counselor') {
      // Counselors can only see their own assignments
      where.counselorId = user.id
    } else if (counselorId) {
      // Supervisors can filter by counselor
      where.counselorId = counselorId
    }

    // Status filter (comma-separated)
    if (status) {
      const statusList = status.split(',').map(s => s.trim())
      where.status = { in: statusList }
    }

    // Scenario filter
    if (scenarioId) {
      where.scenarioId = scenarioId
    }

    const assignments = await prisma.assignment.findMany({
      where,
      include: {
        scenario: { select: { title: true, mode: true } },
        counselor: { select: { displayName: true } },
        supervisor: { select: { displayName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    // Check for transcripts (sessions with turns)
    const sessionsWithTurns = await prisma.session.findMany({
      where: {
        assignmentId: { in: assignments.filter(a => a.sessionId).map(a => a.id) },
        turns: { some: {} },
      },
      select: { assignmentId: true },
    })
    const assignmentsWithTranscripts = new Set(sessionsWithTurns.map(s => s.assignmentId))

    const responses = assignments.map(a =>
      buildAssignmentResponse(a, assignmentsWithTranscripts.has(a.id))
    )

    return apiSuccess(responses)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return apiError({ code: 'UNAUTHORIZED', message: 'Not authenticated' }, 401)
    }

    if (user.role !== 'supervisor') {
      return apiError({ code: 'UNAUTHORIZED', message: 'Only supervisors can create assignments' }, 403)
    }

    const body = await request.json()

    // Check if this is a bulk assignment request
    if (Array.isArray(body.scenarioIds) || Array.isArray(body.counselorIds)) {
      return handleBulkCreate(body, user.id)
    }

    // Single assignment creation
    const result = createAssignmentSchema.safeParse(body)
    if (!result.success) {
      return apiError(
        { code: 'VALIDATION_ERROR', fields: result.error.flatten().fieldErrors as Record<string, string[]> },
        400
      )
    }

    const { scenarioId, counselorId, dueDate, supervisorNotes } = result.data

    // Validate scenario exists
    const scenario = await prisma.scenario.findUnique({
      where: { id: scenarioId },
    })
    if (!scenario) {
      return apiError({ code: 'NOT_FOUND', message: 'Scenario not found' }, 404)
    }

    // Validate counselor exists and has correct role
    const counselor = await prisma.user.findUnique({
      where: { id: counselorId },
    })
    if (!counselor) {
      return apiError({ code: 'NOT_FOUND', message: 'Counselor not found' }, 404)
    }
    if (counselor.role !== 'counselor') {
      return apiError({ code: 'VALIDATION_ERROR', fields: { counselorId: ['User is not a counselor'] } }, 400)
    }

    // Check for existing active assignment
    const existingActive = await prisma.assignment.findFirst({
      where: {
        counselorId,
        scenarioId,
        status: { not: 'completed' },
      },
    })
    if (existingActive) {
      return apiError({ code: 'CONFLICT', message: 'Active assignment already exists for this counselor and scenario' }, 409)
    }

    const assignment = await prisma.assignment.create({
      data: {
        accountId: scenario.accountId,
        scenarioId,
        counselorId,
        assignedBy: user.id,
        dueDate: dueDate ? new Date(dueDate) : null,
        supervisorNotes,
      },
      include: {
        scenario: { select: { title: true, mode: true } },
        counselor: { select: { displayName: true } },
        supervisor: { select: { displayName: true } },
      },
    })

    return new Response(
      JSON.stringify({ ok: true, data: buildAssignmentResponse(assignment) }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return handleApiError(error)
  }
}

async function handleBulkCreate(body: unknown, userId: string): Promise<Response> {
  const result = bulkAssignmentSchema.safeParse(body)
  if (!result.success) {
    return apiError(
      { code: 'VALIDATION_ERROR', fields: result.error.flatten().fieldErrors as Record<string, string[]> },
      400
    )
  }

  const { scenarioIds, counselorIds, dueDate, supervisorNotes } = result.data

  // Validate batch size
  const totalPairs = scenarioIds.length * counselorIds.length
  if (totalPairs > MAX_BULK_ASSIGNMENTS) {
    return apiError(
      { code: 'VALIDATION_ERROR', fields: { bulk: [`Batch too large: maximum ${MAX_BULK_ASSIGNMENTS} assignments per request`] } },
      400
    )
  }

  // Validate counselors exist and have correct role
  const counselors = await prisma.user.findMany({
    where: {
      id: { in: counselorIds },
      role: 'counselor',
    },
  })
  if (counselors.length !== counselorIds.length) {
    return apiError(
      { code: 'VALIDATION_ERROR', fields: { counselorIds: ['One or more counselor IDs are invalid or not counselor role'] } },
      400
    )
  }

  // Validate scenarios exist
  const scenarios = await prisma.scenario.findMany({
    where: { id: { in: scenarioIds } },
  })
  if (scenarios.length !== scenarioIds.length) {
    return apiError(
      { code: 'VALIDATION_ERROR', fields: { scenarioIds: ['One or more scenario IDs are invalid'] } },
      400
    )
  }
  const scenarioMap = new Map(scenarios.map(s => [s.id, s]))

  // Find existing active assignments for requested pairs
  const existingAssignments = await prisma.assignment.findMany({
    where: {
      counselorId: { in: counselorIds },
      scenarioId: { in: scenarioIds },
      status: { not: 'completed' },
    },
    select: { counselorId: true, scenarioId: true },
  })
  const existingPairs = new Set(
    existingAssignments.map(a => `${a.counselorId}:${a.scenarioId}`)
  )

  // Build assignment records, excluding pairs with active assignments
  const skippedPairs: Array<{ counselorId: string; scenarioId: string }> = []
  const assignmentsToCreate: Array<{
    accountId: string | null
    scenarioId: string
    counselorId: string
    assignedBy: string
    dueDate: Date | null
    supervisorNotes: string | null
    status: string
  }> = []

  for (const counselorId of counselorIds) {
    for (const scenarioId of scenarioIds) {
      if (existingPairs.has(`${counselorId}:${scenarioId}`)) {
        skippedPairs.push({ counselorId, scenarioId })
      } else {
        const scenario = scenarioMap.get(scenarioId)!
        assignmentsToCreate.push({
          accountId: scenario.accountId,
          scenarioId,
          counselorId,
          assignedBy: userId,
          dueDate: dueDate ? new Date(dueDate) : null,
          supervisorNotes: supervisorNotes ?? null,
          status: 'pending',
        })
      }
    }
  }

  // Batch insert the non-duplicate assignments
  if (assignmentsToCreate.length > 0) {
    await prisma.assignment.createMany({
      data: assignmentsToCreate,
    })
  }

  const responseData: BulkAssignmentResponse = {
    created: assignmentsToCreate.length,
    skipped: skippedPairs.length,
    skippedPairs,
  }

  // Set response status: 201 if all created, 207 if some skipped
  const status = skippedPairs.length > 0 ? 207 : 201

  return new Response(
    JSON.stringify({ ok: true, data: responseData }),
    { status, headers: { 'Content-Type': 'application/json' } }
  )
}
