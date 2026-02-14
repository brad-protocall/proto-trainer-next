import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { badRequest, notFound, forbidden, handleApiError, invalidId } from '@/lib/api'
import { requireAuth, canAccessResource } from '@/lib/auth'
import { createReadStream, statSync } from 'fs'
import path from 'path'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/recordings/[id]/download
 * Download a recording with Range header support for streaming
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await requireAuth(request)
    if (authResult.error) return authResult.error
    const user = authResult.user

    const { id } = await params
    const idError = invalidId(id)
    if (idError) return idError

    // Validate id is a UUID (prevents Content-Disposition header injection)
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return badRequest('Invalid recording ID format')
    }

    // Find recording
    const recording = await prisma.recording.findUnique({
      where: { id },
      include: {
        session: {
          select: {
            userId: true,
            assignment: {
              select: { learnerId: true },
            },
          },
        },
      },
    })

    if (!recording) {
      return notFound('Recording not found')
    }

    // Check authorization - learners can only download their own recordings
    const ownerId = recording.session.assignment?.learnerId ?? recording.session.userId
    if (ownerId && !canAccessResource(user, ownerId)) {
      return forbidden('Access denied')
    }

    // Get file path with security validation
    const allowedBaseDir = path.resolve(process.cwd(), 'uploads', 'recordings')
    const rawPath = path.join(process.cwd(), recording.filePath)
    const filePath = path.resolve(rawPath)

    // Security check: ensure resolved path is within recordings directory
    if (!filePath.startsWith(allowedBaseDir + path.sep) && filePath !== allowedBaseDir) {
      return forbidden('Access to this file path is not allowed')
    }

    // Detect content type from file extension
    const isWebm = filePath.endsWith('.webm')
    const contentType = isWebm ? 'audio/webm' : 'audio/wav'
    const fileExt = isWebm ? 'webm' : 'wav'

    // Check if file exists and get stats
    let stat
    try {
      stat = statSync(filePath)
    } catch {
      return notFound('Recording file not found')
    }

    const fileSize = stat.size
    const range = request.headers.get('range')

    // Parse Range header if present
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-')
      const start = parseInt(parts[0], 10)
      const rawEnd = parts[1] ? parseInt(parts[1], 10) : fileSize - 1

      // Validate parsed values
      if (isNaN(start) || isNaN(rawEnd) || start < 0) {
        return new Response('Range not satisfiable', {
          status: 416,
          headers: {
            'Content-Range': `bytes */${fileSize}`,
          },
        })
      }

      // Clamp end to file bounds
      const end = Math.min(rawEnd, fileSize - 1)

      if (start >= fileSize || start > end) {
        return new Response('Range not satisfiable', {
          status: 416,
          headers: {
            'Content-Range': `bytes */${fileSize}`,
          },
        })
      }

      const chunkSize = end - start + 1
      const stream = createReadStream(filePath, { start, end })

      // Convert Node stream to Web ReadableStream
      const webStream = new ReadableStream({
        start(controller) {
          stream.on('data', (chunk) => controller.enqueue(chunk))
          stream.on('end', () => controller.close())
          stream.on('error', (err) => controller.error(err))
        },
      })

      return new Response(webStream, {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': String(chunkSize),
          'Content-Type': contentType,
          'Content-Disposition': `attachment; filename="${id}.${fileExt}"`,
        },
      })
    }

    // No Range header - return full file
    const stream = createReadStream(filePath)
    const webStream = new ReadableStream({
      start(controller) {
        stream.on('data', (chunk) => controller.enqueue(chunk))
        stream.on('end', () => controller.close())
        stream.on('error', (err) => controller.error(err))
      },
    })

    return new Response(webStream, {
      status: 200,
      headers: {
        'Accept-Ranges': 'bytes',
        'Content-Length': String(fileSize),
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${id}.${fileExt}"`,
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
