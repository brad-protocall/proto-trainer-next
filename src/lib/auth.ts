// Placeholder - matches current app's simple auth
// Replace with real auth when needed

import prisma from '@/lib/prisma'
import type { User } from '@prisma/client'

// TODO: Replace with actual user from auth when available
const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001'

export async function getCurrentUser(): Promise<User | null> {
  // Current app uses simple user selection, not real auth
  // This matches that behavior for feature parity
  // TODO: Implement real auth when needed

  // For now, get the default supervisor user
  const user = await prisma.user.findUnique({
    where: { id: DEFAULT_USER_ID }
  })

  return user
}
