'use strict';

/**
 * Chat / vision calls use OpenAI-shaped HTTP (POST …/v1/chat/completions).
 *
 * Text chat:
 * - Primary provider: LLM_PRIMARY=groq|openai (default: groq when GROQ_API_KEY is set — your fine-tune / fast path)
 * - Fallback: other key if the first request fails (rate limit, empty content, 5xx)
 *
 * Vision (GPT-4o): OPENAI_API_KEY only. Groq cannot read images.
 *
 * DALL·E / images API: always uses OPENAI host (see imagesGenerationsUrl), not Groq.
 */

const GROQ_DEFAULT_BASE = 'https://api.groq.com/openai/v1';
const OPENAI_DEFAULT_BASE = 'https://api.openai.com/v1';

const {
  visionModel,
  complexTextModel,
  chatModelForProvider,
  DEFAULT_VISION_MODEL,
  DEFAULT_OPENAI_TEXT,
} = require('./model-defaults');

function hasGroqKey(env = process.env) {
  return !!(env.GROQ_API_KEY || '').trim();
}

function hasOpenAiKey(env = process.env) {
  return !!(env.OPENAI_API_KEY || '').trim();
}

function allowNoKey(env = process.env) {
  return env.OPENAI_ALLOW_NO_KEY === '1' || env.OPENAI_ALLOW_NO_KEY === 'true';
}

function resolveLlmApiKey(env = process.env) {
  const o = (env.OPENAI_API_KEY || '').trim();
  const g = (env.GROQ_API_KEY || '').trim();
  const prefer = (env.LLM_PRIMARY || '').trim().toLowerCase();
  if (prefer === 'openai' && o) return o;
  if (prefer === 'groq' && g) return g;
  /** Default when both keys: Groq first (OpenAI reserved for fallback / vision / DALL·E). */
  if (g && o) return g;
  if (o) return o;
  return g;
}

function openaiApiBase(env = process.env) {
  const explicit = (env.OPENAI_BASE_URL || '').trim();
  if (explicit) return explicit.replace(/\/$/, '');
  const o = (env.OPENAI_API_KEY || '').trim();
  const g = (env.GROQ_API_KEY || '').trim();
  const prefer = (env.LLM_PRIMARY || '').trim().toLowerCase();
  if (prefer === 'openai' && o) return OPENAI_DEFAULT_BASE;
  if (prefer === 'groq' && g) return GROQ_DEFAULT_BASE;
  if (g && o) return GROQ_DEFAULT_BASE;
  if (o) return OPENAI_DEFAULT_BASE;
  if (g) return GROQ_DEFAULT_BASE;
  return OPENAI_DEFAULT_BASE;
}

function chatCompletionsUrl(env = process.env) {
  return `${openaiApiBase(env)}/chat/completions`;
}

/** DALL·E / compatible image API — never Groq. */
function imagesGenerationsUrl(env = process.env) {
  const explicit = (env.OPENAI_BASE_URL || '').trim();
  if (explicit) return `${explicit.replace(/\/$/, '')}/images/generations`;
  return `${OPENAI_DEFAULT_BASE}/images/generations`;
}

