import { NextRequest } from 'next/server'
import { AccessToken, RoomAgentDispatch, RoomConfiguration, TrackSource } from 'livekit-server-sdk'
import { prisma } from '@/lib/prisma'
import { apiSuccess, handleApiError, badRequest, forbidden } from '@/lib/api'
import { requireAuth, canAccessResource } from '@/lib/auth'
import { createLiveKitTokenSchema } from '@/lib/validators'
import crypto from 'crypto'

/**
 * POST /api/livekit/token
 *
 * Generate a LiveKit access token for voice training.
 * Validates user auth and assignment ownership, then creates a token
 * with agent dispatch metadata so the LiveKit agent knows which
 * scenario to load and which session to create.
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    if (authResult.error) return authResult.error
    const user = authResult.user

    const body = await request.json()
    const data = createLiveKitTokenSchema.parse(body)

    const apiKey = process.env.LIVEKIT_API_KEY
    const apiSecret = process.env.LIVEKIT_API_SECRET
    const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL

    if (!apiKey || !apiSecret || !livekitUrl) {
      return badRequest('LiveKit not configured')
    }

    // If assignmentId provided, verify ownership and get scenario
    let scenarioId = data.scenarioId
    if (data.assignmentId) {
      const assignment = await prisma.assignment.findUnique({
        where: { id: data.assignmentId },
        select: {
          learnerId: true,
          scenarioId: true,
          status: true,
        },
      })

      if (!assignment) {
        return badRequest('Assignment not found')
      }

      if (!canAccessResource(user, assignment.learnerId)) {
        return forbidden('Not your assignment')
      }

      scenarioId = assignment.scenarioId
    }

    // Generate unique room name
    const roomName = `training-${crypto.randomUUID().slice(0, 8)}`

    // Build agent dispatch metadata
    const metadata = JSON.stringify({
      assignmentId: data.assignmentId,
      scenarioId,
      userId: user.id,
    })

    // Create access token with agent dispatch
    const at = new AccessToken(apiKey, apiSecret, {
      identity: user.id,
      name: user.displayName || user.externalId,
      ttl: '1h',
    })

    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canPublishSources: [TrackSource.MICROPHONE],
      canSubscribe: true,
    })

    // Configure room with agent dispatch
    const roomConfig = new RoomConfiguration({
      agents: [
        new RoomAgentDispatch({
          agentName: '',
          metadata,
        }),
      ],
    })

    at.roomConfig = roomConfig

    const token = await at.toJwt()

    return apiSuccess({
      token,
      serverUrl: livekitUrl,
      roomName,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
