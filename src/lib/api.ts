import { ZodError } from 'zod'
import { Prisma } from '@prisma/client'
import type { ApiError, ApiResponse, ValidationError } from '@/types'

// =============================================================================
// API Response Helpers
// =============================================================================

/**
 * Creates a successful API response
 */
export function apiSuccess<T>(data: T): Response {
  const body: ApiResponse<T> = { ok: true, data }
  return Response.json(body, { status: 200 })
}

/**
 * Creates an error API response
 */
export function apiError(error: ApiError, status: number = 400): Response {
  const body: ApiResponse<never> = { ok: false, error }
  return Response.json(body, { status })
}

// =============================================================================
// Specific Error Helpers
// =============================================================================

export function validationError(
  message: string,
  details?: Record<string, string[]>
): Response {
  return apiError(
    { code: 'VALIDATION_ERROR', message, details },
    400
  )
}

export function notFoundError(message: string, resource?: string): Response {
  return apiError({ code: 'NOT_FOUND', message, resource }, 404)
}

export function unauthorizedError(message: string = 'Unauthorized'): Response {
  return apiError({ code: 'UNAUTHORIZED', message }, 401)
}

export function conflictError(message: string, field?: string): Response {
  return apiError({ code: 'CONFLICT', message, field }, 409)
}

export function internalError(message: string = 'Internal server error'): Response {
  return apiError({ code: 'INTERNAL_ERROR', message }, 500)
}

// =============================================================================
// Error Handler
// =============================================================================

/**
 * Handles unknown errors and converts them to appropriate API responses.
 * Catches ZodError and PrismaClientKnownRequestError specifically.
 */
export function handleApiError(error: unknown): Response {
  // Handle Zod validation errors
  if (error instanceof ZodError) {
    const details: Record<string, string[]> = {}

    for (const issue of error.issues) {
      const path = issue.path.join('.') || 'value'
      if (!details[path]) {
        details[path] = []
      }
      details[path].push(issue.message)
    }

    const validationErr: ValidationError = {
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      details,
    }

    return apiError(validationErr, 400)
  }

  // Handle Prisma known request errors
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002': {
        // Unique constraint violation
        const target = error.meta?.target
        const field = Array.isArray(target) ? target.join(', ') : String(target || 'field')
        return conflictError(`A record with this ${field} already exists`, field)
      }
      case 'P2025': {
        // Record not found
        return notFoundError('Record not found')
      }
      case 'P2003': {
        // Foreign key constraint violation
        return apiError(
          { code: 'VALIDATION_ERROR', message: 'Referenced record does not exist' },
          400
        )
      }
      default: {
        console.error('Prisma error:', error.code, error.message)
        return internalError('Database error')
      }
    }
  }

  // Handle Prisma validation errors
  if (error instanceof Prisma.PrismaClientValidationError) {
    console.error('Prisma validation error:', error.message)
    return validationError('Invalid data format')
  }

  // Handle standard Error instances
  if (error instanceof Error) {
    console.error('Unhandled error:', error.message)
    // Don't expose internal error messages in production
    if (process.env.NODE_ENV === 'development') {
      return internalError(error.message)
    }
    return internalError()
  }

  // Unknown error type
  console.error('Unknown error:', error)
  return internalError()
}

// =============================================================================
// Request Body Parser Helper
// =============================================================================

/**
 * Safely parses JSON from a Request body
 */
export async function parseJsonBody<T>(request: Request): Promise<T | null> {
  try {
    return await request.json() as T
  } catch {
    return null
  }
}
