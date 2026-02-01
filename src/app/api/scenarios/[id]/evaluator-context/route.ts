import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiSuccess, apiError, handleApiError, notFound } from '@/lib/api'
import { requireAuth } from '@/lib/auth'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/scenarios/[id]/evaluator-context
 * Get the evaluator context content for a scenario
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params

    const authResult = await requireAuth(request)
    if (authResult.error) return authResult.error

    const scenario = await prisma.scenario.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        evaluatorContextPath: true,
      },
    })

    if (!scenario) {
      return notFound('Scenario not found')
    }

    if (!scenario.evaluatorContextPath) {
      return apiSuccess({
        content: null,
        message: 'No evaluator context available for this scenario',
      })
    }

    // Resolve the file path with security validation
    const allowedBaseDirs = [
      path.resolve(process.cwd(), 'uploads'),
      path.resolve(process.cwd(), 'evaluator-contexts'),
      path.resolve(process.cwd(), 'public'),
    ]

    const rawPath = path.isAbsolute(scenario.evaluatorContextPath)
      ? scenario.evaluatorContextPath
      : path.join(process.cwd(), scenario.evaluatorContextPath)

    // Resolve to absolute path (handles ../ sequences)
    const filePath = path.resolve(rawPath)

    // Security check: ensure resolved path is within allowed directories
    const isWithinAllowedDir = allowedBaseDirs.some(baseDir =>
      filePath.startsWith(baseDir + path.sep) || filePath === baseDir
    )

    if (!isWithinAllowedDir) {
      return apiError(
        { type: 'FORBIDDEN', message: 'Access to this file path is not allowed' },
        403
      )
    }

    if (!existsSync(filePath)) {
      return apiSuccess({
        content: null,
        message: 'Evaluator context file not found',
        path: scenario.evaluatorContextPath,
      })
    }

    // Determine if it's an image or text
    const ext = path.extname(filePath).toLowerCase()
    const isImage = ['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)

    if (isImage) {
      // For images, return base64 encoded data
      const fileBuffer = await readFile(filePath)
      const base64 = fileBuffer.toString('base64')
      const mimeType = ext === '.png' ? 'image/png'
        : ext === '.gif' ? 'image/gif'
        : ext === '.webp' ? 'image/webp'
        : 'image/jpeg'

      return apiSuccess({
        type: 'image',
        content: `data:${mimeType};base64,${base64}`,
        filename: path.basename(filePath),
      })
    } else {
      // For text files, return the content
      const content = await readFile(filePath, 'utf-8')
      return apiSuccess({
        type: 'text',
        content,
        filename: path.basename(filePath),
      })
    }
  } catch (error) {
    return handleApiError(error)
  }
}
