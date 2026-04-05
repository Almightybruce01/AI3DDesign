'use strict';

/**
 * GPT-4o vision (+ optional image) or Groq/OpenAI text with automatic fallback.
 */
const SCHEMA_HINT = `Return ONLY valid JSON with keys:
{
  "subject": "short label (e.g. Tweety Bird pendant)",
  "researchNotes": "1-3 sentences on motif, proportions, IP-safe design language",
  "plate": {
    "mode": "rounded_rect|text_outline",
    "outlineText": "letters if text_outline (e.g. TB)",
    "outerWidthMm": number,
    "outerHeightMm": number,
    "cornerRadiusMm": number,
    "totalDepthMm": number,
    "wallThicknessMm": number
  },
  "hollow": { "enabled": true, "cagedBack": true, "cageGridCols": 6, "cageGridRows": 5 },
  "stones": {
    "interior": "baguette_grid",
    "outline": "round_pave",
    "roundStoneDiameterMm": 1.0,
    "baguetteLengthMm": 4,
    "baguetteWidthMm": 2,
    "outlineRoundCount": 48,
    "baguetteRows": 2
  },
  "connector": { "digit": "6", "chainClearanceMm": 26, "sixHeightMm": 22 },
  "parts": ["pendant_main", "six_link"],
  "cadNotes": ["assembly", "print", "casting"],
  "catalogImagePrompt": "one English prompt for a catalog render",
  "disclaimer": "Design reference only; not licensed character merch without rights."
}`;

const {
  fetchChatCompletionsWithFallback,
  openAiVisionChatUrl,
  openAiVisionHeaders,
  visionModel,
} = require('./openai-compatible');
const { chatModelForProvider } = require('./model-defaults');

async function analyzeComplexBrief({ text, imageBuffer, mimeType, env }) {
  let hasImage = imageBuffer && imageBuffer.length > 0;
  const hasOai = (env.OPENAI_API_KEY || '').trim();
  if (hasImage && !hasOai) {
    hasImage = false;
    text = `${String(text || '').slice(0, 8000)}\n\n[No OPENAI_API_KEY — image ignored; infer from text only.]`;
  }

  const userParts = [
    {
      type: 'text',
      text: String(text || '').slice(0, 8000) || 'Describe the jewelry piece to manufacture.',
    },
  ];
  if (hasImage) {
    const b64 = imageBuffer.toString('base64');
    userParts.push({
      type: 'image_url',
      image_url: { url: `data:${mimeType || 'image/jpeg'};base64,${b64}`, detail: 'high' },
    });
  }

  const systemBase = `You are a senior jewelry CAD director and gemologist. The user wants a **single JSON object** they can pass to the server build — **no markdown, no preamble**, valid JSON only.

When an **image** is included: infer silhouette, bail location, stone density (iced vs polished), and aspect ratio; **merge** with the user's text. If the user states explicit **millimetre** dimensions, those **override** visual guesses. If something is unclear, choose the **most manufacturable** defaults and document assumptions in researchNotes / cadNotes — do not ask questions inside JSON.

When **text-only**: honor every explicit size, style, and part name; map to numeric plate fields.

For famous characters, use **generic** styling in researchNotes (avoid implying licensed merch); silhouettes may come from user vector art.

${SCHEMA_HINT}`;

  const model = hasImage ? visionModel(env) : null;

  const payloadBase = {
    messages: [
      { role: 'system', content: systemBase },
      { role: 'user', content: userParts },
    ],
    max_tokens: 3500,
    temperature: 0.4,
  };
  if (env.DISABLE_OPENAI_JSON_MODE !== '1' && env.DISABLE_OPENAI_JSON_MODE !== 'true') {
    payloadBase.response_format = { type: 'json_object' };
  }

  if (hasImage) {
    const payload = { ...payloadBase, model };
    const r = await fetch(openAiVisionChatUrl(), {
      method: 'POST',
      headers: openAiVisionHeaders(env),
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      const t = await r.text();
      throw new Error(`LLM vision: ${r.status} ${t.slice(0, 400)}`);
    }
    const j = await r.json();
    const raw = j.choices?.[0]?.message?.content;
    let plan;
    try {
      plan = JSON.parse(raw);
    } catch {
      throw new Error('Model did not return valid JSON');
    }
    return { plan, modelUsed: model };
  }

  const { content, providerUsed } = await fetchChatCompletionsWithFallback(env, (p) => ({
    ...payloadBase,
    model: chatModelForProvider(env, p),
  }));
  let plan;
  try {
    plan = JSON.parse(content);
  } catch {
    throw new Error('Model did not return valid JSON');
  }
  return { plan, modelUsed: `${chatModelForProvider(env, providerUsed)} (${providerUsed})` };
}

module.exports = { analyzeComplexBrief, SCHEMA_HINT };
