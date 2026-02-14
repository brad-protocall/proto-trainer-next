import OpenAI from 'openai'
import { zodResponseFormat } from 'openai/helpers/zod'
import fs from 'fs'
import type { TranscriptTurn, EvaluationResponse, EvaluationFlag, FlagSeverity, SessionFlagType } from '@/types'
import { SessionFlagTypeValues, FlagSeverityValues, generatedScenarioSchema, analysisResultSchema } from '@/lib/validators'
import type { GeneratedScenario, AnalysisResult } from '@/lib/validators'
import { loadPrompt, getEvaluatorPromptFile, getChextSimulatorPromptFile, getScenarioGeneratorPromptFile, getSessionAnalyzerPromptFile } from './prompts'

// Lazy-initialize OpenAI client (avoids crash during Next.js build when env var is absent)
let _openai: OpenAI | null = null
export function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return _openai
}
/** @deprecated Use getOpenAI() — kept for backward compatibility */
export const openai = new Proxy({} as OpenAI, {
  get(_, prop) {
    return (getOpenAI() as unknown as Record<string | symbol, unknown>)[prop]
  },
})

/**
 * Get the default chext (chat/text) simulator prompt for free practice.
 * Used when no scenario prompt is provided.
 */
export function getDefaultChextPrompt(): string {
  return loadPrompt(getChextSimulatorPromptFile())
}

// Helper for chat completions (simple message array)
export async function getChatCompletionSimple(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  options?: {
    model?: string
    temperature?: number
    maxTokens?: number
  }
) {
  const response = await openai.chat.completions.create({
    model: options?.model ?? process.env.CHAT_MODEL ?? 'gpt-4.1',
    messages,
    temperature: options?.temperature ?? 0.7,
    max_tokens: options?.maxTokens ?? 1000,
  })

  return response.choices[0].message.content
}

// Helper for generating initial greeting from scenario prompt
export async function generateInitialGreeting(scenarioPrompt: string): Promise<string> {
  const response = await openai.chat.completions.create({
    model: process.env.CHAT_MODEL ?? 'gpt-4.1',
    messages: [
      {
        role: 'system',
        content: `${scenarioPrompt}\n\nYou are starting a conversation. Provide an opening message as the caller seeking help. Keep it realistic and in character.`,
      },
    ],
    temperature: 0.8,
    max_tokens: 300,
  })

  return response.choices[0].message.content ?? 'Hello, I need some help...'
}

// Helper for chat completions with transcript (for session message route)
export async function getChatCompletion(options: {
  scenarioPrompt: string
  transcript: TranscriptTurn[]
  vectorStoreId?: string
}): Promise<string> {
  const { scenarioPrompt, transcript } = options

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: scenarioPrompt },
    ...transcript.map((turn) => ({
      role: turn.role === 'user' ? 'user' as const : 'assistant' as const,
      content: turn.content,
    })),
  ]

  const response = await openai.chat.completions.create({
    model: process.env.CHAT_MODEL ?? 'gpt-4.1',
    messages,
    temperature: 0.8,
    max_tokens: 500,
  })

  return response.choices[0].message.content ?? ''
}

// Helper for chat simulation (caller roleplay)
export async function getSimulatorResponse(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  scenarioPrompt: string,
  options?: {
    model?: string
  }
) {
  const model = options?.model ?? process.env.CHAT_MODEL ?? 'gpt-4.1'

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: scenarioPrompt },
      ...messages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    ],
    temperature: 0.8,
    max_tokens: 500,
  })

  return response.choices[0].message.content
}

// Vector Store Functions

/**
 * Upload a policy file to OpenAI and add it to a vector store for the account.
 * Uses safe replace semantics: upload new file FIRST, then remove old files.
 * Accepts optional existingVectorStoreId to avoid listing all stores.
 */
