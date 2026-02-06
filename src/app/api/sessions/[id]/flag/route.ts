import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiSuccess, handleApiError, notFound, forbidden } from '@/lib/api'
import { requireAuth, canAccessResource } from '@/lib/auth'
import { createFlagSchema } from '@/lib/validators'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/sessions/[id]/flag
 * Counselor submits feedback about a session.
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
    const ownerId = session.assignment?.counselorId ?? session.userId
    if (!ownerId) {
      return notFound('Session not found')
    }
    if (!canAccessResource(user, ownerId)) {
      return forbidden('Cannot submit feedback for another user\'s session')
    }

    // Auto-escalation: ai_guidance_concern is always critical
    const severity = parsed.type === 'ai_guidance_concern' ? 'critical' : 'info'

    const flag = await prisma.sessionFlag.create({
      data: {
        sessionId: id,
        type: parsed.type,
        severity,
        details: parsed.details,
        status: 'pending',
      },
    })

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
