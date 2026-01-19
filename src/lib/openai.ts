import OpenAI from 'openai';
import { env } from './env';
import type { EvaluationResult, TranscriptTurn } from '@/types';

// Initialize OpenAI client
export const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
});

// Default system prompt for chat simulator
const DEFAULT_CHAT_SIMULATOR_PROMPT = `You are a caller contacting a crisis hotline. You are roleplaying as someone in distress to help train crisis counselors.

Guidelines:
- Stay in character as the caller throughout the conversation
- Respond naturally as someone would in a real crisis situation
- Be realistic but not overwhelming - allow the counselor trainee to practice their skills
- If the counselor uses appropriate techniques, respond positively
- If the counselor makes mistakes, reflect that in your responses realistically
- Never break character or mention that this is a training exercise`;

// Default system prompt for evaluator
const DEFAULT_EVALUATOR_PROMPT = `You are an expert evaluator for crisis counselor training sessions. Your task is to evaluate a counselor trainee's performance based on their conversation transcript.

Evaluate the counselor on the following dimensions:
1. Active Listening - Did they demonstrate they were hearing the caller?
2. Empathy - Did they express understanding of the caller's feelings?
3. Safety Assessment - Did they appropriately assess any safety concerns?
4. De-escalation - Did they use appropriate techniques to help calm the caller?
5. Resource Provision - Did they offer appropriate resources or next steps?
6. Professionalism - Did they maintain appropriate boundaries and tone?

Provide your evaluation in the following JSON format:
{
  "overallScore": <number 0-100>,
  "dimensions": {
    "activeListening": { "score": <number 0-100>, "feedback": "<specific feedback>" },
    "empathy": { "score": <number 0-100>, "feedback": "<specific feedback>" },
    "safetyAssessment": { "score": <number 0-100>, "feedback": "<specific feedback>" },
    "deEscalation": { "score": <number 0-100>, "feedback": "<specific feedback>" },
    "resourceProvision": { "score": <number 0-100>, "feedback": "<specific feedback>" },
    "professionalism": { "score": <number 0-100>, "feedback": "<specific feedback>" }
  },
  "strengths": ["<strength 1>", "<strength 2>", ...],
  "areasToImprove": ["<area 1>", "<area 2>", ...],
  "overallFeedback": "<summary feedback>"
}`;

interface ChatCompletionOptions {
  scenarioPrompt: string;
  transcript: TranscriptTurn[];
  vectorStoreId?: string;
}

/**
 * Get a chat completion from OpenAI for the chat simulator
 */
export async function getChatCompletion({
  scenarioPrompt,
  transcript,
  vectorStoreId,
}: ChatCompletionOptions): Promise<string> {
  // Build the system prompt
  const systemPrompt = `${DEFAULT_CHAT_SIMULATOR_PROMPT}

Scenario Instructions:
${scenarioPrompt}`;

  // Convert transcript to messages format
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...transcript.map((turn) => ({
      role: turn.role as 'user' | 'assistant' | 'system',
      content: turn.content,
    })),
  ];

  // Use stored prompt if available, otherwise use regular completion
  if (env.CHAT_SIMULATOR_PROMPT_ID) {
    // Using stored prompts (Responses API)
    const response = await openai.responses.create({
      model: env.CHAT_SIMULATOR_MODEL,
      input: messages.map((m) => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content as string,
      })),
      // @ts-expect-error - prompt_id is a valid parameter for responses API
      prompt_id: env.CHAT_SIMULATOR_PROMPT_ID,
      ...(vectorStoreId && {
        tools: [{ type: 'file_search', vector_store_ids: [vectorStoreId] }],
      }),
    });

    // Extract text from response
    const textOutput = response.output.find((o) => o.type === 'message');
    if (textOutput && textOutput.type === 'message') {
      const textContent = textOutput.content.find((c) => c.type === 'output_text');
      if (textContent && textContent.type === 'output_text') {
        return textContent.text;
      }
    }
    throw new Error('No text output in response');
  } else {
    // Regular chat completion
    const response = await openai.chat.completions.create({
      model: env.CHAT_SIMULATOR_MODEL,
      messages,
      temperature: 0.7,
      max_tokens: 500,
    });

    return response.choices[0]?.message?.content || '';
  }
}

interface EvaluationOptions {
  scenarioTitle: string;
  scenarioDescription?: string | null;
  transcript: TranscriptTurn[];
  vectorStoreId?: string;
}

/**
 * Generate an evaluation of the counselor's performance
 */
export async function generateEvaluation({
  scenarioTitle,
  scenarioDescription,
  transcript,
  vectorStoreId,
}: EvaluationOptions): Promise<EvaluationResult> {
  // Build the evaluation prompt
  const userPrompt = `Please evaluate the following crisis counselor training session.

Scenario: ${scenarioTitle}
${scenarioDescription ? `Description: ${scenarioDescription}` : ''}

Transcript:
${transcript
  .map(
    (turn) =>
      `${turn.role === 'user' ? 'COUNSELOR' : turn.role === 'assistant' ? 'CALLER' : 'SYSTEM'}: ${turn.content}`
  )
  .join('\n\n')}

Please provide your evaluation in the specified JSON format.`;

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: DEFAULT_EVALUATOR_PROMPT },
    { role: 'user', content: userPrompt },
  ];

  let responseText: string;

  if (env.EVALUATOR_PROMPT_ID) {
    // Using stored prompts (Responses API)
    const response = await openai.responses.create({
      model: env.EVALUATOR_MODEL,
      input: messages.map((m) => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content as string,
      })),
      // @ts-expect-error - prompt_id is a valid parameter for responses API
      prompt_id: env.EVALUATOR_PROMPT_ID,
      ...(vectorStoreId && {
        tools: [{ type: 'file_search', vector_store_ids: [vectorStoreId] }],
      }),
    });

    // Extract text from response
    const textOutput = response.output.find((o) => o.type === 'message');
    if (textOutput && textOutput.type === 'message') {
      const textContent = textOutput.content.find((c) => c.type === 'output_text');
      if (textContent && textContent.type === 'output_text') {
        responseText = textContent.text;
      } else {
        throw new Error('No text output in response');
      }
    } else {
      throw new Error('No message output in response');
    }
  } else {
    // Regular chat completion with JSON mode
    const response = await openai.chat.completions.create({
      model: env.EVALUATOR_MODEL,
      messages,
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });

    responseText = response.choices[0]?.message?.content || '{}';
  }

  // Parse the JSON response
  try {
    const parsed = JSON.parse(responseText);

    return {
      overallScore: parsed.overallScore || 0,
      strengths: parsed.strengths || [],
      areasToImprove: parsed.areasToImprove || [],
      feedback: parsed.dimensions || {},
      rawResponse: responseText,
    };
  } catch {
    // If parsing fails, return a default evaluation
    return {
      overallScore: 0,
      strengths: [],
      areasToImprove: ['Unable to parse evaluation response'],
      feedback: {},
      rawResponse: responseText,
    };
  }
}

/**
 * Generate an initial greeting from the caller for a session
 */
export async function generateInitialGreeting(scenarioPrompt: string): Promise<string> {
  const response = await getChatCompletion({
    scenarioPrompt,
    transcript: [
      {
        id: 'init',
        role: 'system',
        content:
          'The call has just connected. Begin the conversation as the caller would naturally start.',
        turnOrder: 0,
        createdAt: new Date(),
      },
    ],
  });

  return response;
}
