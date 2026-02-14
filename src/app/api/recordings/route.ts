import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiSuccess, handleApiError } from '@/lib/api'
import { requireAuth, requireInternalAuth } from '@/lib/auth'
import { z } from 'zod'

/**
 * Schema for creating a recording
 */
const createRecordingSchema = z.object({
  sessionId: z.string().uuid(),
  filePath: z.string().min(1),
  duration: z.number().int().optional(),
  fileSizeBytes: z.number().int().optional(),
})

/**
 * GET /api/recordings
 * List recordings - supervisors see all, learners see their own
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    if (authResult.error) return authResult.error
    const user = authResult.user

    // Build where clause based on user role
    const where = user.role === 'supervisor'
      ? {}
      : {
          session: {
            OR: [
              { userId: user.id },
              {
                assignment: {
                  learnerId: user.id,
                },
              },
            ],
          },
        }

    const recordings = await prisma.recording.findMany({
      where,
      include: {
        session: {
          select: {
            id: true,
            modelType: true,
            startedAt: true,
            endedAt: true,
            userId: true,
            assignment: {
              select: {
                id: true,
                learnerId: true,
                scenario: {
                  select: {
                    id: true,
                    title: true,
                  },
                },
              },
            },
            scenario: {
              select: {
                id: true,
                title: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return apiSuccess(recordings)
  } catch (error) {
    return handleApiError(error)
  }
}

/**
 * POST /api/recordings
 * Create a recording entry (called by LiveKit agent after saving WAV file)
 * Requires internal service authentication
 */
export async function POST(request: NextRequest) {
  try {
    // Validate internal service call (from LiveKit agent)
    const authResult = requireInternalAuth(request)
    if (authResult.error) return authResult.error

    const body = await request.json()
    const data = createRecordingSchema.parse(body)

    // Verify session exists
    const session = await prisma.session.findUnique({
      where: { id: data.sessionId },
      select: {
        id: true,
        userId: true,
        assignment: {
          select: { learnerId: true },
        },
      },
    })

    if (!session) {
      return apiSuccess({ error: 'Session not found' }, 404)
    }

    // Check if recording already exists for this session
    const existingRecording = await prisma.recording.findUnique({
      where: { sessionId: data.sessionId },
    })

    if (existingRecording) {
      // Update existing recording
      const recording = await prisma.recording.update({
        where: { id: existingRecording.id },
        data: {
          filePath: data.filePath,
          duration: data.duration,
          fileSizeBytes: data.fileSizeBytes,
        },
      })
      return apiSuccess(recording)
    }

    // Create new recording
    const recording = await prisma.recording.create({
      data: {
        sessionId: data.sessionId,
        filePath: data.filePath,
        duration: data.duration,
        fileSizeBytes: data.fileSizeBytes,
      },
    })

    return apiSuccess(recording, 201)
  } catch (error) {
    return handleApiError(error)
  }
}
