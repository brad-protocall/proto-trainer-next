import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiSuccess, handleApiError, validationError } from '@/lib/api'
import { getCurrentUser } from '@/lib/auth'
import { ScenarioMode, ScenarioCategory } from '@/types'

interface CSVRow {
  title: string
  description?: string
  prompt: string
  mode?: string
  category?: string
}

interface ImportResult {
  created: number
  errors: Array<{
    row: number
    message: string
  }>
}

/**
 * Parse CSV content into rows
 * Handles quoted fields and commas within quotes
 */
function parseCSV(content: string): { headers: string[]; rows: string[][] } {
  const lines = content.trim().split('\n')
  if (lines.length === 0) {
    return { headers: [], rows: [] }
  }

  const parseRow = (line: string): string[] => {
    const result: string[] = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
      const char = line[i]

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          // Escaped quote
          current += '"'
          i++
        } else {
          // Toggle quote mode
          inQuotes = !inQuotes
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }

    result.push(current.trim())
    return result
  }

  const headers = parseRow(lines[0]).map(h => h.toLowerCase().trim())
  const rows = lines.slice(1).map(line => parseRow(line))

  return { headers, rows }
}

/**
 * Validate and normalize mode value
 */
function normalizeMode(value: string | undefined): string {
  if (!value) return ScenarioMode.PHONE
  const lower = value.toLowerCase().trim()
  if (lower === 'phone' || lower === 'chat') {
    return lower
  }
  return ScenarioMode.PHONE
}

/**
 * Validate and normalize category value
 */
function normalizeCategory(value: string | undefined): string | null {
  if (!value) return null
  const lower = value.toLowerCase().trim()
  const validCategories = [
    ScenarioCategory.ONBOARDING,
    ScenarioCategory.REFRESHER,
    ScenarioCategory.ADVANCED,
    ScenarioCategory.ASSESSMENT,
  ]
  if (validCategories.includes(lower as ScenarioCategory)) {
    return lower
  }
  return null
}

/**
 * POST /api/scenarios/import
 *
 * Import scenarios from a CSV file.
 * Accepts multipart/form-data with a 'file' field containing the CSV.
 *
 * CSV format:
 *   title,description,prompt,mode,category
 *   "Title","Description","Prompt text",phone,onboarding
 *
 * Returns:
 *   - created: number of scenarios created
 *   - errors: array of { row, message } for any failed rows
 */
export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      return validationError('User not authenticated')
    }

    const contentType = request.headers.get('content-type') || ''

    let csvContent: string

    if (contentType.includes('multipart/form-data')) {
      // Handle file upload
      const formData = await request.formData()
      const file = formData.get('file')

      if (!file || !(file instanceof File)) {
        return validationError('No file provided')
      }

      csvContent = await file.text()
    } else if (contentType.includes('text/csv') || contentType.includes('text/plain')) {
      // Handle raw CSV body
      csvContent = await request.text()
    } else {
      // Try to parse as JSON with csv field
      const body = await request.json().catch(() => null)
      if (body && typeof body.csv === 'string') {
        csvContent = body.csv
      } else {
        return validationError('Invalid content type. Expected multipart/form-data, text/csv, or JSON with csv field')
      }
    }

    if (!csvContent.trim()) {
      return validationError('CSV content is empty')
    }

    const { headers, rows } = parseCSV(csvContent)

    // Validate required headers
    const requiredHeaders = ['title', 'prompt']
    const missingHeaders = requiredHeaders.filter(h => !headers.includes(h))
    if (missingHeaders.length > 0) {
      return validationError(`Missing required CSV headers: ${missingHeaders.join(', ')}`)
    }

    // Get column indices
    const titleIdx = headers.indexOf('title')
    const descriptionIdx = headers.indexOf('description')
    const promptIdx = headers.indexOf('prompt')
    const modeIdx = headers.indexOf('mode')
    const categoryIdx = headers.indexOf('category')

    const result: ImportResult = {
      created: 0,
      errors: [],
    }

    // Process each row
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const rowNum = i + 2 // Account for header row and 0-indexing

      // Skip empty rows
      if (row.every(cell => !cell.trim())) {
        continue
      }

      const title = row[titleIdx]?.trim()
      const prompt = row[promptIdx]?.trim()

      // Validate required fields
      if (!title) {
        result.errors.push({ row: rowNum, message: 'Missing title' })
        continue
      }

      if (!prompt) {
        result.errors.push({ row: rowNum, message: 'Missing prompt' })
        continue
      }

      const description = descriptionIdx >= 0 ? row[descriptionIdx]?.trim() : undefined
      const mode = normalizeMode(modeIdx >= 0 ? row[modeIdx] : undefined)
      const category = normalizeCategory(categoryIdx >= 0 ? row[categoryIdx] : undefined)

      try {
        await prisma.scenario.create({
          data: {
            title,
            description: description || null,
            prompt,
            mode,
            category,
            createdBy: currentUser.id,
          },
        })
        result.created++
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        result.errors.push({ row: rowNum, message })
      }
    }

    return apiSuccess(result)
  } catch (error) {
    return handleApiError(error)
  }
}
