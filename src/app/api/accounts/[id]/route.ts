import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiSuccess, handleApiError, notFoundError, validationError } from '@/lib/api'
import { updateAccountSchema } from '@/lib/validators'
import { z } from 'zod'

const idSchema = z.string().uuid('Invalid account ID')

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/accounts/[id]
 *
 * Get a single account by ID.
 */
export async function GET(
  _request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params
    const idResult = idSchema.safeParse(id)

    if (!idResult.success) {
      return validationError('Invalid account ID')
    }

    const account = await prisma.account.findUnique({
      where: { id: idResult.data },
      select: {
        id: true,
        name: true,
        policiesProceduresPath: true,
        policiesVectorFileId: true,
      },
    })

    if (!account) {
      return notFoundError('Account not found')
    }

    return apiSuccess(account)
  } catch (error) {
    return handleApiError(error)
  }
}

/**
 * PATCH /api/accounts/[id]
 *
 * Update an account.
 */
export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params
    const idResult = idSchema.safeParse(id)

    if (!idResult.success) {
      return validationError('Invalid account ID')
    }

    const body = await request.json().catch(() => null)

    if (!body) {
      return validationError('Invalid JSON body')
    }

    const result = updateAccountSchema.safeParse(body)

    if (!result.success) {
      return validationError('Validation failed', result.error.flatten().fieldErrors as Record<string, string[]>)
    }

    // Check if account exists
    const existing = await prisma.account.findUnique({
      where: { id: idResult.data },
    })

    if (!existing) {
      return notFoundError('Account not found')
    }

    const account = await prisma.account.update({
      where: { id: idResult.data },
      data: result.data,
      select: {
        id: true,
        name: true,
        policiesProceduresPath: true,
        policiesVectorFileId: true,
      },
    })

    return apiSuccess(account)
  } catch (error) {
    return handleApiError(error)
  }
}

/**
 * DELETE /api/accounts/[id]
 *
 * Delete an account. Linked scenarios are unlinked (SET NULL).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params
    const idResult = idSchema.safeParse(id)

    if (!idResult.success) {
      return validationError('Invalid account ID')
    }

    // Check if account exists
    const existing = await prisma.account.findUnique({
      where: { id: idResult.data },
    })

    if (!existing) {
      return notFoundError('Account not found')
    }

    await prisma.account.delete({
      where: { id: idResult.data },
    })

    // Return empty 204 response
    return new Response(null, { status: 204 })
  } catch (error) {
    return handleApiError(error)
  }
}
