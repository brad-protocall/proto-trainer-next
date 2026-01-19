import { ApiError, ApiResponse } from '@/types'
import { ZodError } from 'zod'
import { Prisma } from '@prisma/client'

export function apiSuccess<T>(data: T): Response {
  return Response.json({ ok: true, data } satisfies ApiResponse<T>)
}

export function apiError(error: ApiError, status = 400): Response {
  return Response.json({ ok: false, error } satisfies ApiResponse<never>, { status })
}

export function handleApiError(error: unknown): Response {
  console.error('API Error:', error)

  if (error instanceof ZodError) {
    return apiError(
      { code: 'VALIDATION_ERROR', fields: error.flatten().fieldErrors as Record<string, string[]> },
      400
    )
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002':
        return apiError({ code: 'CONFLICT', message: 'Already exists' }, 409)
      case 'P2025':
        return apiError({ code: 'NOT_FOUND', message: 'Not found' }, 404)
    }
  }

  return apiError({ code: 'INTERNAL_ERROR', message: 'Internal server error' }, 500)
}
