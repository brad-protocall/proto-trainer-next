import { NextRequest } from 'next/server'
import { extractText } from 'unpdf'
import { apiSuccess, badRequest, handleApiError } from '@/lib/api'
import { requireSupervisor } from '@/lib/auth'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

/**
 * POST /api/scenarios/extract-text
 * Extract text from PDF or TXT file. Used by complaint generator for file upload.
 * Supervisor-only.
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireSupervisor(request)
    if (authResult.error) return authResult.error

    const formData = await request.formData()
    const file = formData.get('file')
    if (!file || !(file instanceof File) || file.size === 0) {
      return badRequest('File is required')
    }
    if (file.size > MAX_FILE_SIZE) {
      return badRequest('File size must be under 10MB')
    }

    const buffer = new Uint8Array(await file.arrayBuffer())

    // Determine file type from extension
    const fileName = file.name.toLowerCase()
    const isPdf = fileName.endsWith('.pdf')
    const isTxt = fileName.endsWith('.txt')

    if (!isPdf && !isTxt) {
      return badRequest('Only PDF and TXT files are supported')
    }

    let text: string

    if (isPdf) {
      // Validate PDF magic bytes
      if (buffer.length < 5 || String.fromCharCode(...buffer.slice(0, 5)) !== '%PDF-') {
        return badRequest('File must be a valid PDF')
      }

      try {
        const result = await extractText(buffer, { mergePages: true })
        text = result.text.trim()
      } catch {
        return badRequest('Could not read PDF. The file may be encrypted or password-protected.')
      }

      if (!text) {
        return badRequest('No text found in PDF. The file may contain only images.')
      }
    } else {
      // TXT file — decode as UTF-8
      text = new TextDecoder().decode(buffer).trim()

      if (!text) {
        return badRequest('File is empty')
      }
    }

    return apiSuccess({ text, fileName: file.name })
  } catch (error) {
    return handleApiError(error)
  }
}
