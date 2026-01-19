import { apiSuccess, notFoundError, handleApiError } from '@/lib/api'
import { getCurrentUser } from '@/lib/auth'

/**
 * GET /api/users/me
 *
 * Get the current authenticated user.
 * Currently returns the default supervisor user (placeholder until real auth is implemented).
 */
export async function GET() {
  try {
    const user = await getCurrentUser()

    if (!user) {
      return notFoundError('User not found')
    }

    return apiSuccess({
      id: user.id,
      externalId: user.externalId,
      displayName: user.displayName,
      email: user.email,
      role: user.role,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
