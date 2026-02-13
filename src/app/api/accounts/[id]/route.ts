import { NextRequest } from 'next/server'
import { writeFile, mkdir, unlink } from 'fs/promises'
import path from 'path'
import { extractText } from 'unpdf'
import prisma from '@/lib/prisma'
import { apiSuccess, apiError, handleApiError, notFound } from '@/lib/api'
import { requireAuth, requireSupervisor } from '@/lib/auth'
import { uploadPolicyToVectorStore } from '@/lib/openai'

const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20 MB
const ALLOWED_EXTENSIONS = ['.txt', '.md', '.pdf']

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
 * Supports multipart form data for policy file upload (TXT, MD, PDF)
 * PDF uploads: validates magic bytes, file size (20 MB), and account number match
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params

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
      const policiesFile = formData.get('policiesFile') as File | null

      if (!policiesFile) {
        return apiError(
          { type: 'VALIDATION_ERROR', message: 'policiesFile is required' },
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

      // Validate file extension
      const fileName = policiesFile.name.toLowerCase()
      const hasValidExtension = ALLOWED_EXTENSIONS.some(ext => fileName.endsWith(ext))
      if (!hasValidExtension) {
        return apiError(
          { type: 'VALIDATION_ERROR', message: 'Only .txt, .md, and .pdf files are allowed' },
          400
        )
      }

      const fileBuffer = Buffer.from(await policiesFile.arrayBuffer())

      // PDF-specific validation
      if (fileName.endsWith('.pdf')) {
        // Validate magic bytes
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
        } catch {
          // If text extraction fails, allow upload but log warning
          console.warn(`[WARN] Could not extract text from PDF for account number validation (account ${id}). Proceeding with upload.`)
        }
      }

      // Save file locally
      const uploadsDir = path.join(process.cwd(), 'uploads', 'policies', id)
      await mkdir(uploadsDir, { recursive: true })
      const localPath = path.join(uploadsDir, policiesFile.name)
      await writeFile(localPath, fileBuffer)

      // Upload to OpenAI vector store (safe replace: upload new, then delete old)
      try {
        const { fileId, vectorStoreId, status } = await uploadPolicyToVectorStore(
          id,
          localPath,
          account.vectorStoreId
        )

        // Build procedure history entry
        const historyEntry = {
          filename: policiesFile.name,
          uploadedAt: new Date().toISOString(),
          uploadedBy: user.id,
        }
        const existingHistory = Array.isArray(account.procedureHistory)
          ? (account.procedureHistory as Array<{ filename: string; uploadedAt: string; uploadedBy: string }>)
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
