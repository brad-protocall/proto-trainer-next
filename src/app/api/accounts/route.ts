import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiSuccess, handleApiError, validationError } from '@/lib/api'
import { createAccountSchema } from '@/lib/validators'

/**
 * GET /api/accounts
 *
 * List all accounts, ordered by name.
 */
export async function GET() {
  try {
    const accounts = await prisma.account.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        policiesProceduresPath: true,
        policiesVectorFileId: true,
      },
    })

    return apiSuccess(accounts)
  } catch (error) {
    return handleApiError(error)
  }
}

/**
 * POST /api/accounts
 *
 * Create a new account.
 * Body:
 *   - name: string (required)
 *   - policiesProceduresPath: string (optional)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)

    if (!body) {
      return validationError('Invalid JSON body')
    }

    const result = createAccountSchema.safeParse(body)

    if (!result.success) {
      return validationError('Validation failed', result.error.flatten().fieldErrors as Record<string, string[]>)
    }

    const account = await prisma.account.create({
      data: {
        name: result.data.name,
        policiesProceduresPath: result.data.policiesProceduresPath,
      },
      select: {
        id: true,
        name: true,
        policiesProceduresPath: true,
        policiesVectorFileId: true,
      },
    })

    return apiSuccess(account)
  } catch (error) {
    return handleApiError(error)
  }
}
