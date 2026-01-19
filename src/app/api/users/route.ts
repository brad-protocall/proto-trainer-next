import { NextRequest } from 'next/server'
import prisma from '@/lib/prisma'
import { apiSuccess, apiError, handleApiError } from '@/lib/api'
import { createUserSchema } from '@/lib/validators'
import { requireSupervisor } from '@/lib/auth'

/**
 * GET /api/users
 * List all users - supervisor only
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireSupervisor(request)
    if (authResult.error) return authResult.error

    const users = await prisma.user.findMany({
      orderBy: { displayName: 'asc' },
    })

    return apiSuccess(users)
  } catch (error) {
    return handleApiError(error)
  }
}

/**
 * POST /api/users
 * Create a new user - supervisor only
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireSupervisor(request)
    if (authResult.error) return authResult.error

    const body = await request.json()
    const result = createUserSchema.safeParse(body)

    if (!result.success) {
      return apiError(
        { type: 'VALIDATION_ERROR', message: 'Validation failed', details: result.error.flatten().fieldErrors as Record<string, unknown> },
        400
      )
    }

    const user = await prisma.user.create({
      data: {
        externalId: result.data.externalId,
        displayName: result.data.displayName,
        email: result.data.email,
        role: result.data.role,
      },
    })

    return apiSuccess(user, 201)
  } catch (error) {
    return handleApiError(error)
  }
}
