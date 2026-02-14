import { NextRequest } from 'next/server'
import prisma from '@/lib/prisma'
import { apiSuccess, apiError, handleApiError, notFound, invalidId } from '@/lib/api'
import { updateScenarioSchema } from '@/lib/validators'
import { requireAuth, requireSupervisor } from '@/lib/auth'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

const ALLOWED_CONTEXT_EXTENSIONS = ['.txt', '.md']
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/scenarios/[id]
 * Get a specific scenario - any authenticated user
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const idError = invalidId(id)
    if (idError) return idError

    const authResult = await requireAuth(request)
    if (authResult.error) return authResult.error

    const scenario = await prisma.scenario.findUnique({
      where: { id },
      include: {
        creator: { select: { displayName: true } },
        account: { select: { name: true } },
      },
    })

    if (!scenario) {
      return notFound('Scenario not found')
    }

    return apiSuccess(scenario)
  } catch (error) {
    return handleApiError(error)
  }
}

/**
 * PUT /api/scenarios/[id]
 * Update a scenario - supervisor only
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const idError = invalidId(id)
    if (idError) return idError

    const authResult = await requireSupervisor(request)
    if (authResult.error) return authResult.error

    const existingScenario = await prisma.scenario.findUnique({
      where: { id },
    })

    if (!existingScenario) {
      return notFound('Scenario not found')
    }

    const body = await request.json()
    const result = updateScenarioSchema.safeParse(body)

    if (!result.success) {
      return apiError(
        { type: 'VALIDATION_ERROR', message: 'Validation failed', details: result.error.flatten().fieldErrors as Record<string, unknown> },
        400
      )
    }

    // Extract accountId separately - Prisma requires string or omission, not null
    const { accountId, ...updateData } = result.data
    const scenario = await prisma.scenario.update({
      where: { id },
      data: accountId ? { ...updateData, accountId } : updateData,
      include: {
        creator: { select: { displayName: true } },
        account: { select: { name: true } },
      },
    })

    return apiSuccess(scenario)
  } catch (error) {
    return handleApiError(error)
  }
}

/**
 * PATCH /api/scenarios/[id]
 * Update scenario with file upload support - supervisor only
 * Accepts multipart form data with optional contextFile (TXT/MD only)
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const idError = invalidId(id)
    if (idError) return idError

    const authResult = await requireSupervisor(request)
    if (authResult.error) return authResult.error

    const existingScenario = await prisma.scenario.findUnique({
      where: { id },
    })

    if (!existingScenario) {
      return notFound('Scenario not found')
    }

    const contentType = request.headers.get('content-type') || ''

    // Handle multipart form data (file upload)
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      const contextFile = formData.get('contextFile') as File | null

      if (!contextFile) {
        return apiError({ type: 'VALIDATION_ERROR', message: 'No file provided' }, 400)
      }

      // Validate file extension
      const fileName = contextFile.name.toLowerCase()
      const ext = path.extname(fileName)
      if (!ALLOWED_CONTEXT_EXTENSIONS.includes(ext)) {
        return apiError(
          { type: 'VALIDATION_ERROR', message: `Invalid file type. Only ${ALLOWED_CONTEXT_EXTENSIONS.join(', ')} files are allowed.` },
          400
        )
      }

      // Validate file size
      if (contextFile.size > MAX_FILE_SIZE) {
        return apiError(
          { type: 'VALIDATION_ERROR', message: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB.` },
          400
        )
      }

      // Save file
      const contextDir = path.join(process.cwd(), 'uploads', 'evaluator_context', id)
      await mkdir(contextDir, { recursive: true })
      const contextPath = path.join(contextDir, 'context.txt')
      const fileContent = await contextFile.text()
      await writeFile(contextPath, fileContent, 'utf-8')

      // Update scenario with file path
      const scenario = await prisma.scenario.update({
        where: { id },
        data: { evaluatorContextPath: contextPath },
        include: {
          creator: { select: { displayName: true } },
          account: { select: { name: true } },
        },
      })

      return apiSuccess(scenario)
    }

    // Handle JSON body (standard update)
    const body = await request.json()
    const result = updateScenarioSchema.safeParse(body)

    if (!result.success) {
      return apiError(
        { type: 'VALIDATION_ERROR', message: 'Validation failed', details: result.error.flatten().fieldErrors as Record<string, unknown> },
        400
      )
    }

    // Extract accountId separately - Prisma requires string or omission, not null
    const { accountId, ...updateData } = result.data
    const scenario = await prisma.scenario.update({
      where: { id },
      data: accountId ? { ...updateData, accountId } : updateData,
      include: {
        creator: { select: { displayName: true } },
        account: { select: { name: true } },
      },
    })

    return apiSuccess(scenario)
  } catch (error) {
    return handleApiError(error)
  }
}

/**
 * DELETE /api/scenarios/[id]
 * Delete a scenario - supervisor only
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const idError = invalidId(id)
    if (idError) return idError

    const authResult = await requireSupervisor(request)
    if (authResult.error) return authResult.error

    const scenario = await prisma.scenario.findUnique({
      where: { id },
    })

    if (!scenario) {
      return notFound('Scenario not found')
    }

    await prisma.scenario.delete({
      where: { id },
    })

    return new Response(null, { status: 204 })
  } catch (error) {
    return handleApiError(error)
  }
}
