import OpenAI from 'openai'
import fs from 'fs'
import type { TranscriptTurn, EvaluationResponse } from '@/types'
import { loadPrompt, getEvaluatorPromptFile, getChextSimulatorPromptFile } from './prompts'

// Initialize OpenAI client
export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
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

// Helper for evaluation
export async function getEvaluation(
  transcript: string,
  scenarioContext?: string,
  options?: {
    model?: string
    promptId?: string
  }
) {
  const model = options?.model ?? process.env.EVALUATOR_MODEL ?? 'gpt-4.1'

  // Build the evaluation prompt
  const systemPrompt = `You are an expert evaluator of crisis counselor training sessions.
Analyze the transcript and provide:
1. A detailed evaluation of the counselor's performance
2. Specific strengths and areas for improvement
3. An overall letter grade (A, B, C, D, or F)

${scenarioContext ? `Scenario Context:\n${scenarioContext}\n` : ''}

Format your response as follows:
## Evaluation
[Your detailed evaluation here]

## Grade: [Letter Grade]`

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Transcript:\n${transcript}` },
    ],
    temperature: 0.3,
    max_tokens: 2000,
  })

  const content = response.choices[0].message.content ?? ''

  // Extract grade from response
  const gradeMatch = content.match(/## Grade:\s*([A-F][+-]?)/i)
  const grade = gradeMatch ? gradeMatch[1].toUpperCase() : null

  return {
    evaluation: content,
    grade,
    model,
  }
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
 * Find an existing vector store by name or create a new one
 */
async function findOrCreateVectorStore(name: string) {
  const stores = await openai.vectorStores.list()
  const existing = stores.data.find((s) => s.name === name)
  if (existing) return existing

  return openai.vectorStores.create({ name })
}

/**
 * Upload a policy file to OpenAI and add it to a vector store for the account
 */
export async function uploadPolicyToVectorStore(
  accountId: string,
  filePath: string
): Promise<{ fileId: string; vectorStoreId: string }> {
  // 1. Upload to OpenAI Files API
  const file = await openai.files.create({
    file: fs.createReadStream(filePath),
    purpose: 'assistants',
  })

  // 2. Create or get vector store
  const vectorStoreName = `account-${accountId}-policies`
  const vectorStore = await findOrCreateVectorStore(vectorStoreName)

  // 3. Add file to vector store
  await openai.vectorStores.files.create(vectorStore.id, {
    file_id: file.id,
  })

  return { fileId: file.id, vectorStoreId: vectorStore.id }
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
 * Extract letter grade from markdown evaluation
 */
function extractGrade(evaluation: string): string | null {
  // Look for "## Grade: X" pattern
  const match = evaluation.match(/##\s*Grade:\s*([A-F][+-]?)/i)
  return match ? match[1].toUpperCase() : null
}

// Helper for generating evaluation (for session evaluate route)
export async function generateEvaluation(options: {
  scenarioTitle: string
  scenarioDescription: string | null
  scenarioEvaluatorContext?: string | null
  transcript: TranscriptTurn[]
  vectorStoreId?: string
}): Promise<EvaluationResponse> {
  const { scenarioTitle, scenarioDescription, scenarioEvaluatorContext, transcript, vectorStoreId } = options

  // Load evaluator prompt from file
  const systemPrompt = loadPrompt(getEvaluatorPromptFile())

  // Format transcript
  const transcriptText = transcript
    .map((turn) => `${turn.role === 'user' ? 'Counselor' : 'Caller'}: ${turn.content}`)
    .join('\n\n')

  // Build user message with context
  let userMessage = ''

  // Add scenario context if available
  if (scenarioTitle || scenarioDescription || scenarioEvaluatorContext) {
    userMessage += '## SCENARIO EVALUATOR CONTEXT\n'
    if (scenarioTitle) userMessage += `**Scenario:** ${scenarioTitle}\n`
    if (scenarioDescription) userMessage += `**Description:** ${scenarioDescription}\n`
    if (scenarioEvaluatorContext) userMessage += `**Evaluation Criteria:**\n${scenarioEvaluatorContext}\n`
    userMessage += '\n'
  }

  // Add transcript
  userMessage += `## TRANSCRIPT\n\n${transcriptText}`

  // Use Responses API with file_search tool when vector store exists
  if (vectorStoreId) {
    const response = await openai.responses.create({
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
    })

    const evaluation = response.output_text ?? ''
    const grade = extractGrade(evaluation)

    return {
      evaluation,
      grade,
      numericScore: gradeToScore(grade),
    }
  }

  // Standard chat completion when no vector store
  const response = await openai.chat.completions.create({
    model: process.env.EVALUATOR_MODEL ?? 'gpt-4.1',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    temperature: 0.3,
    max_tokens: 3000,
  })

  const evaluation = response.choices[0].message.content ?? ''
  const grade = extractGrade(evaluation)

  return {
    evaluation,
    grade,
    numericScore: gradeToScore(grade),
  }
}
