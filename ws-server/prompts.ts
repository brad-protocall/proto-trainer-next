import { readFileSync, existsSync } from "fs";
import { join } from "path";

// Prompts directory: try parent directory first (when running from ws-server/),
// then current directory (when running from project root)
function getPromptsDir(): string {
  const parentPrompts = join(process.cwd(), "..", "prompts");
  if (existsSync(parentPrompts)) {
    return parentPrompts;
  }
  return join(process.cwd(), "prompts");
}

const PROMPTS_DIR = getPromptsDir();

/**
 * Load a prompt file by name.
 * Falls back to default if file not found.
 */
export function loadPrompt(filename: string, fallback?: string): string {
  const filePath = join(PROMPTS_DIR, filename);

  try {
    return readFileSync(filePath, "utf-8").trim();
  } catch {
    if (fallback !== undefined) {
      return fallback;
    }
    throw new Error(`Prompt file not found: ${filename}`);
  }
}

/**
 * Get the realtime caller prompt filename from environment or default.
 */
export function getRealtimeCallerPromptFile(): string {
  return process.env.REALTIME_CALLER_PROMPT_FILE ?? "realtime-caller.txt";
}
