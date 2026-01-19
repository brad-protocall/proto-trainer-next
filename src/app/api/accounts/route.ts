import { NextRequest } from 'next/server'
import prisma from '@/lib/prisma'
import { apiSuccess, apiError, handleApiError } from '@/lib/api'
import { createAccountSchema } from '@/lib/validators'

export async function GET() {
  try {
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
    const body = await request.json()
    const result = createAccountSchema.safeParse(body)

    if (!result.success) {
      return apiError(
        { code: 'VALIDATION_ERROR', fields: result.error.flatten().fieldErrors as Record<string, string[]> },
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
