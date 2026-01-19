import { NextRequest } from 'next/server'
import prisma from '@/lib/prisma'
import { apiSuccess, apiError, handleApiError } from '@/lib/api'
import { updateAssignmentSchema } from '@/lib/validators'
import { getCurrentUser } from '@/lib/auth'
import type { AssignmentResponse, ScenarioMode, AssignmentStatus } from '@/types'

// Valid status transitions
const VALID_TRANSITIONS: Record<string, string[]> = {
  'pending': ['in_progress'],
  'in_progress': ['pending', 'completed'], // pending = supervisor reset
  'completed': [], // Terminal state
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    if (!user) {
      return apiError({ code: 'UNAUTHORIZED', message: 'Not authenticated' }, 401)
    }

    const assignment = await prisma.assignment.findUnique({
      where: { id },
      include: {
        scenario: { select: { title: true, mode: true } },
        counselor: { select: { displayName: true } },
        supervisor: { select: { displayName: true } },
      },
    })

    if (!assignment) {
      return apiError({ code: 'NOT_FOUND', message: 'Assignment not found' }, 404)
    }

    // Authorization: counselors can only view their own assignments
    if (user.role === 'counselor' && assignment.counselorId !== user.id) {
      return apiError({ code: 'UNAUTHORIZED', message: 'Cannot view another user\'s assignment' }, 403)
    }

    // Check for transcript
    let hasTranscript = false
    if (assignment.sessionId) {
      const session = await prisma.session.findFirst({
        where: {
          assignmentId: assignment.id,
          turns: { some: {} },
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
    const user = await getCurrentUser()
    if (!user) {
      return apiError({ code: 'UNAUTHORIZED', message: 'Not authenticated' }, 401)
    }

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
      },
    })

    if (!assignment) {
      return apiError({ code: 'NOT_FOUND', message: 'Assignment not found' }, 404)
    }

    // Authorization check
    if (user.role === 'counselor') {
      // Counselors can only update their own assignments
      if (assignment.counselorId !== user.id) {
        return apiError({ code: 'UNAUTHORIZED', message: 'Cannot update another user\'s assignment' }, 403)
      }
      // Counselors can only update status
      if (result.data.dueDate !== undefined || result.data.supervisorNotes !== undefined) {
        return apiError({ code: 'UNAUTHORIZED', message: 'Counselors can only update status' }, 403)
      }
    }

    const { status, dueDate, supervisorNotes } = result.data

    // Build update data
    const updateData: {
      status?: string
      dueDate?: Date | null
      supervisorNotes?: string | null
      startedAt?: Date | null
    } = {}

    // Handle status transitions
    if (status !== undefined) {
      // Allow no-op if already in requested status
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
          // Supervisor reset for abandoned sessions
          updateData.status = 'pending'
          updateData.startedAt = null
        } else if (status === 'completed') {
          // Cannot manually complete - must go through evaluation endpoint
          return apiError(
            { code: 'VALIDATION_ERROR', fields: { status: ['Cannot manually complete assignment. Complete via evaluation.'] } },
            400
          )
        }
      }
    }

    // Supervisor-only updates
    if (user.role === 'supervisor') {
      if (dueDate !== undefined) {
        updateData.dueDate = dueDate ? new Date(dueDate) : null
      }
      if (supervisorNotes !== undefined) {
        updateData.supervisorNotes = supervisorNotes
      }
    }

    // Only update if there's something to update
    let updatedAssignment = assignment
    if (Object.keys(updateData).length > 0) {
      updatedAssignment = await prisma.assignment.update({
        where: { id },
        data: updateData,
        include: {
          scenario: { select: { title: true, mode: true } },
          counselor: { select: { displayName: true } },
          supervisor: { select: { displayName: true } },
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
    const user = await getCurrentUser()
    if (!user) {
      return apiError({ code: 'UNAUTHORIZED', message: 'Not authenticated' }, 401)
    }

    if (user.role !== 'supervisor') {
      return apiError({ code: 'UNAUTHORIZED', message: 'Only supervisors can delete assignments' }, 403)
    }

    const assignment = await prisma.assignment.findUnique({
      where: { id },
    })

    if (!assignment) {
      return apiError({ code: 'NOT_FOUND', message: 'Assignment not found' }, 404)
    }

    await prisma.assignment.delete({
      where: { id },
    })

    return new Response(null, { status: 204 })
  } catch (error) {
    return handleApiError(error)
  }
}
