import { NextRequest } from 'next/server'
import prisma from '@/lib/prisma'
import { apiSuccess, apiError, handleApiError, notFound, forbidden } from '@/lib/api'
import { updateAssignmentSchema } from '@/lib/validators'
import { requireAuth, requireSupervisor, canAccessResource } from '@/lib/auth'
import type { AssignmentResponse, ScenarioMode, AssignmentStatus } from '@/types'

const VALID_TRANSITIONS: Record<string, string[]> = {
  'pending': ['in_progress'],
  'in_progress': ['pending', 'completed'],
  'completed': [],
}

function canTransitionTo(currentStatus: string, newStatus: string): boolean {
  return VALID_TRANSITIONS[currentStatus]?.includes(newStatus) ?? false
}

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
    isOverdue,
    hasTranscript,
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const authResult = await requireAuth(request)
    if (authResult.error) return authResult.error
    const user = authResult.user

    const assignment = await prisma.assignment.findUnique({
      where: { id },
      include: {
        scenario: { select: { title: true, mode: true } },
        counselor: { select: { displayName: true } },
        supervisor: { select: { displayName: true } },
        session: { select: { id: true } },
        evaluation: { select: { id: true } },
      },
    })

    if (!assignment) {
      return notFound('Assignment not found')
    }

    // Counselors can only view their own assignments
    if (!canAccessResource(user, assignment.counselorId)) {
      return forbidden('Cannot view another user\'s assignment')
    }

    // Check for transcript
    let hasTranscript = false
    if (assignment.session) {
      const session = await prisma.session.findFirst({
        where: {
          assignmentId: assignment.id,
          transcript: { some: {} },
        },
      })
      hasTranscript = session !== null
    }

    return apiSuccess(buildAssignmentResponse(assignment, hasTranscript))
  } catch (error) {
    return handleApiError(error)
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const authResult = await requireAuth(request)
    if (authResult.error) return authResult.error
    const user = authResult.user

    const body = await request.json()
    const result = updateAssignmentSchema.safeParse(body)

    if (!result.success) {
      return apiError(
        { code: 'VALIDATION_ERROR', fields: result.error.flatten().fieldErrors as Record<string, string[]> },
        400
      )
    }

    const assignment = await prisma.assignment.findUnique({
      where: { id },
      include: {
        scenario: { select: { title: true, mode: true } },
        counselor: { select: { displayName: true } },
        supervisor: { select: { displayName: true } },
        session: { select: { id: true } },
        evaluation: { select: { id: true } },
      },
    })

    if (!assignment) {
      return notFound('Assignment not found')
    }

    // Authorization check
    if (user.role === 'counselor') {
      if (assignment.counselorId !== user.id) {
        return forbidden('Cannot update another user\'s assignment')
      }
      // Counselors can only update status
      if (result.data.dueDate !== undefined || result.data.supervisorNotes !== undefined) {
        return forbidden('Counselors can only update status')
      }
    }

    const { status, dueDate, supervisorNotes } = result.data

    const updateData: {
      status?: string
      dueDate?: Date | null
      supervisorNotes?: string | null
      startedAt?: Date | null
      completedAt?: Date | null
    } = {}

    if (status !== undefined) {
      if (assignment.status !== status) {
        if (!canTransitionTo(assignment.status, status)) {
          return apiError(
            { code: 'VALIDATION_ERROR', fields: { status: [`Invalid status transition: ${assignment.status} -> ${status}`] } },
            400
          )
        }

        if (status === 'in_progress') {
          updateData.status = 'in_progress'
          updateData.startedAt = new Date()
        } else if (status === 'pending') {
          updateData.status = 'pending'
          updateData.startedAt = null
        } else if (status === 'completed') {
          return apiError(
            { code: 'VALIDATION_ERROR', fields: { status: ['Cannot manually complete assignment. Complete via evaluation.'] } },
            400
          )
        }
      }
    }

    if (user.role === 'supervisor') {
      if (dueDate !== undefined) {
        updateData.dueDate = dueDate ? new Date(dueDate) : null
      }
      if (supervisorNotes !== undefined) {
        updateData.supervisorNotes = supervisorNotes
      }
    }

    let updatedAssignment = assignment
    if (Object.keys(updateData).length > 0) {
      updatedAssignment = await prisma.assignment.update({
        where: { id },
        data: updateData,
        include: {
          scenario: { select: { title: true, mode: true } },
          counselor: { select: { displayName: true } },
          supervisor: { select: { displayName: true } },
          session: { select: { id: true } },
          evaluation: { select: { id: true } },
        },
      })
    }

    return apiSuccess(buildAssignmentResponse(updatedAssignment))
  } catch (error) {
    return handleApiError(error)
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const authResult = await requireSupervisor(request)
    if (authResult.error) return authResult.error

    const assignment = await prisma.assignment.findUnique({
      where: { id },
    })

    if (!assignment) {
      return notFound('Assignment not found')
    }

    await prisma.assignment.delete({
      where: { id },
    })

    return new Response(null, { status: 204 })
  } catch (error) {
    return handleApiError(error)
  }
}
