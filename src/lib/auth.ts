import prisma from '@/lib/prisma'
import type { User } from '@prisma/client'

// Placeholder - matches current app's simple auth
// Replace with real auth when needed

export async function getCurrentUser(): Promise<User | null> {
  // Current app uses simple user selection, not real auth
  // This matches that behavior for feature parity
  // In the current app, user is selected from dropdown and stored in localStorage

  // For API routes that need a user, we'll expect the user ID in a header
  // This is a simple approach that matches the current app's behavior
  return null
}

export async function getUserById(userId: string): Promise<User | null> {
  return prisma.user.findUnique({
    where: { id: userId },
  })
}

export async function getUserByExternalId(externalId: string): Promise<User | null> {
  return prisma.user.findUnique({
    where: { externalId },
  })
}
