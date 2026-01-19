import { NextRequest } from 'next/server'
import prisma from '@/lib/prisma'
import { apiSuccess, apiError, handleApiError } from '@/lib/api'
import { updateScenarioSchema } from '@/lib/validators'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const scenario = await prisma.scenario.findUnique({
      where: { id },
      include: {
        creator: { select: { displayName: true } },
        account: { select: { name: true } },
      },
    })

    if (!scenario) {
      return apiError({ code: 'NOT_FOUND', message: 'Scenario not found' }, 404)
    }

    return apiSuccess(scenario)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const result = updateScenarioSchema.safeParse(body)

    if (!result.success) {
      return apiError(
        { code: 'VALIDATION_ERROR', fields: result.error.flatten().fieldErrors as Record<string, string[]> },
        400
      )
    }

    const scenario = await prisma.scenario.update({
      where: { id },
      data: result.data,
      include: {
        creator: { select: { displayName: true } },
        account: { select: { name: true } },
      },
    })

    return apiSuccess(scenario)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    await prisma.scenario.delete({
      where: { id },
    })

    return apiSuccess({ deleted: true })
  } catch (error) {
    return handleApiError(error)
  }
}
