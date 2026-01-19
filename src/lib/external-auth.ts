import { NextRequest } from 'next/server'
import { apiError } from './api'

/**
 * Validate API key for external service-to-service calls.
 * Returns null if valid, error Response if invalid.
 */
export function validateExternalApiKey(request: NextRequest): Response | null {
  const apiKey = request.headers.get('X-API-Key')
  const expectedKey = process.env.EXTERNAL_API_KEY

  if (!expectedKey) {
    console.error('EXTERNAL_API_KEY not configured')
    return apiError({ type: 'INTERNAL_ERROR', message: 'External API not configured' }, 500)
  }

  if (!apiKey) {
    return apiError({ type: 'UNAUTHORIZED', message: 'Missing API key' }, 401)
  }

  if (apiKey !== expectedKey) {
    return apiError({ type: 'UNAUTHORIZED', message: 'Invalid API key' }, 401)
  }

  return null
}
