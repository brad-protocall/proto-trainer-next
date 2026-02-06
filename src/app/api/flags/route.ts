import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { apiSuccess, handleApiError } from '@/lib/api'
import { requireSupervisor } from '@/lib/auth'
import { flagQuerySchema } from '@/lib/validators'

/**
 * GET /api/flags?status=pending&severity=critical
 * Returns flags with session context for supervisor review.
 * Ordered by: critical first, then by createdAt DESC.
 * Limit 50 (no pagination for prototype).
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireSupervisor(request)
    if (authResult.error) return authResult.error

    // Parse query params
    const { searchParams } = new URL(request.url)
    const query = flagQuerySchema.parse({
      status: searchParams.get('status') || undefined,
      severity: searchParams.get('severity') || undefined,
      sessionId: searchParams.get('sessionId') || undefined,
    })

    // Build where clause
    const where: Prisma.SessionFlagWhereInput = {}
    if (query.status) where.status = query.status
    if (query.severity) where.severity = query.severity
    if (query.sessionId) where.sessionId = query.sessionId

    const flags = await prisma.sessionFlag.findMany({
      where,
      include: {
        session: {
          select: {
            id: true,
            modelType: true,
            startedAt: true,
            scenario: {
              select: {
                id: true,
                title: true,
              },
            },
            user: {
              select: {
                id: true,
                displayName: true,
              },
            },
          },
        },
      },
      orderBy: [
        { createdAt: 'desc' },
      ],
      take: 50,
    })

    // Sort by severity (critical > warning > info) then by createdAt desc.
    // Prisma string sort is alphabetical, so we sort in application code.
    const severityRank: Record<string, number> = { critical: 3, warning: 2, info: 1 }
    flags.sort((a, b) => {
      const sevDiff = (severityRank[b.severity] ?? 0) - (severityRank[a.severity] ?? 0)
      if (sevDiff !== 0) return sevDiff
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })

    return apiSuccess(flags)
  } catch (error) {
    return handleApiError(error)
  }
}
