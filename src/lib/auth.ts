import { prisma } from '@/lib/prisma'
import type { User } from '@prisma/client'

// =============================================================================
// Authentication Helper
// =============================================================================

// Default supervisor user ID for development
// This matches the seed data and provides a mock user for API calls
const DEFAULT_SUPERVISOR_ID = '00000000-0000-0000-0000-000000000001'

/**
 * Get the current authenticated user.
 *
 * PLACEHOLDER IMPLEMENTATION:
 * Current app uses simple user selection (dropdown stored in localStorage),
 * not real authentication. This matches that behavior for feature parity.
 *
 * TODO: Replace with real authentication when needed
 *
 * @returns The current user or null if not authenticated
 */
export async function getCurrentUser(): Promise<User | null> {
  // For now, return the default supervisor user
  // In the original app, user is selected from a dropdown and stored in localStorage
  // The backend doesn't validate auth - it trusts the user_id passed in requests

  try {
    const user = await prisma.user.findUnique({
      where: { id: DEFAULT_SUPERVISOR_ID },
    })
    return user
  } catch {
    return null
  }
}

/**
 * Get a user by ID.
 * Used when a specific user ID is provided in the request.
 *
 * @param userId The user ID to look up
 * @returns The user or null if not found
 */
export async function getUserById(userId: string): Promise<User | null> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    })
    return user
  } catch {
    return null
  }
}

/**
 * Check if a user is a supervisor.
 *
 * @param user The user to check
 * @returns true if the user has supervisor role
 */
export function isSupervisor(user: User): boolean {
  return user.role === 'supervisor'
}

/**
 * Check if a user is a counselor.
 *
 * @param user The user to check
 * @returns true if the user has counselor role
 */
export function isCounselor(user: User): boolean {
  return user.role === 'counselor'
}
