import { NextRequest } from 'next/server'
import { timingSafeEqual, createHash } from 'crypto'
import { apiError } from '@/lib/api'
import prisma from '@/lib/prisma'

/**
 * Timing-safe API key comparison to prevent timing attacks.
 * Uses SHA-256 hashing to ensure constant-time comparison regardless of key lengths.
 */
export function validateApiKey(request: NextRequest): boolean {
  const apiKey = request.headers.get('X-API-Key')
  const expectedKey = process.env.EXTERNAL_API_KEY

  if (!apiKey || !expectedKey) {
    return false
  }

  // Hash both keys to ensure constant-length comparison (prevents length oracle)
  const providedHash = createHash('sha256').update(apiKey).digest()
  const expectedHash = createHash('sha256').update(expectedKey).digest()

  return timingSafeEqual(providedHash, expectedHash)
}

/**
 * Require valid external API key - returns error response if invalid
 */
export function requireExternalApiKey(request: NextRequest): Response | null {
  if (!validateApiKey(request)) {
    return apiError({ type: 'UNAUTHORIZED', message: 'Invalid or missing API key' }, 401)
  }
  return null
}

/**
 * Validate internal service calls (from LiveKit agent).
 * Uses a separate internal API key for service-to-service auth.
 */
export function validateInternalServiceKey(request: NextRequest): boolean {
  const serviceKey = request.headers.get('X-Internal-Service-Key')
  const expectedKey = process.env.INTERNAL_SERVICE_KEY

  // If no internal service key is configured, fall back to checking origin
  if (!expectedKey) {
    // In development without internal key, accept localhost calls
    const origin = request.headers.get('origin') || request.headers.get('host')
    return origin?.includes('localhost') ?? false
  }

  if (!serviceKey) {
    return false
  }

  const providedHash = createHash('sha256').update(serviceKey).digest()
  const expectedHash = createHash('sha256').update(expectedKey).digest()

  return timingSafeEqual(providedHash, expectedHash)
}

// Constants for external API system identity
export const EXTERNAL_SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000099'
export const EXTERNAL_ACCOUNT_ID = '00000000-0000-0000-0000-000000000020'

/**
 * Find or create a user by external ID.
 * Uses Prisma upsert — atomic via the @unique constraint on externalId.
 */
export async function getOrCreateExternalUser(externalId: string) {
  const displayName = externalId
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')

  return prisma.user.upsert({
    where: { externalId },
    update: {},
    create: { externalId, displayName, role: 'counselor' },
  })
}
