import { NextRequest } from 'next/server'
import prisma from '@/lib/prisma'
import { apiSuccess, apiError, handleApiError } from '@/lib/api'
import { createAssignmentSchema, bulkAssignmentSchema, assignmentQuerySchema } from '@/lib/validators'
import { requireAuth, requireSupervisor } from '@/lib/auth'
import type { AssignmentResponse, BulkAssignmentResponse, ScenarioMode, AssignmentStatus } from '@/types'

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
  supervisorNotes: string | null
  requireRecording: boolean
  scenario: { title: string; mode: string }
  counselor: { displayName: string | null }
  supervisor: { displayName: string | null }
  session?: { id: string } | null
  evaluation?: { id: string } | null
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
    sessionId: assignment.session?.id ?? null,
    evaluationId: assignment.evaluation?.id ?? null,
    supervisorNotes: assignment.supervisorNotes,
    requireRecording: assignment.requireRecording,
    isOverdue,
    hasTranscript,
  }
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    if (authResult.error) return authResult.error
    const user = authResult.user

    const searchParams = Object.fromEntries(request.nextUrl.searchParams)
    const queryResult = assignmentQuerySchema.safeParse(searchParams)

    if (!queryResult.success) {
      return apiError(
        { type: 'VALIDATION_ERROR', message: 'Validation failed', details: queryResult.error.flatten().fieldErrors as Record<string, unknown> },
        400
      )
    }

    const { counselorId, status, scenarioId, limit } = queryResult.data

    // Build where clause based on role and filters
    const where: Record<string, unknown> = {}

    // Counselors can only see their own assignments
    if (user.role === 'counselor') {
      where.counselorId = user.id
    } else if (counselorId) {
      where.counselorId = counselorId
    }

    if (status) {
      const statusList = status.split(',').map(s => s.trim())
      where.status = { in: statusList }
    }

    if (scenarioId) {
      where.scenarioId = scenarioId
    }

    const assignments = await prisma.assignment.findMany({
      where,
      include: {
        scenario: { select: { title: true, mode: true } },
        counselor: { select: { displayName: true } },
        supervisor: { select: { displayName: true } },
        session: { select: { id: true } },
        evaluation: { select: { id: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    // Check for transcripts
    const sessionsWithTurns = await prisma.session.findMany({
      where: {
        assignmentId: { in: assignments.filter(a => a.session).map(a => a.id) },
        transcript: { some: {} },
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
    const authResult = await requireSupervisor(request)
    if (authResult.error) return authResult.error
    const user = authResult.user

    const body = await request.json()

    // Check if this is a bulk assignment request
    if (Array.isArray(body.scenarioIds) || Array.isArray(body.counselorIds)) {
      return handleBulkCreate(body, user.id)
    }

    const result = createAssignmentSchema.safeParse(body)
    if (!result.success) {
      return apiError(
        { type: 'VALIDATION_ERROR', message: 'Validation failed', details: result.error.flatten().fieldErrors as Record<string, unknown> },
        400
      )
    }

    const { scenarioId, counselorId, dueDate, supervisorNotes } = result.data

    const scenario = await prisma.scenario.findUnique({
      where: { id: scenarioId },
    })
    if (!scenario) {
      return apiError({ type: 'NOT_FOUND', message: 'Scenario not found' }, 404)
    }

    const counselor = await prisma.user.findUnique({
      where: { id: counselorId },
    })
    if (!counselor) {
      return apiError({ type: 'NOT_FOUND', message: 'Counselor not found' }, 404)
    }
    if (counselor.role !== 'counselor') {
      return apiError({ type: 'VALIDATION_ERROR', message: 'Validation failed', details: { counselorId: ['User is not a counselor'] } }, 400)
    }

    const existingActive = await prisma.assignment.findFirst({
      where: {
        counselorId,
        scenarioId,
        status: { not: 'completed' },
      },
    })
    if (existingActive) {
      return apiError({ type: 'CONFLICT', message: 'Active assignment already exists for this counselor and scenario' }, 409)
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

    return apiSuccess(buildAssignmentResponse(assignment), 201)
  } catch (error) {
    return handleApiError(error)
  }
}

async function handleBulkCreate(body: unknown, userId: string): Promise<Response> {
  const result = bulkAssignmentSchema.safeParse(body)
  if (!result.success) {
    return apiError(
      { type: 'VALIDATION_ERROR', message: 'Validation failed', details: result.error.flatten().fieldErrors as Record<string, unknown> },
      400
    )
  }

  const { scenarioIds, counselorIds, dueDate, supervisorNotes } = result.data

  const totalPairs = scenarioIds.length * counselorIds.length
  if (totalPairs > MAX_BULK_ASSIGNMENTS) {
    return apiError(
      { type: 'VALIDATION_ERROR', message: 'Validation failed', details: { bulk: [`Batch too large: maximum ${MAX_BULK_ASSIGNMENTS} assignments per request`] } },
      400
    )
  }

  const counselors = await prisma.user.findMany({
    where: {
      id: { in: counselorIds },
      role: 'counselor',
    },
  })
  if (counselors.length !== counselorIds.length) {
    return apiError(
      { type: 'VALIDATION_ERROR', message: 'Validation failed', details: { counselorIds: ['One or more counselor IDs are invalid or not counselor role'] } },
      400
    )
  }

  const scenarios = await prisma.scenario.findMany({
    where: { id: { in: scenarioIds } },
  })
  if (scenarios.length !== scenarioIds.length) {
    return apiError(
      { type: 'VALIDATION_ERROR', message: 'Validation failed', details: { scenarioIds: ['One or more scenario IDs are invalid'] } },
      400
    )
  }
  const scenarioMap = new Map(scenarios.map(s => [s.id, s]))

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

  const status = skippedPairs.length > 0 ? 207 : 201

  return apiSuccess(responseData, status)
}
