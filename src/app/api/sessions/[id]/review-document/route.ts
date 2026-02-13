import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { zodResponseFormat } from 'openai/helpers/zod'
import { extractText } from 'unpdf'
import { prisma } from '@/lib/prisma'
import { apiSuccess, apiError, handleApiError, notFound, conflict, forbidden, badRequest } from '@/lib/api'
import { requireAuth, canAccessResource } from '@/lib/auth'
import { getOpenAI, formatTranscriptForLLM } from '@/lib/openai'
import { loadPrompt } from '@/lib/prompts'
import { documentReviewResultSchema } from '@/lib/validators'
import type { TranscriptTurn } from '@/types'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const MAX_TEXT_LENGTH = 30_000 // ~7,500 tokens
const MIN_TRANSCRIPT_TURNS = 3

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/sessions/[id]/review-document
 * Upload a PDF, extract text, compare against transcript via LLM, return scored review.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params

    const authResult = await requireAuth(request)
    if (authResult.error) return authResult.error
    const user = authResult.user

    // Load session with evaluation, transcript, scenario, and existing review
    const session = await prisma.session.findUnique({
      where: { id },
      include: {
        assignment: { include: { scenario: true } },
        scenario: true,
        evaluation: true,
        documentReview: true,
        transcript: {
          orderBy: { turnOrder: 'asc' },
        },
      },
    })

    if (!session) return notFound('Session not found')

    const ownerId = session.assignment?.counselorId ?? session.userId
    if (!ownerId) return notFound('Session not found')
    if (!canAccessResource(user, ownerId)) return forbidden('Cannot review another user\'s session')

    // Must have evaluation first
    if (!session.evaluation) return conflict('Session must be evaluated before document review')

    // One review per session
    if (session.documentReview) return conflict('Document review already exists for this session')

    // Parse FormData and validate PDF
    const formData = await request.formData()
    const file = formData.get('file')
    if (!file || !(file instanceof File) || file.size === 0) {
      return badRequest('PDF file is required')
    }
    if (file.size > MAX_FILE_SIZE) {
      return badRequest('File size must be under 10MB')
    }

    const buffer = new Uint8Array(await file.arrayBuffer())

    // Validate PDF magic bytes
    if (buffer.length < 5 || String.fromCharCode(...buffer.slice(0, 5)) !== '%PDF-') {
      return badRequest('File must be a valid PDF')
    }

    // Extract text
    let extractedText: string
    try {
      const { text } = await extractText(buffer, { mergePages: true })
      extractedText = text.trim()
    } catch {
      return badRequest('Could not extract text from PDF. The file may be image-only or password-protected.')
    }

    if (!extractedText) {
      return badRequest('PDF contains no extractable text. The file may be image-only or scanned.')
    }

    // Check transcript has enough turns
    if (session.transcript.length < MIN_TRANSCRIPT_TURNS) {
      return badRequest('Session transcript is too short for meaningful document review')
    }

    // Truncate extracted text for cost control
    const documentText = extractedText.slice(0, MAX_TEXT_LENGTH)

    // Format transcript
    const transcriptTurns: TranscriptTurn[] = session.transcript.map(t => ({
      id: t.id,
      sessionId: session.id,
      role: t.role as TranscriptTurn['role'],
      content: t.content,
      turnOrder: t.turnOrder,
      createdAt: t.createdAt.toISOString(),
    }))
    const transcriptText = formatTranscriptForLLM(transcriptTurns)

    // Build LLM prompt
    const systemPrompt = loadPrompt('document-reviewer.txt')
    const guidelinesText = loadPrompt('protocall-documentation-guidelines.txt', '')
    const scenario = session.assignment?.scenario ?? session.scenario
    let userMessage = ''
    if (guidelinesText) {
      userMessage += `## PROTOCALL DOCUMENTATION GUIDELINES\n\n${guidelinesText}\n\n`
    }
    if (scenario?.prompt) {
      userMessage += `## SCENARIO CONTEXT\n${scenario.prompt}\n\n`
    }
    userMessage += `## SESSION TRANSCRIPT\n\n${transcriptText}\n\n`
    userMessage += `## DOCUMENTATION TEXT\n\n${documentText}`

    // Call LLM with structured output
    const response = await getOpenAI().beta.chat.completions.parse({
      model: process.env.CHAT_MODEL ?? 'gpt-4.1',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      response_format: zodResponseFormat(documentReviewResultSchema, 'document_review'),
      temperature: 0.3,
    }, { timeout: 60000 })

    const message = response.choices[0].message
    if (message.refusal) {
      return apiError({ type: 'UPSTREAM_ERROR', message: 'Review could not be completed' }, 500)
    }
    if (!message.parsed) {
      return apiError({ type: 'UPSTREAM_ERROR', message: 'Failed to parse review response' }, 500)
    }

    const result = message.parsed

    // Persist review (P2002 catch for race condition)
    try {
      const review = await prisma.documentReview.create({
        data: {
          sessionId: id,
          fileName: file.name,
          transcriptAccuracy: result.transcriptAccuracy,
          guidelinesCompliance: result.guidelinesCompliance,
          overallScore: result.overallScore,
          specificGaps: result.specificGaps,
          reviewText: result.narrative,
        },
      })

      return apiSuccess({
        id: review.id,
        sessionId: review.sessionId,
        fileName: review.fileName,
        transcriptAccuracy: review.transcriptAccuracy,
        guidelinesCompliance: review.guidelinesCompliance,
        overallScore: review.overallScore,
        specificGaps: review.specificGaps,
        reviewText: review.reviewText,
        createdAt: review.createdAt.toISOString(),
      }, 201)
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return conflict('Document review already exists for this session')
      }
      throw error
    }
  } catch (error) {
    return handleApiError(error)
  }
}

/**
 * GET /api/sessions/[id]/review-document
 * Retrieve existing document review for a session.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params

    const authResult = await requireAuth(request)
    if (authResult.error) return authResult.error
    const user = authResult.user

    const session = await prisma.session.findUnique({
      where: { id },
      include: {
        assignment: true,
        documentReview: true,
      },
    })

    if (!session) return notFound('Session not found')

    const ownerId = session.assignment?.counselorId ?? session.userId
    if (!ownerId) return notFound('Session not found')
    if (!canAccessResource(user, ownerId)) return forbidden('Cannot view another user\'s document review')

    if (!session.documentReview) return notFound('No document review found for this session')

    const review = session.documentReview
    return apiSuccess({
      id: review.id,
      sessionId: review.sessionId,
      fileName: review.fileName,
      transcriptAccuracy: review.transcriptAccuracy,
      guidelinesCompliance: review.guidelinesCompliance,
      overallScore: review.overallScore,
      specificGaps: review.specificGaps,
      reviewText: review.reviewText,
      createdAt: review.createdAt.toISOString(),
    })
  } catch (error) {
    return handleApiError(error)
  }
}
