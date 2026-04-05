'use strict';

/**
 * Default model IDs. Use chatModelForProvider(env, p) when posting to Groq vs OpenAI
 * so fine-tuned ft:… ids are not sent to Groq.
 */

const DEFAULT_VISION_MODEL = 'gpt-4o-2024-08-06';
const DEFAULT_OPENAI_TEXT = 'gpt-4o';

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
function visionModel(env = process.env) {
  const v = (env.OPENAI_VISION_MODEL || '').trim();
  return v || DEFAULT_VISION_MODEL;
}

/**
 * @param {string} provider groq | openai | openai_custom | keyless
 */
function chatModelForProvider(env = process.env, provider = 'openai') {
  const lm = (env.LLM_MODEL || '').trim();
  const isFt = lm.startsWith('ft:');
  if (provider === 'groq') {
    if (lm && !isFt) return lm;
    const g = (env.GROQ_CHAT_MODEL || '').trim();
    if (g) return g;
    return 'llama-3.3-70b-versatile';
  }
  if (provider === 'openai' || provider === 'openai_custom') {
    if (lm) return lm;
    if ((env.COMPLEX_TEXT_MODEL || '').trim()) return env.COMPLEX_TEXT_MODEL.trim();
    return DEFAULT_OPENAI_TEXT;
  }
  if (provider === 'keyless') {
    return lm || DEFAULT_OPENAI_TEXT;
  }
  return DEFAULT_OPENAI_TEXT;
}

/**
 * Copilot / general JSON — model string per routed provider.
 */
function copilotModelForProvider(env = process.env, provider = 'openai') {
  const w = (env.WORKSHOP_COPILOT_MODEL || '').trim();
  if (w && provider !== 'groq') return w;
  if (provider === 'groq') return chatModelForProvider(env, 'groq');
  return w || chatModelForProvider(env, provider === 'openai_custom' ? 'openai_custom' : 'openai') || 'gpt-4o-mini';
}

/**
 * Prompt expansion for catalog images.
 */
function enhancePromptModelForProvider(env = process.env, provider = 'openai') {
  const o = (env.OPENAI_CHAT_MODEL || env.LLM_MODEL || '').trim();
  if (provider === 'groq') {
    if (o && !o.startsWith('ft:')) return o;
    return (env.GROQ_CHAT_MODEL || '').trim() || 'llama-3.3-70b-versatile';
  }
  return o || 'gpt-4o-mini';
}

/**
 * Complex Design Studio — legacy single model hint (prefer chatModelForProvider in new code).
 */
function complexTextModel(env = process.env) {
  if ((env.COMPLEX_TEXT_MODEL || '').trim()) return env.COMPLEX_TEXT_MODEL.trim();
  const g = (env.GROQ_API_KEY || '').trim();
  const o = (env.OPENAI_API_KEY || '').trim();
  const prefer = (env.LLM_PRIMARY || '').trim().toLowerCase();
  if (g && o) return chatModelForProvider(env, prefer === 'openai' ? 'openai' : 'groq');
  if (g && !o) return chatModelForProvider(env, 'groq');
  if (o && !g) return chatModelForProvider(env, 'openai');
  return DEFAULT_OPENAI_TEXT;
}

module.exports = {
  DEFAULT_VISION_MODEL,
  DEFAULT_OPENAI_TEXT,
  visionModel,
  complexTextModel,
  chatModelForProvider,
  copilotModelForProvider,
  enhancePromptModelForProvider,
};
