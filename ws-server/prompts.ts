import { readFileSync } from "fs";
import { join } from "path";

// Prompts directory is at project root level
// Works when running from project root (npm run ws:dev) or ws-server dir
const PROMPTS_DIR = join(process.cwd(), "prompts");

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
