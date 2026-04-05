/** Same routing as AI3DDesign/lib/openai-compatible.js — Groq optional, no Cursor dependency. */

const GROQ_DEFAULT_BASE = 'https://api.groq.com/openai/v1';
const OPENAI_DEFAULT_BASE = 'https://api.openai.com/v1';

/** Pinned GPT-4o snapshot for vision (Complex + chain photo on workshop). Override with OPENAI_VISION_MODEL. */
export const DEFAULT_VISION_MODEL = 'gpt-4o-2024-08-06';

export function defaultVisionModel(): string {
  return (process.env.OPENAI_VISION_MODEL || '').trim() || DEFAULT_VISION_MODEL;
}

export function resolveLlmApiKey(): string {
  const o = (process.env.OPENAI_API_KEY || '').trim();
  if (o) return o;
  return (process.env.GROQ_API_KEY || '').trim();
}

export function openaiApiBase(): string {
  const explicit = (process.env.OPENAI_BASE_URL || '').trim();
  if (explicit) return explicit.replace(/\/$/, '');
  if ((process.env.OPENAI_API_KEY || '').trim()) return OPENAI_DEFAULT_BASE;
  if ((process.env.GROQ_API_KEY || '').trim()) return GROQ_DEFAULT_BASE;
  return OPENAI_DEFAULT_BASE;
}

export function llmConfigured(): boolean {
  if (resolveLlmApiKey()) return true;
  return process.env.OPENAI_ALLOW_NO_KEY === '1' || process.env.OPENAI_ALLOW_NO_KEY === 'true';
}

export function defaultChatModel(): string {
  if ((process.env.LLM_MODEL || '').trim()) return process.env.LLM_MODEL!.trim();
  if ((process.env.GROQ_API_KEY || '').trim() && !(process.env.OPENAI_API_KEY || '').trim()) {
    return 'llama-3.3-70b-versatile';
  }
  return 'gpt-4o';
}
