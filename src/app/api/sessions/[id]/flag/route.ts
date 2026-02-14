import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiSuccess, handleApiError, notFound, forbidden } from '@/lib/api'
import { requireAuth, canAccessResource } from '@/lib/auth'
import { createFlagSchema } from '@/lib/validators'
import { notifyFlag } from '@/lib/notifications'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/sessions/[id]/flag
 * Learner submits feedback about a session.
 * Auto-escalation: ai_guidance_concern → severity: critical
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params

    const authResult = await requireAuth(request)
    if (authResult.error) return authResult.error
    const user = authResult.user

    // Validate request body
    const body = await request.json()
    const parsed = createFlagSchema.parse(body)

    // Get session and check ownership
    const session = await prisma.session.findUnique({
      where: { id },
      include: {
        assignment: true,
      },
    })

    if (!session) {
      return notFound('Session not found')
    }

    // Auth: session owner or supervisor
    const ownerId = session.assignment?.learnerId ?? session.userId
    if (!ownerId) {
      return notFound('Session not found')
    }
    if (!canAccessResource(user, ownerId)) {
      return forbidden('Cannot submit feedback for another user\'s session')
    }

    // Auto-escalation by type
    const severity = parsed.type === 'ai_guidance_concern' ? 'critical'
      : parsed.type === 'voice_technical_issue' ? 'warning'
      : 'info'

    const flag = await prisma.sessionFlag.create({
      data: {
        sessionId: id,
        type: parsed.type,
        severity,
        details: parsed.details,
        status: 'pending',
        source: 'user_feedback' as const,
      },
    })

    // Console log + email notification (non-blocking)
    const learnerName = user.displayName || user.externalId
    console.log(`\n🚩 SESSION FLAG CREATED`)
    console.log(`   Type: ${flag.type} | Severity: ${flag.severity}`)
    console.log(`   Learner: ${learnerName}`)
    console.log(`   Session: ${id}`)
    console.log(`   Details: ${flag.details}\n`)

    // Send email notification (fire-and-forget, never blocks response)
    notifyFlag({
      flagId: flag.id,
      type: flag.type,
      severity: flag.severity,
      details: flag.details,
      sessionId: id,
      learnerName,
    }).catch(err => console.error('Flag notification failed:', err))

    return apiSuccess({
      id: flag.id,
      type: flag.type,
      severity: flag.severity,
      status: flag.status,
    }, 201)
  } catch (error) {
    return handleApiError(error)
  }
}
