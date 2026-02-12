import { NextRequest } from 'next/server'
import { extractText } from 'unpdf'
import { apiSuccess, badRequest, apiError, handleApiError } from '@/lib/api'
import { requireSupervisor } from '@/lib/auth'
import { checkRateLimit } from '@/lib/rate-limit'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const MAX_TEXT_LENGTH = 15_000 // Match complaint textarea maxLength

/**
 * POST /api/scenarios/extract-text
 * Extract text from a PDF file. Used by complaint generator for file upload.
 * Supervisor-only. TXT files are handled client-side and never sent here.
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireSupervisor(request)
    if (authResult.error) return authResult.error
    const user = authResult.user

    // Rate limit: 20 requests per minute per user
    if (!checkRateLimit(`extract-text:${user.id}`, 20, 60_000)) {
      return apiError(
        { type: 'RATE_LIMITED', message: 'Too many extraction requests. Please wait a minute.' },
        429
      )
    }

    const formData = await request.formData()
    const file = formData.get('file')
    if (!file || !(file instanceof File) || file.size === 0) {
      return badRequest('File is required')
    }
    if (file.size > MAX_FILE_SIZE) {
      return badRequest('File size must be under 10MB')
    }

    // Validate file extension before reading buffer
    const fileName = file.name.toLowerCase()
    if (!fileName.endsWith('.pdf')) {
      return badRequest('Only PDF files are supported. TXT files are processed client-side.')
    }

    const buffer = new Uint8Array(await file.arrayBuffer())

    // Validate PDF magic bytes
    if (buffer.length < 5 || String.fromCharCode(...buffer.slice(0, 5)) !== '%PDF-') {
      return badRequest('File must be a valid PDF')
    }

    let text: string
    try {
      const result = await extractText(buffer, { mergePages: true })
      text = result.text.trim()
    } catch {
      return badRequest('Could not read PDF. The file may be encrypted or password-protected.')
    }

    if (!text) {
      return badRequest('No text found in PDF. The file may contain only images.')
    }

    // Truncate to match client-side textarea limit
    const truncated = text.length > MAX_TEXT_LENGTH
    if (truncated) {
      text = text.slice(0, MAX_TEXT_LENGTH)
    }

    return apiSuccess({ text, fileName: file.name, truncated })
  } catch (error) {
    return handleApiError(error)
  }
}