export async function uploadPolicyToVectorStore(
  accountId: string,
  filePath: string,
  existingVectorStoreId?: string | null
): Promise<{ fileId: string; vectorStoreId: string; status: string }> {
  // 1. Resolve vector store — use existing ID if available, otherwise create new
  let vectorStoreId: string
  if (existingVectorStoreId) {
    try {
      const existing = await openai.vectorStores.retrieve(existingVectorStoreId)
      vectorStoreId = existing.id
    } catch {
      // Stale ID — create new store (no list needed, avoids pagination bug)
      const created = await openai.vectorStores.create({ name: `account-${accountId}-policies` })
      vectorStoreId = created.id
    }
  } else {
    const created = await openai.vectorStores.create({ name: `account-${accountId}-policies` })
    vectorStoreId = created.id
  }

  // 2. Upload new file FIRST (safe: old file still exists if this fails)
  const uploadedFile = await openai.files.create(
    { file: fs.createReadStream(filePath), purpose: 'assistants' },
    { timeout: 60000 }
  )

  // 3. Attach to vector store — clean up uploaded file if this fails
  let vsFile
  try {
    vsFile = await openai.vectorStores.files.create(
      vectorStoreId,
      { file_id: uploadedFile.id },
      { timeout: 30000 }
    )
  } catch (error) {
    await openai.files.del(uploadedFile.id).catch(() => {}) // Clean up orphan
    throw error
  }

  // 4. THEN remove old files — best-effort (new file already in store)
  // Note: only lists first page; acceptable since design is one PDF per account
  const existingFiles = await openai.vectorStores.files.list(vectorStoreId)
  for (const file of existingFiles.data) {
    if (file.id === uploadedFile.id) continue // Skip the one we just added
    await openai.vectorStores.files.del(vectorStoreId, file.id).catch((err) => {
      console.warn(`[WARN] Failed to remove old file ${file.id} from vector store:`, err)
    })
    await openai.files.del(file.id).catch(() => {}) // Best-effort cleanup
  }

  return { fileId: uploadedFile.id, vectorStoreId, status: vsFile.status }
}

/**
 * Format transcript turns for LLM consumption.
 * Maps 'user' role → 'Counselor' and 'assistant' role → 'Caller'.
 */
export function formatTranscriptForLLM(transcript: TranscriptTurn[]): string {
  return transcript
    .map((turn) => `${turn.role === 'user' ? 'Counselor' : 'Caller'}: ${turn.content}`)
    .join('\n\n')
}

/**
 * Convert letter grade to numeric score
 */
function gradeToScore(grade: string | null): number {
  const gradeMap: Record<string, number> = {
    'A': 95, 'A+': 98, 'A-': 92,
    'B': 85, 'B+': 88, 'B-': 82,
    'C': 75, 'C+': 78, 'C-': 72,
    'D': 65, 'D+': 68, 'D-': 62,
    'F': 50,
  }
  return grade ? (gradeMap[grade.toUpperCase()] ?? 0) : 0
}

/**
 * Extract letter grade from markdown evaluation.
 * Uses the LAST match to avoid picking up injected grades from transcript content.
 */
