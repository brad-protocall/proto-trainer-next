import { NextRequest } from 'next/server'
import prisma from '@/lib/prisma'
import { unauthorized, forbidden } from '@/lib/api'
import type { User } from '@prisma/client'

/**
 * Get current user from request header (x-user-id)
 * This matches the original app's simple auth approach
 */
export async function getCurrentUser(request: NextRequest): Promise<User | null> {
  const userId = request.headers.get('x-user-id')
  if (!userId) {
    return null
  }

  return prisma.user.findUnique({
    where: { id: userId },
  })
}

/**
 * Require authentication - returns user or error response
 */
export async function requireAuth(
  request: NextRequest
): Promise<{ user: User; error: null } | { user: null; error: Response }> {
  const user = await getCurrentUser(request)

  if (!user) {
    return {
      user: null,
      error: unauthorized('Authentication required'),
    }
  }

  return { user, error: null }
}

/**
 * Require supervisor role - returns supervisor user or error response
 */
export async function requireSupervisor(
  request: NextRequest
): Promise<{ user: User; error: null } | { user: null; error: Response }> {
  const authResult = await requireAuth(request)

  if (authResult.error) {
    return authResult
  }

  if (authResult.user.role !== 'supervisor') {
    return {
      user: null,
      error: forbidden('Supervisor access required'),
    }
  }

  return { user: authResult.user, error: null }
}

/**
 * Check if user can access a resource based on ownership
 */
export function canAccessResource(user: User, resourceOwnerId: string): boolean {
  // Supervisors can access any resource
  if (user.role === 'supervisor') {
    return true
  }
  // Counselors can only access their own resources
  return user.id === resourceOwnerId
}

/**
 * Get user by ID
 */
export async function getUserById(userId: string): Promise<User | null> {
  return prisma.user.findUnique({
    where: { id: userId },
  })
}

/**
 * Get user by external ID
 */
export async function getUserByExternalId(externalId: string): Promise<User | null> {
  return prisma.user.findUnique({
    where: { externalId },
  })
}
