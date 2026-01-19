import { NextRequest } from 'next/server'
import prisma from '@/lib/prisma'
import { apiSuccess, handleApiError } from '@/lib/api'
import { validateExternalApiKey } from '@/lib/external-auth'

/**
 * GET /api/external/scenarios
 * List available simulation scenarios.
 * Used by personalized-training system to show what simulations can be assigned.
 *
 * Auth: X-API-Key header validated against EXTERNAL_API_KEY
 * Query params:
 *   - category (optional): Filter by category (onboarding, refresher, advanced, assessment)
 *   - mode (optional): Filter by mode (phone, chat)
 * Returns: Array of scenarios
 */
export async function GET(request: NextRequest) {
  try {
    const authError = validateExternalApiKey(request)
    if (authError) return authError

    const category = request.nextUrl.searchParams.get('category')
    const mode = request.nextUrl.searchParams.get('mode')

    const scenarios = await prisma.scenario.findMany({
      where: {
        ...(category && { category }),
        ...(mode && { mode }),
      },
      select: {
        id: true,
        title: true,
        description: true,
        mode: true,
        category: true,
        isOneTime: true,
        createdAt: true,
        account: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { title: 'asc' },
    })

    return apiSuccess(
      scenarios.map(s => ({
        scenario_id: s.id,
        title: s.title,
        description: s.description,
        mode: s.mode,
        category: s.category,
        is_one_time: s.isOneTime,
        account_id: s.account.id,
        account_name: s.account.name,
        created_at: s.createdAt.toISOString(),
      }))
    )
  } catch (error) {
    return handleApiError(error)
  }
}
