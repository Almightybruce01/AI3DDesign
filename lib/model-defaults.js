'use strict';

/**
 * Single source of truth for default model IDs (override via env).
 * Vision: pinned GPT-4o snapshot (strong multimodal). Text: fine-tune (LLM_MODEL) or frontier fallback.
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
 * Complex Design Studio — text-only path (no image).
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
function complexTextModel(env = process.env) {
  if ((env.COMPLEX_TEXT_MODEL || '').trim()) return env.COMPLEX_TEXT_MODEL.trim();
  if ((env.LLM_MODEL || '').trim()) return env.LLM_MODEL.trim();
  if ((env.GROQ_API_KEY || '').trim() && !(env.OPENAI_API_KEY || '').trim()) {
    return 'llama-3.3-70b-versatile';
  }
  return DEFAULT_OPENAI_TEXT;
}

module.exports = {
  DEFAULT_VISION_MODEL,
  DEFAULT_OPENAI_TEXT,
  visionModel,
  complexTextModel,
};
