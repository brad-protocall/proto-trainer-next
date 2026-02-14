import type { AssignmentResponse, ScenarioMode, AssignmentStatus } from '@/types'

/**
 * Input type for buildAssignmentResponse - matches Prisma query with includes
 */
export interface AssignmentWithRelations {
  id: string
  accountId: string | null
  scenarioId: string
  learnerId: string
  assignedBy: string
  status: string
  createdAt: Date
  dueDate: Date | null
  startedAt: Date | null
  completedAt: Date | null
  supervisorNotes: string | null
  requireRecording: boolean
  scenario: { title: string; mode: string }
  learner: { displayName: string | null }
  supervisor: { displayName: string | null }
  session?: { id: string; recording?: { id: string } | null } | null
  evaluation?: { id: string } | null
}

/**
 * Transforms a Prisma assignment with relations into API response format
 */
export function buildAssignmentResponse(
  assignment: AssignmentWithRelations,
  hasTranscript = false
): AssignmentResponse {
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
    learnerId: assignment.learnerId,
    learnerName: assignment.learner.displayName,
    assignedBy: assignment.assignedBy,
    assignedByName: assignment.supervisor.displayName,
    status: assignment.status as AssignmentStatus,
    createdAt: assignment.createdAt.toISOString(),
    dueDate: assignment.dueDate?.toISOString() ?? null,
    startedAt: assignment.startedAt?.toISOString() ?? null,
    completedAt: assignment.completedAt?.toISOString() ?? null,
    sessionId: assignment.session?.id ?? null,
    evaluationId: assignment.evaluation?.id ?? null,
    recordingId: assignment.session?.recording?.id ?? null,
    supervisorNotes: assignment.supervisorNotes,
    requireRecording: assignment.requireRecording,
    isOverdue,
    hasTranscript,
  }
}