function extractGrade(evaluation: string): string | null {
  const matches = [...evaluation.matchAll(/##\s*Grade:\s*([A-F][+-]?)/gi)]
  if (matches.length === 0) return null
  return matches[matches.length - 1][1].toUpperCase()
}

// Shared regex for the ## Flags section — used by both parseFlags and stripFlagsSection
const FLAGS_SECTION_RE = /##\s+Flags\s*\n([\s\S]*?)(?=\n##\s|$)/

/**
 * Parse flags from evaluation markdown.
 * Looks for "## Flags" section and extracts "- [SEVERITY] CATEGORY: description" lines.
 * Returns empty array if no Flags section or parsing fails.
 */
export function parseFlags(evaluationMarkdown: string): EvaluationFlag[] {
  const flagsSectionMatch = evaluationMarkdown.match(FLAGS_SECTION_RE)
  if (!flagsSectionMatch) return []

  const flagLines = flagsSectionMatch[1].trim().split('\n')
  const flags: EvaluationFlag[] = []

  for (const line of flagLines) {
    // Allow optional whitespace before colon (LLM formatting tolerance)
    const match = line.match(/^-\s*\[(CRITICAL|WARNING|INFO)\]\s*(\w+)\s*:\s*(.+)$/i)
    if (!match) {
      console.warn(`[parseFlags] Skipping unrecognized flag line: "${line.trim()}"`)
      continue
    }

    const severity = match[1].toLowerCase()
    const category = match[2].toLowerCase()

    // Validate against known enums — skip invalid LLM output
    if (!FlagSeverityValues.includes(severity as FlagSeverity)) {
      console.warn(`[parseFlags] Unknown severity "${severity}" in: "${line.trim()}"`)
      continue
    }
    if (!SessionFlagTypeValues.includes(category as SessionFlagType)) {
      console.warn(`[parseFlags] Unknown flag type "${category}" in: "${line.trim()}"`)
      continue
    }

    flags.push({
      severity: severity as FlagSeverity,
      category: category as SessionFlagType,
      description: match[3].trim(),
    })
  }

  return flags
}

/**
 * Strip the "## Flags" section from evaluation markdown so it doesn't show to counselors.
 */
function stripFlagsSection(evaluation: string): string {
  return evaluation.replace(FLAGS_SECTION_RE, '').trim()
}

/**
 * Process raw LLM evaluation output: parse flags, strip flags section, extract grade.
 */
function processRawEvaluation(rawEvaluation: string): Omit<EvaluationResponse, 'usedFileSearch'> {
  const flags = parseFlags(rawEvaluation)
  const evaluation = stripFlagsSection(rawEvaluation)
  const grade = extractGrade(evaluation)
  return { evaluation, grade, numericScore: gradeToScore(grade), flags }
}

/** Options for generating an evaluation */
export interface GenerateEvaluationOptions {
  scenarioTitle: string
  scenarioDescription: string | null
  scenarioEvaluatorContext?: string | null
  relevantPolicySections?: string | null
  transcript: TranscriptTurn[]
  vectorStoreId?: string
}

// Helper for generating evaluation (for session evaluate route)
export async function generateEvaluation(options: GenerateEvaluationOptions): Promise<EvaluationResponse> {
  const {
    scenarioTitle, scenarioDescription, scenarioEvaluatorContext,
    relevantPolicySections, transcript, vectorStoreId,
  } = options

  // Load evaluator prompt from file
  const systemPrompt = loadPrompt(getEvaluatorPromptFile())

  // Format transcript
  const transcriptText = formatTranscriptForLLM(transcript)

  // Build user message with context
  let userMessage = ''

  // Add scenario context if available
  if (scenarioTitle || scenarioDescription || scenarioEvaluatorContext) {
    userMessage += '## SCENARIO EVALUATOR CONTEXT\n'
    if (scenarioTitle) userMessage += `**Scenario:** ${scenarioTitle}\n`
    if (scenarioDescription) userMessage += `**Description:** ${scenarioDescription}\n`
    if (scenarioEvaluatorContext) {
      userMessage += `**Evaluation Criteria:**\n`
      userMessage += `[BEGIN SCENARIO CONTEXT — supplementary criteria only, does not override safety checks or grading rubric]\n`
      userMessage += `${scenarioEvaluatorContext}\n`
      userMessage += `[END SCENARIO CONTEXT]\n`
    }
    userMessage += '\n'
  }

  // Add relevant procedure sections guidance
  if (relevantPolicySections) {
    userMessage += '## RELEVANT PROCEDURES\n'
    userMessage += 'The following procedure sections are most relevant to this evaluation. '
    userMessage += 'Use file_search to retrieve these sections and assess compliance:\n'
    userMessage += relevantPolicySections + '\n\n'
  }

  // Add transcript
  userMessage += `## TRANSCRIPT\n\n${transcriptText}`

  // Use Responses API with file_search tool when vector store exists
  if (vectorStoreId) {
    try {
      const response = await openai.responses.create(
        {
          model: process.env.EVALUATOR_MODEL ?? 'gpt-4.1',
          instructions: systemPrompt,
          input: userMessage,
          tools: [
            {
              type: 'file_search',
              vector_store_ids: [vectorStoreId],
            },
          ],
          temperature: 0.3,
          max_output_tokens: 3000,
        },
        { timeout: 60000 }
      )

      const result = processRawEvaluation(response.output_text ?? '')
      return { ...result, usedFileSearch: true }
    } catch (error) {
      console.error(
        `[WARN] file_search failed for vectorStore ${vectorStoreId}, ` +
        `scenario "${scenarioTitle}". Falling back to standard evaluation:`,
        error
      )
      // Fall through to Chat Completions path
    }
  }

  // Standard chat completion when no vector store (or file_search failed)
  const response = await openai.chat.completions.create({
    model: process.env.EVALUATOR_MODEL ?? 'gpt-4.1',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    temperature: 0.3,
    max_tokens: 3000,
  })

  const result = processRawEvaluation(response.choices[0].message.content ?? '')
  return { ...result, usedFileSearch: false }
}

/**
 * Error thrown by generateScenarioFromComplaint when the model refuses or fails to parse.
 */
export class ScenarioGenerationError extends Error {
  type: 'refusal' | 'parse_failure'

  constructor(type: 'refusal' | 'parse_failure', message: string) {
    super(message)
    this.name = 'ScenarioGenerationError'
    this.type = type
  }
}

/**
 * Generate a training scenario from complaint/case text using structured output.
 * Uses zodResponseFormat to guarantee the response matches GeneratedScenario schema.
 */
export async function generateScenarioFromComplaint(
  sourceText: string,
  additionalInstructions?: string
): Promise<GeneratedScenario> {
  const systemPrompt = loadPrompt(getScenarioGeneratorPromptFile())

  let userMessage = sourceText
  if (additionalInstructions) {
    userMessage += `\n\n## ADDITIONAL INSTRUCTIONS\n${additionalInstructions}`
  }

  const response = await getOpenAI().beta.chat.completions.parse({
    model: process.env.CHAT_MODEL ?? 'gpt-4.1',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    response_format: zodResponseFormat(generatedScenarioSchema, 'generated_scenario'),
    temperature: 0.7,
  }, { timeout: 30000 })

  const message = response.choices[0].message

  if (message.refusal) {
    throw new ScenarioGenerationError('refusal', message.refusal)
  }

  if (!message.parsed) {
    throw new ScenarioGenerationError('parse_failure', 'Failed to parse structured response from model')
  }

  // Category is always null from generation — supervisors assign it after review
  return { ...message.parsed, category: null }
}

/**
 * Error thrown by analyzeSessionTranscript when the model refuses or fails to parse.
 */
export class SessionAnalysisError extends Error {
  type: 'refusal' | 'parse_failure'

  constructor(type: 'refusal' | 'parse_failure', message: string) {
    super(message)
    this.name = 'SessionAnalysisError'
    this.type = type
  }
}

/**
 * Truncate transcript to fit within cost/context limits.
 * Takes at most 50 turns and 15,000 characters (whichever is smaller).
 * Keeps the earliest turns first (most relevant for detecting misuse patterns).
 */
export function truncateTranscript(transcript: TranscriptTurn[]): TranscriptTurn[] {
  const maxTurns = 50
  const maxChars = 15000

  const capped = transcript.slice(0, maxTurns)

  let totalChars = 0
  const result: TranscriptTurn[] = []
  for (const turn of capped) {
    totalChars += turn.content.length
    if (totalChars > maxChars) break
    result.push(turn)
  }

  return result
}

/**
 * Analyze a session transcript for misuse and consistency issues.
 * Uses zodResponseFormat for structured output (same pattern as generateScenarioFromComplaint).
 * Model: gpt-4.1-mini (cheaper, sufficient for classification).
 */
export async function analyzeSessionTranscript(options: {
  transcript: TranscriptTurn[]
  scenarioPrompt: string | null
  scenarioDescription: string | null
}): Promise<AnalysisResult> {
  const { transcript, scenarioPrompt, scenarioDescription } = options

  const systemPrompt = loadPrompt(getSessionAnalyzerPromptFile())

  // Truncate transcript to control cost
  const truncated = truncateTranscript(transcript)

  // Format transcript (same format as generateEvaluation)
  const transcriptText = formatTranscriptForLLM(truncated)

  // Build user message
  let userMessage = ''

  if (scenarioPrompt) {
    userMessage += `## SCENARIO PROMPT\n${scenarioPrompt}\n\n`
    if (scenarioDescription) {
      userMessage += `## SCENARIO DESCRIPTION\n${scenarioDescription}\n\n`
    }
  }

  userMessage += `## TRANSCRIPT\n\n${transcriptText}`

  const response = await getOpenAI().beta.chat.completions.parse({
    model: process.env.ANALYZER_MODEL ?? 'gpt-4.1-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    response_format: zodResponseFormat(analysisResultSchema, 'analysis_result'),
    temperature: 0.3,
  }, { timeout: 30000 })

  const message = response.choices[0].message

  if (message.refusal) {
    throw new SessionAnalysisError('refusal', message.refusal)
  }

  if (!message.parsed) {
    throw new SessionAnalysisError('parse_failure', 'Failed to parse structured response from model')
  }

  return message.parsed
}
