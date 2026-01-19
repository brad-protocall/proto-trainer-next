import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import type { ApiError, ApiResponse } from '@/types';

/**
 * Creates a successful API response
 */
export function apiSuccess<T>(data: T, status = 200): NextResponse<ApiResponse<T>> {
  return NextResponse.json({ ok: true, data } as ApiResponse<T>, { status });
}

/**
 * Creates an error API response
 */
export function apiError(
  error: ApiError,
  status: number
): NextResponse<ApiResponse<never>> {
  return NextResponse.json({ ok: false, error } as ApiResponse<never>, { status });
}

/**
 * Maps error types to HTTP status codes
 */
function getStatusCode(type: ApiError['type']): number {
  switch (type) {
    case 'VALIDATION_ERROR':
      return 400;
    case 'UNAUTHORIZED':
      return 401;
    case 'NOT_FOUND':
      return 404;
    case 'CONFLICT':
      return 409;
    case 'INTERNAL_ERROR':
    default:
      return 500;
  }
}

/**
 * Handles errors and returns appropriate API response
 * Catches ZodError and PrismaClientKnownRequestError specifically
 */
export function handleApiError(error: unknown): NextResponse<ApiResponse<never>> {
  console.error('API Error:', error);

  // Handle Zod validation errors
  if (error instanceof ZodError) {
    return apiError(
      {
        type: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: {
          issues: error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
      },
      400
    );
  }

  // Handle Prisma errors
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002': // Unique constraint violation
        return apiError(
          {
            type: 'CONFLICT',
            message: 'A record with this value already exists',
            details: { code: error.code, meta: error.meta },
          },
          409
        );
      case 'P2025': // Record not found
        return apiError(
          {
            type: 'NOT_FOUND',
            message: 'Record not found',
            details: { code: error.code },
          },
          404
        );
      default:
        return apiError(
          {
            type: 'INTERNAL_ERROR',
            message: 'Database error',
            details: { code: error.code },
          },
          500
        );
    }
  }

  // Handle generic errors
  if (error instanceof Error) {
    return apiError(
      {
        type: 'INTERNAL_ERROR',
        message: error.message,
      },
      500
    );
  }

  // Handle unknown errors
  return apiError(
    {
      type: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
    500
  );
}

/**
 * Helper to create typed error responses
 */
export function notFound(message = 'Resource not found'): NextResponse<ApiResponse<never>> {
  return apiError({ type: 'NOT_FOUND', message }, 404);
}

export function unauthorized(message = 'Unauthorized'): NextResponse<ApiResponse<never>> {
  return apiError({ type: 'UNAUTHORIZED', message }, 401);
}

export function validationError(
  message: string,
  details?: Record<string, unknown>
): NextResponse<ApiResponse<never>> {
  return apiError({ type: 'VALIDATION_ERROR', message, details }, 400);
}

export function conflict(message: string): NextResponse<ApiResponse<never>> {
  return apiError({ type: 'CONFLICT', message }, 409);
}

export function internalError(message = 'Internal server error'): NextResponse<ApiResponse<never>> {
  return apiError({ type: 'INTERNAL_ERROR', message }, 500);
}
