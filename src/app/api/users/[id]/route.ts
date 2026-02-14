import { NextRequest } from 'next/server'
import prisma from '@/lib/prisma'
import { apiSuccess, apiError, handleApiError, notFound, forbidden } from '@/lib/api'
import { updateUserSchema } from '@/lib/validators'
import { requireAuth, requireSupervisor, canAccessResource } from '@/lib/auth'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/users/[id]
 * Get a specific user - supervisor or self
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params

    const authResult = await requireAuth(request)
    if (authResult.error) return authResult.error
    const currentUser = authResult.user

    // Check access - supervisor or self
    if (!canAccessResource(currentUser, id)) {
      return forbidden('Cannot view another user\'s profile')
    }

    const user = await prisma.user.findUnique({
      where: { id },
    })

    if (!user) {
      return notFound('User not found')
    }

    return apiSuccess(user)
  } catch (error) {
    return handleApiError(error)
  }
}

/**
 * PUT /api/users/[id]
 * Update a user - supervisor or self
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params

    const authResult = await requireAuth(request)
    if (authResult.error) return authResult.error
    const currentUser = authResult.user

    // Check access - supervisor or self
    if (!canAccessResource(currentUser, id)) {
      return forbidden('Cannot update another user\'s profile')
    }

    const existingUser = await prisma.user.findUnique({
      where: { id },
    })

    if (!existingUser) {
      return notFound('User not found')
    }

    const body = await request.json()
    const result = updateUserSchema.safeParse(body)

    if (!result.success) {
      return apiError(
        { type: 'VALIDATION_ERROR', message: 'Validation failed', details: result.error.flatten().fieldErrors as Record<string, unknown> },
        400
      )
    }

    // Learners cannot change their own role
    if (currentUser.role === 'learner' && result.data.role !== undefined) {
      return forbidden('Learners cannot change their role')
    }

    const user = await prisma.user.update({
      where: { id },
      data: {
        displayName: result.data.displayName,
        email: result.data.email,
        role: result.data.role,
      },
    })

    return apiSuccess(user)
  } catch (error) {
    return handleApiError(error)
  }
}

/**
 * DELETE /api/users/[id]
 * Delete a user - supervisor only
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params

    const authResult = await requireSupervisor(request)
    if (authResult.error) return authResult.error

    const user = await prisma.user.findUnique({
      where: { id },
    })

    if (!user) {
      return notFound('User not found')
    }

    await prisma.user.delete({
      where: { id },
    })

    return new Response(null, { status: 204 })
  } catch (error) {
    return handleApiError(error)
  }
}
