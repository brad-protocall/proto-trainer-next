import OpenAI from 'openai'

// Initialize OpenAI client
export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// Helper for chat completions
export async function getChatCompletion(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  options?: {
    model?: string
    temperature?: number
    maxTokens?: number
  }
) {
  const response = await openai.chat.completions.create({
    model: options?.model ?? process.env.CHAT_SIMULATOR_MODEL ?? 'gpt-4o',
    messages,
    temperature: options?.temperature ?? 0.7,
    max_tokens: options?.maxTokens ?? 1000,
  })

  return response.choices[0].message.content
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
  const model = options?.model ?? process.env.CHAT_SIMULATOR_MODEL ?? 'gpt-4o'

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
