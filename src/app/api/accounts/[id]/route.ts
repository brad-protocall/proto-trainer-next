import { NextRequest } from 'next/server'
import { writeFile, mkdir, unlink } from 'fs/promises'
import path from 'path'
import { z } from 'zod'
import { extractText } from 'unpdf'
import prisma from '@/lib/prisma'
import { apiSuccess, apiError, handleApiError, notFound, invalidId } from '@/lib/api'
import { requireAuth, requireSupervisor } from '@/lib/auth'
import { uploadPolicyToVectorStore } from '@/lib/openai'
import type { ProcedureHistoryEntry } from '@/types'

const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20 MB

const updateAccountSchema = z.object({
  name: z.string().min(1).max(255).optional(),
})

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
    const idError = invalidId(id)
    if (idError) return idError

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
 * Supports multipart form data for PDF policy file upload
 * PDF uploads: validates magic bytes, file size (20 MB), and account number match
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const idError = invalidId(id)
    if (idError) return idError

    const authResult = await requireSupervisor(request)
    if (authResult.error) return authResult.error
    const user = authResult.user

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
      const entry = formData.get('policiesFile')
      const policiesFile = entry instanceof File ? entry : null

      if (!policiesFile) {
        return apiError(
          { type: 'VALIDATION_ERROR', message: 'policiesFile is required and must be a file' },
          400
        )
      }

      // Validate file size
      if (policiesFile.size > MAX_FILE_SIZE) {
        return apiError(
          { type: 'VALIDATION_ERROR', message: 'File size must be under 20 MB' },
          400
        )
      }

      // Validate file extension — PDF only for procedures
      const originalName = policiesFile.name
      if (!originalName.toLowerCase().endsWith('.pdf')) {
        return apiError(
          { type: 'VALIDATION_ERROR', message: 'Only PDF files are allowed for account procedures' },
          400
        )
      }

      const fileBuffer = Buffer.from(await policiesFile.arrayBuffer())

      // Validate PDF magic bytes
      if (fileBuffer.length < 5 || fileBuffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
        return apiError(
          { type: 'VALIDATION_ERROR', message: 'Invalid PDF file' },
          400
        )
      }

      // Extract text from first page to verify account number
      try {
        const result = await extractText(new Uint8Array(fileBuffer), { mergePages: false })
        const firstPageText = Array.isArray(result.text) ? result.text[0] : result.text
        if (firstPageText && !firstPageText.includes(account.name)) {
          return apiError(
            {
              type: 'VALIDATION_ERROR',
              message: `This PDF does not appear to belong to account "${account.name}". The account name was not found on the first page. Upload rejected.`,
            },
            400
          )
        }
      } catch (extractionError) {
        console.error(`[ERROR] PDF text extraction failed for account ${id}:`, extractionError)
        return apiError(
          {
            type: 'VALIDATION_ERROR',
            message: 'Could not verify this PDF belongs to the account — text extraction failed. If this PDF is valid, contact support.',
          },
          400
        )
      }

      // Sanitize filename to prevent path traversal
      const safeName = path.basename(originalName).replace(/[^a-zA-Z0-9._-]/g, '_')
      if (!safeName || safeName.startsWith('.')) {
        return apiError(
          { type: 'VALIDATION_ERROR', message: 'Invalid filename' },
          400
        )
      }

      // Save file locally
      const uploadsDir = path.join(process.cwd(), 'uploads', 'policies', id)
      await mkdir(uploadsDir, { recursive: true })
      const localPath = path.join(uploadsDir, safeName)

      // Defense-in-depth: verify resolved path is inside uploads directory
      if (!localPath.startsWith(uploadsDir)) {
        return apiError(
          { type: 'VALIDATION_ERROR', message: 'Invalid filename' },
          400
        )
      }

      await writeFile(localPath, fileBuffer)

      // Upload to OpenAI vector store (safe replace: upload new, then delete old)
      try {
        const { fileId, vectorStoreId, status } = await uploadPolicyToVectorStore(
          id,
          localPath,
          account.vectorStoreId
        )

        // Build procedure history entry
        const historyEntry: ProcedureHistoryEntry = {
          filename: originalName,
          uploadedAt: new Date().toISOString(),
          uploadedBy: user.id,
        }
        const existingHistory: ProcedureHistoryEntry[] = Array.isArray(account.procedureHistory)
          ? (account.procedureHistory as unknown as ProcedureHistoryEntry[])
          : []

        // Update account with vector store info and append to history
        const newHistory = [...existingHistory, historyEntry]
        const updatedAccount = await prisma.account.update({
          where: { id },
          data: {
            policiesProceduresPath: localPath,
            vectorStoreId,
            procedureHistory: newHistory as unknown as import('@prisma/client').Prisma.InputJsonValue,
          },
        })

        return apiSuccess({
          ...updatedAccount,
          policiesVectorFileId: fileId,
          policiesVectorFileStatus: status,
        })
      } catch (error) {
        // Clean up local file on upload failure
        await unlink(localPath).catch(() => {})
        throw error
      }
    } else {
      // Handle JSON body for other updates
      const body = await request.json()
      const parsed = updateAccountSchema.safeParse(body)
      if (!parsed.success) {
        return apiError(
          { type: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid input' },
          400
        )
      }

      const updatedAccount = await prisma.account.update({
        where: { id },
        data: {
          ...(parsed.data.name && { name: parsed.data.name }),
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
    const idError = invalidId(id)
    if (idError) return idError

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
