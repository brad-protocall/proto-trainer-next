import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiSuccess, badRequest, notFound, forbidden, handleApiError } from '@/lib/api'
import { requireAuth, canAccessResource } from '@/lib/auth'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { z } from 'zod'

const MAX_FILE_SIZE = 25 * 1024 * 1024 // 25MB

const sessionIdSchema = z.string().uuid()

/**
 * POST /api/recordings/upload
 * Browser-side recording upload. Accepts FormData with audio blob.
 * Auth: user auth (x-user-id header)
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    if (authResult.error) return authResult.error
    const user = authResult.user

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const rawSessionId = formData.get('sessionId') as string | null

    if (!file || !rawSessionId) {
      return badRequest('Missing file or sessionId')
    }

    // Validate sessionId is a UUID (prevents path traversal)
    const parseResult = sessionIdSchema.safeParse(rawSessionId)
    if (!parseResult.success) {
      return badRequest('Invalid sessionId format')
    }
    const sessionId = parseResult.data

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      return badRequest(`File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`)
    }

    if (file.size === 0) {
      return badRequest('Empty file')
    }

    // Verify session exists and user owns it
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        userId: true,
        assignment: { select: { counselorId: true } },
      },
    })

    if (!session) {
      return notFound('Session not found')
    }

    const ownerId = session.assignment?.counselorId ?? session.userId
    if (ownerId && !canAccessResource(user, ownerId)) {
      return forbidden('Access denied')
    }

    // Determine file extension from MIME type
    const ext = file.type === 'audio/ogg' ? 'ogg' : 'webm'
    const relPath = `uploads/recordings/${sessionId}.${ext}`
    const absPath = path.resolve(process.cwd(), relPath)

    // Security: verify resolved path is within uploads/recordings/
    const allowedDir = path.resolve(process.cwd(), 'uploads', 'recordings')
    if (!absPath.startsWith(allowedDir + path.sep)) {
      return forbidden('Invalid file path')
    }

    // Write file to disk
    await mkdir(path.dirname(absPath), { recursive: true })
    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(absPath, buffer)

    // Upsert recording (atomic — handles concurrent uploads)
    const recording = await prisma.recording.upsert({
      where: { sessionId },
      create: {
        sessionId,
        filePath: relPath,
        fileSizeBytes: file.size,
      },
      update: {
        filePath: relPath,
        fileSizeBytes: file.size,
      },
    })

    return apiSuccess(recording, 201)
  } catch (error) {
    return handleApiError(error)
  }
}
