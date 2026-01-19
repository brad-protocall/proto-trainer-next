import { NextRequest } from 'next/server'
import prisma from '@/lib/prisma'
import { apiSuccess, apiError, handleApiError } from '@/lib/api'
import { createUserSchema } from '@/lib/validators'

export async function GET() {
  try {
    const users = await prisma.user.findMany({
      orderBy: { displayName: 'asc' },
    })

    return apiSuccess(users)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const result = createUserSchema.safeParse(body)

    if (!result.success) {
      return apiError(
        { code: 'VALIDATION_ERROR', fields: result.error.flatten().fieldErrors as Record<string, string[]> },
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

    return apiSuccess(user)
  } catch (error) {
    return handleApiError(error)
  }
}
