import type { ApiError, ApiResponse } from '@/types'
import { ZodError } from 'zod'
import { Prisma } from '@prisma/client'

export function apiSuccess<T>(data: T, status = 200): Response {
  return Response.json({ ok: true, data } satisfies ApiResponse<T>, { status })
}

export function apiError(error: ApiError, status = 400): Response {
  return Response.json({ ok: false, error } satisfies ApiResponse<never>, { status })
}

// Convenience helpers
export function notFound(message: string): Response {
  return apiError({ type: 'NOT_FOUND', message }, 404)
}

export function conflict(message: string): Response {
  return apiError({ type: 'CONFLICT', message }, 409)
}

export function unauthorized(message: string): Response {
  return apiError({ type: 'UNAUTHORIZED', message }, 401)
}

export function forbidden(message: string): Response {
  return apiError({ type: 'FORBIDDEN', message }, 403)
}

export function badRequest(message: string): Response {
  return apiError({ type: 'VALIDATION_ERROR', message }, 400)
}

// UUID validation for route params — returns a 400 Response if invalid, undefined if valid
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function invalidId(id: string): Response | undefined {
  if (!UUID_RE.test(id)) return badRequest('Invalid ID format')
}

export function handleApiError(error: unknown): Response {
  console.error('API Error:', error)

  if (error instanceof ZodError) {
    return apiError(
      { type: 'VALIDATION_ERROR', message: 'Validation failed', details: error.flatten().fieldErrors as Record<string, unknown> },
      400
    )
  }

  if (error instanceof SyntaxError && error.message.includes('JSON')) {
    return apiError({ type: 'VALIDATION_ERROR', message: 'Invalid JSON in request body' }, 400)
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002': {
        const meta = error.meta?.target
        const target = Array.isArray(meta) ? meta.join(', ') : 'record'
        return conflict(`${target} already exists`)
      }
      case 'P2025':
        return apiError({ type: 'NOT_FOUND', message: 'Not found' }, 404)
    }
  }

  return apiError({ type: 'INTERNAL_ERROR', message: 'Internal server error' }, 500)
}
