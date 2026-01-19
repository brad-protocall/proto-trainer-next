import { NextRequest } from 'next/server'
import prisma from '@/lib/prisma'
import { apiSuccess, handleApiError, notFound } from '@/lib/api'
import { validateExternalApiKey } from '@/lib/external-auth'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/external/scenarios/[id]
 * Get a specific scenario's details.
 * Used by personalized-training system to show scenario information.
 *
 * Auth: X-API-Key header validated against EXTERNAL_API_KEY
 * Returns: Scenario details
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const authError = validateExternalApiKey(request)
    if (authError) return authError

    const { id } = await params

    const scenario = await prisma.scenario.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        description: true,
        mode: true,
        category: true,
        isOneTime: true,
        relevantPolicySections: true,
        createdAt: true,
        account: {
          select: {
            id: true,
            name: true,
          },
        },
        creator: {
          select: {
            displayName: true,
          },
        },
      },
    })

    if (!scenario) {
      return notFound('Scenario not found')
    }

    return apiSuccess({
      scenario_id: scenario.id,
      title: scenario.title,
      description: scenario.description,
      mode: scenario.mode,
      category: scenario.category,
      is_one_time: scenario.isOneTime,
      relevant_policy_sections: scenario.relevantPolicySections,
      account_id: scenario.account.id,
      account_name: scenario.account.name,
      created_by: scenario.creator.displayName,
      created_at: scenario.createdAt.toISOString(),
    })
  } catch (error) {
    return handleApiError(error)
  }
}
