'use strict';

/**
 * Chat / vision calls use OpenAI-shaped HTTP (POST …/v1/chat/completions).
 *
 * Providers:
 * - OpenAI (default): OPENAI_API_KEY + optional OPENAI_BASE_URL
 * - Groq (free tier, fast): GROQ_API_KEY — set alone and we default base to Groq unless OPENAI_BASE_URL is set
 * - Other: OPENAI_BASE_URL + OPENAI_API_KEY (OpenRouter, Together, Ollama tunnel, …)
 * - Keyless: OPENAI_ALLOW_NO_KEY=1 for local compatible servers
 *
 * Vision (GPT-4o image inputs) still requires OPENAI_API_KEY in routes that use images — Groq chat is text-only there.
 */

const GROQ_DEFAULT_BASE = 'https://api.groq.com/openai/v1';
const OPENAI_DEFAULT_BASE = 'https://api.openai.com/v1';

function resolveLlmApiKey(env = process.env) {
  const o = (env.OPENAI_API_KEY || '').trim();
  if (o) return o;
  return (env.GROQ_API_KEY || '').trim();
}

function openaiApiBase(env = process.env) {
  const explicit = (env.OPENAI_BASE_URL || '').trim();
  if (explicit) return explicit.replace(/\/$/, '');
  const o = (env.OPENAI_API_KEY || '').trim();
  const g = (env.GROQ_API_KEY || '').trim();
  if (o) return OPENAI_DEFAULT_BASE;
  if (g) return GROQ_DEFAULT_BASE;
  return OPENAI_DEFAULT_BASE;
}

function chatCompletionsUrl(env = process.env) {
  return `${openaiApiBase(env)}/chat/completions`;
}

function imagesGenerationsUrl(env = process.env) {
  return `${openaiApiBase(env)}/images/generations`;
}

/** True if the app should attempt LLM chat (OpenAI key, Groq key, or keyless). */
function llmConfigured(env = process.env) {
  if (resolveLlmApiKey(env)) return true;
  return env.OPENAI_ALLOW_NO_KEY === '1' || env.OPENAI_ALLOW_NO_KEY === 'true';
}

function assertLlmConfigured(env = process.env) {
  if (!llmConfigured(env)) {
    const err = new Error(
      'LLM not configured: set OPENAI_API_KEY, or GROQ_API_KEY (free tier at console.groq.com), or OPENAI_BASE_URL + OPENAI_ALLOW_NO_KEY=1 for local Ollama.',
    );
    err.code = 'NO_OPENAI';
    throw err;
  }
}

/** Headers for chat/completions (Bearer from OpenAI or Groq key). */
function chatHeaders(env = process.env) {
  assertLlmConfigured(env);
  const h = { 'Content-Type': 'application/json' };
  const key = resolveLlmApiKey(env);
  if (key) h.Authorization = `Bearer ${key}`;
  return h;
}

/** OpenAI-only URL for vision (chain photo, image briefs). Groq does not support this path. */
function openAiVisionChatUrl() {
  return `${OPENAI_DEFAULT_BASE}/chat/completions`;
}

function assertOpenAiKeyForVision(env = process.env) {
  const key = (env.OPENAI_API_KEY || '').trim();
  if (!key) {
    const err = new Error(
      'This vision step requires OPENAI_API_KEY (GPT-4o). Groq covers text-only chat/copilot — add an OpenAI key for photo analysis and image briefs, or use text-only.',
    );
    err.code = 'NO_OPENAI_VISION';
    throw err;
  }
  return key;
}

function openAiVisionHeaders(env = process.env) {
  const key = assertOpenAiKeyForVision(env);
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

const { visionModel, complexTextModel, DEFAULT_VISION_MODEL, DEFAULT_OPENAI_TEXT } = require('./model-defaults');

module.exports = {
  resolveLlmApiKey,
  openaiApiBase,
  chatCompletionsUrl,
  imagesGenerationsUrl,
  llmConfigured,
  assertLlmConfigured,
  chatHeaders,
  openAiVisionChatUrl,
  openAiVisionHeaders,
  GROQ_DEFAULT_BASE,
  OPENAI_DEFAULT_BASE,
  visionModel,
  complexTextModel,
  DEFAULT_VISION_MODEL,
  DEFAULT_OPENAI_TEXT,
};
