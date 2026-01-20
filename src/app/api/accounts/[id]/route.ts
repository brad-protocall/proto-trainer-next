import { NextRequest } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import prisma from '@/lib/prisma'
import { apiSuccess, apiError, handleApiError, notFound } from '@/lib/api'
import { requireAuth, requireSupervisor } from '@/lib/auth'
import { uploadPolicyToVectorStore } from '@/lib/openai'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/accounts/[id]
 * Get a specific account - any authenticated user
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params

    const authResult = await requireAuth(request)
    if (authResult.error) return authResult.error

    const account = await prisma.account.findUnique({
      where: { id },
    })

    if (!account) {
      return notFound('Account not found')
    }

    return apiSuccess(account)
  } catch (error) {
    return handleApiError(error)
  }
}

/**
 * PATCH /api/accounts/[id]
 * Update an account - supervisor only
 * Supports multipart form data for policy file upload
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params

    const authResult = await requireSupervisor(request)
    if (authResult.error) return authResult.error

    const account = await prisma.account.findUnique({
      where: { id },
    })

    if (!account) {
      return notFound('Account not found')
    }

    const contentType = request.headers.get('content-type') || ''

    if (contentType.includes('multipart/form-data')) {
      // Handle file upload
      const formData = await request.formData()
      const policiesFile = formData.get('policiesFile') as File | null

      if (!policiesFile) {
        return apiError(
          { type: 'VALIDATION_ERROR', message: 'policiesFile is required' },
          400
        )
      }

      // Validate file type (TXT/MD only)
      const fileName = policiesFile.name.toLowerCase()
      if (!fileName.endsWith('.txt') && !fileName.endsWith('.md')) {
        return apiError(
          { type: 'VALIDATION_ERROR', message: 'Only .txt and .md files are allowed' },
          400
        )
      }

      // Save file locally
      const uploadsDir = path.join(process.cwd(), 'uploads', 'policies', id)
      await mkdir(uploadsDir, { recursive: true })
      const localPath = path.join(uploadsDir, policiesFile.name)
      const fileBuffer = Buffer.from(await policiesFile.arrayBuffer())
      await writeFile(localPath, fileBuffer)

      // Upload to OpenAI vector store
      const { fileId, vectorStoreId } = await uploadPolicyToVectorStore(id, localPath)

      // Update account with vector store info
      const updatedAccount = await prisma.account.update({
        where: { id },
        data: {
          policiesProceduresPath: localPath,
          vectorStoreId: vectorStoreId,
        },
      })

      return apiSuccess({
        ...updatedAccount,
        policiesVectorFileId: fileId,
      })
    } else {
      // Handle JSON body for other updates
      const body = await request.json()

      const updatedAccount = await prisma.account.update({
        where: { id },
        data: {
          ...(body.name && { name: body.name }),
        },
      })

      return apiSuccess(updatedAccount)
    }
  } catch (error) {
    return handleApiError(error)
  }
}

/**
 * DELETE /api/accounts/[id]
 * Delete an account - supervisor only
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params

    const authResult = await requireSupervisor(request)
    if (authResult.error) return authResult.error

    const account = await prisma.account.findUnique({
      where: { id },
    })

    if (!account) {
      return notFound('Account not found')
    }

    await prisma.account.delete({
      where: { id },
    })

    return new Response(null, { status: 204 })
  } catch (error) {
    return handleApiError(error)
  }
}
