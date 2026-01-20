import fs from 'fs'
import path from 'path'

const PROMPTS_DIR = path.join(process.cwd(), 'prompts')

/**
 * Load a prompt file by name.
 * Falls back to default if file not found.
 */
export function loadPrompt(filename: string, fallback?: string): string {
  const filePath = path.join(PROMPTS_DIR, filename)

  try {
    return fs.readFileSync(filePath, 'utf-8').trim()
  } catch {
    if (fallback !== undefined) {
      return fallback
    }
    throw new Error(`Prompt file not found: ${filename}`)
  }
}

/**
 * Load and interpolate a prompt with variables.
 * Variables use {{VARIABLE_NAME}} syntax.
 * Empty values are replaced with empty string (no placeholder left behind).
 */
export function loadPromptWithVariables(
  filename: string,
  variables: Record<string, string | undefined>,
  fallback?: string
): string {
  let prompt = loadPrompt(filename, fallback)

  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `{{${key}}}`
    // Replace with value or empty string, then clean up any resulting double newlines
    prompt = prompt.replace(new RegExp(placeholder, 'g'), value ?? '')
  }

  // Clean up multiple consecutive newlines (from empty variables)
  prompt = prompt.replace(/\n{3,}/g, '\n\n').trim()

  return prompt
}

/**
 * Get the evaluator prompt filename from environment or default.
 */
export function getEvaluatorPromptFile(): string {
  return process.env.EVALUATOR_PROMPT_FILE ?? 'evaluator-v1.txt'
}

/**
 * Get the realtime caller prompt filename from environment or default.
 */
export function getRealtimeCallerPromptFile(): string {
  return process.env.REALTIME_CALLER_PROMPT_FILE ?? 'realtime-caller.txt'
}
