import { NextRequest } from 'next/server'
import prisma from '@/lib/prisma'
import { apiSuccess, apiError, handleApiError } from '@/lib/api'
import { requireSupervisor } from '@/lib/auth'
import { createAccountSchema } from '@/lib/validators'

export async function GET(request: NextRequest) {
  try {
    // Only supervisors can list accounts
    const authResult = await requireSupervisor(request)
    if (authResult.error) return authResult.error

    const accounts = await prisma.account.findMany({
      orderBy: { name: 'asc' },
    })

    return apiSuccess(accounts)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    // Only supervisors can create accounts
    const authResult = await requireSupervisor(request)
    if (authResult.error) return authResult.error

    const body = await request.json()
    const result = createAccountSchema.safeParse(body)

    if (!result.success) {
      return apiError(
        { type: 'VALIDATION_ERROR', message: 'Validation failed', details: result.error.flatten().fieldErrors as Record<string, unknown> },
        400
      )
    }

    const account = await prisma.account.create({
      data: {
        name: result.data.name,
        policiesProceduresPath: result.data.policiesProceduresPath,
      },
    })

    return apiSuccess(account)
  } catch (error) {
    return handleApiError(error)
  }
}
