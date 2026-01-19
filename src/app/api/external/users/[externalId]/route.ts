import { NextRequest } from 'next/server'
import prisma from '@/lib/prisma'
import { apiSuccess, handleApiError, notFound } from '@/lib/api'
import { validateExternalApiKey } from '@/lib/external-auth'

interface RouteParams {
  params: Promise<{ externalId: string }>
}

/**
 * GET /api/external/users/[externalId]
 * Look up a user by their external ID.
 * Used by personalized-training system to map counselor IDs.
 *
 * Auth: X-API-Key header validated against EXTERNAL_API_KEY
 * Returns: { user_id, name, email, role }
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const authError = validateExternalApiKey(request)
    if (authError) return authError

    const { externalId } = await params

    const user = await prisma.user.findUnique({
      where: { externalId },
      select: {
        id: true,
        displayName: true,
        email: true,
        role: true,
      },
    })

    if (!user) {
      return notFound('User not found')
    }

    return apiSuccess({
      user_id: user.id,
      name: user.displayName,
      email: user.email,
      role: user.role,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