/** True if the app should attempt LLM chat (OpenAI key, Groq key, or keyless). */
function llmConfigured(env = process.env) {
  if (resolveLlmApiKey(env)) return true;
  return allowNoKey(env);
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

/** Headers for chat/completions using primary provider (Groq-first when both keys). */
function chatHeaders(env = process.env) {
  assertLlmConfigured(env);
  const h = { 'Content-Type': 'application/json' };
  const key = resolveLlmApiKey(env);
  if (key) h.Authorization = `Bearer ${key}`;
  return h;
}

function chatUrlAndHeadersForProvider(env, provider) {
  if (provider === 'groq') {
    return {
      url: `${GROQ_DEFAULT_BASE}/chat/completions`,
      headers: {
        Authorization: `Bearer ${(env.GROQ_API_KEY || '').trim()}`,
        'Content-Type': 'application/json',
      },
    };
  }
  if (provider === 'openai') {
    return {
      url: `${OPENAI_DEFAULT_BASE}/chat/completions`,
      headers: {
        Authorization: `Bearer ${(env.OPENAI_API_KEY || '').trim()}`,
        'Content-Type': 'application/json',
      },
    };
  }
  if (provider === 'openai_custom') {
    const b = (env.OPENAI_BASE_URL || '').trim().replace(/\/$/, '');
    return {
      url: `${b}/chat/completions`,
      headers: {
        Authorization: `Bearer ${(env.OPENAI_API_KEY || '').trim()}`,
        'Content-Type': 'application/json',
      },
    };
  }
  if (provider === 'keyless') {
    const b = (env.OPENAI_BASE_URL || '').trim().replace(/\/$/, '') || OPENAI_DEFAULT_BASE;
    return { url: `${b}/chat/completions`, headers: { 'Content-Type': 'application/json' } };
  }
  throw new Error(`unknown chat provider: ${provider}`);
}

/**
 * Order: custom OpenAI base first if set; else LLM_PRIMARY (default groq when both keys);
 * then the other vendor as fallback.
 */
function providersToTry(env = process.env) {
  const g = hasGroqKey(env);
  const o = hasOpenAiKey(env);
  const explicit = (env.OPENAI_BASE_URL || '').trim();
  const keyless = allowNoKey(env);
  const prefer = (env.LLM_PRIMARY || '').trim().toLowerCase();

  const out = [];
  if (explicit && o) {
    out.push('openai_custom');
    if (g) out.push('groq');
    return out;
  }

  const primary =
    prefer === 'openai' ? 'openai' : prefer === 'groq' ? 'groq' : g ? 'groq' : o ? 'openai' : null;

  if (primary === 'groq' && g) out.push('groq');
  else if (primary === 'openai' && o) out.push('openai');
  else if (g) out.push('groq');
  else if (o) out.push('openai');

  if (out[0] === 'groq' && o) out.push('openai');
  else if (out[0] === 'openai' && g) out.push('groq');

  if (out.length === 0 && keyless) out.push('keyless');
  return out;
}

/**
 * POST chat/completions with Groq-first + OpenAI fallback for text models.
 * @param {object} payload - must include `messages`; `model` is overwritten per provider via payloadBuilder if provided
 * @param {(provider: string) => object} [payloadBuilder] - (provider) => full payload
 */
async function fetchChatCompletionsWithFallback(env, payloadOrFactory) {
  const providers = providersToTry(env);
  if (providers.length === 0) assertLlmConfigured(env);

  let lastErr;
  for (const p of providers) {
    try {
      const payload =
        typeof payloadOrFactory === 'function' ? payloadOrFactory(p) : { ...payloadOrFactory };
      const { url, headers } = chatUrlAndHeadersForProvider(env, p);
      const r = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      const t = await r.text();
      if (!r.ok) {
        lastErr = new Error(`LLM ${p}: ${r.status} ${t.slice(0, 400)}`);
        continue;
      }
      let j;
      try {
        j = JSON.parse(t);
      } catch (e) {
        lastErr = e;
        continue;
      }
      const content = j.choices?.[0]?.message?.content;
      if (!content || !String(content).trim()) {
        lastErr = new Error(`LLM ${p}: empty content`);
        continue;
      }
      return { json: j, providerUsed: p, content: String(content).trim() };
    } catch (e) {
      lastErr = e;
    }
  }
  if (lastErr) throw lastErr;
  throw new Error('LLM: no provider succeeded');
}

function openAiVisionChatUrl() {
  return `${OPENAI_DEFAULT_BASE}/chat/completions`;
}

function assertOpenAiKeyForVision(env = process.env) {
  const key = (env.OPENAI_API_KEY || '').trim();
  if (!key) {
    const err = new Error(
      'This vision step requires OPENAI_API_KEY (GPT-4o). Groq covers text-only chat — add an OpenAI key for photo analysis, or use text-only / notes-only chain flow.',
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

module.exports = {
  hasGroqKey,
  hasOpenAiKey,
  resolveLlmApiKey,
  openaiApiBase,
  chatCompletionsUrl,
  imagesGenerationsUrl,
  llmConfigured,
  assertLlmConfigured,
  chatHeaders,
  providersToTry,
  fetchChatCompletionsWithFallback,
  chatUrlAndHeadersForProvider,
  openAiVisionChatUrl,
  openAiVisionHeaders,
  GROQ_DEFAULT_BASE,
  OPENAI_DEFAULT_BASE,
  visionModel,
  complexTextModel,
  chatModelForProvider,
  DEFAULT_VISION_MODEL,
  DEFAULT_OPENAI_TEXT,
};
