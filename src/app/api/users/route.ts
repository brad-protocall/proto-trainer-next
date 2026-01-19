import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiSuccess, handleApiError, validationError } from '@/lib/api'
import { createUserSchema, userQuerySchema } from '@/lib/validators'

/**
 * GET /api/users
 *
 * List all users, optionally filtered by role and sorted.
 * Query params:
 *   - role: 'supervisor' | 'counselor' (optional)
 *   - orderBy: 'name' | 'created_at' (default: 'name')
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = Object.fromEntries(request.nextUrl.searchParams)
    const queryResult = userQuerySchema.safeParse(searchParams)

    // Extract validated query params (use defaults if validation fails)
    const { role, orderBy } = queryResult.success
      ? queryResult.data
      : { role: undefined, orderBy: 'name' as const }

    const users = await prisma.user.findMany({
      where: role ? { role } : undefined,
      orderBy:
        orderBy === 'created_at'
          ? { createdAt: 'desc' }
          : { displayName: 'asc' },
      select: {
        id: true,
        externalId: true,
        displayName: true,
        email: true,
        role: true,
        createdAt: true,
      },
    })

    return apiSuccess(users)
  } catch (error) {
    return handleApiError(error)
  }
}

/**
 * POST /api/users
 *
 * Create a new user.
 * Body:
 *   - externalId: string (required, unique)
 *   - displayName: string (optional)
 *   - email: string (optional)
 *   - role: 'supervisor' | 'counselor' (default: 'counselor')
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)

    if (!body) {
      return validationError('Invalid JSON body')
    }

    const result = createUserSchema.safeParse(body)

    if (!result.success) {
      return validationError('Validation failed', result.error.flatten().fieldErrors as Record<string, string[]>)
    }

    const user = await prisma.user.create({
      data: {
        externalId: result.data.externalId,
        displayName: result.data.displayName,
        email: result.data.email,
        role: result.data.role,
      },
      select: {
        id: true,
        externalId: true,
        displayName: true,
        email: true,
        role: true,
        createdAt: true,
      },
    })

    return apiSuccess(user)
  } catch (error) {
    return handleApiError(error)
  }
}
