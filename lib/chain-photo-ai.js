'use strict';

const {
  openAiVisionChatUrl,
  openAiVisionHeaders,
  visionModel,
  fetchChatCompletionsWithFallback,
  hasGroqKey,
  hasOpenAiKey,
} = require('./openai-compatible');
const { chatModelForProvider } = require('./model-defaults');
const path = require('path');
const fs = require('fs').promises;
const { getFeedbackPromptSlice } = require('./vision-feedback');

const FEWSHOT = `Example JSON outputs (follow structure and units):

Example A — User: "Make it wider and more iced"
{"chainType":"miami_cuban","estimatedFaceWidthMm":14,"estimatedLengthIn":20,"confidence":"medium","styleNotes":"Uniform Miami-style bars; clasp partly visible.","claspVisible":true,"printSpec":{"linkWidthMm":14,"chainLengthIn":20,"thicknessRatio":0.44,"styleIdHint":"iced_pave"},"dallePrompt":"18k yellow Miami Cuban chain, 14mm face, 20 inch, micro-pavé on link faces, box clasp with figure-8 safety, studio macro, neutral seamless.","printReadinessNotes":["Export STL in millimetres","Check minimum feature size ≥0.35mm for FDM supports"]}

Example B — User: "Thinner profile, same length"
{"chainType":"miami_cuban","estimatedFaceWidthMm":10,"estimatedLengthIn":24,"confidence":"low","styleNotes":"Photo blurry; width estimate uncertain.","claspVisible":false,"printSpec":{"linkWidthMm":10,"chainLengthIn":24,"thicknessRatio":0.38,"styleIdHint":"hollow_light"},"dallePrompt":"...","printReadinessNotes":["Verify width with calipers before final print"]}
`;

function buildSystemPrompt(referenceSnippet, presetIdSample) {
  return `You are a senior jewelry CAD engineer and metrologist. The user describes a chain (often Miami Cuban). They may upload a photo — if there is no photo, infer targets only from their text and reasonable defaults.

${FEWSHOT}

Technical reference (use for vocabulary; estimates may still be uncertain from a single photo):
${String(referenceSnippet).slice(0, 12000)}

Respond with ONLY a JSON object (no markdown fences) with these keys:
- chainType: string — one of miami_cuban, curb, rope, figaro, other, unknown
- estimatedFaceWidthMm: number (8–26 typical for Miami retail)
- estimatedLengthIn: number (16–30 common) — guess from drape if ruler not visible; state uncertainty in styleNotes
- confidence: "high" | "medium" | "low"
- styleNotes: string — what you infer (finish, stones, clasp, defects) or "text-only request"
- claspVisible: boolean
- userRequestedChanges: string — concise restatement of the user's edit request
- printSpec: { linkWidthMm, chainLengthIn, thicknessRatio (0.34–0.48), styleIdHint: one of classic_solid, semi_hollow, hollow_light, iced_pave, channel_baguette, two_tone, white_rhodium, rose_gold, satin_brushed, beveled_edge }
- matchedPresetId: string or null — best matching preset id from the catalog list below if confident, else null
- dallePrompt: string — one detailed English prompt for a catalog-quality render of the TARGET design (after edits)
- printReadinessNotes: string[] — checklist for FDM/resin/wax printing (units mm, manifold, supports)

Catalog preset ids sample (match closest linkWidthMm + chainLengthIn): ${presetIdSample || 'cuban_000…cuban_099'}

If the request is not a chain, still return JSON with chainType "unknown" and explain in styleNotes.
${getFeedbackPromptSlice(12)}`;
}

/**
 * Text-only chain analysis (Groq primary + OpenAI fallback). No image.
 */
async function analyzeChainPhotoNotesOnly(opts) {
  const { userNotes, referenceSnippet = '', env, presetIdSample } = opts;
  const system = buildSystemPrompt(referenceSnippet, presetIdSample);
  const userText =
    String(userNotes || '').trim() ||
    'Infer a Miami Cuban–style print spec from context. Suggest link width (mm), length (in), thickness ratio.';

  const payloadBase = {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userText },
    ],
    max_tokens: 2500,
    temperature: 0.35,
  };
  if (env.DISABLE_OPENAI_JSON_MODE !== '1' && env.DISABLE_OPENAI_JSON_MODE !== 'true') {
    payloadBase.response_format = { type: 'json_object' };
  }

  const { content, providerUsed } = await fetchChatCompletionsWithFallback(env, (p) => ({
    ...payloadBase,
    model: chatModelForProvider(env, p),
  }));

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    throw new Error('Chain text model did not return valid JSON');
  }
  return {
    analysis: parsed,
    modelUsed: `${chatModelForProvider(env, providerUsed)} (${providerUsed}, text-only)`,
    rawText: content,
  };
}

async function analyzeChainPhotoVision(opts) {
  const { imageBuffer, mimeType, userNotes, referenceSnippet = '', env } = opts;

  const model = visionModel(env);
  const b64 = imageBuffer.toString('base64');
  const dataUrl = `data:${mimeType || 'image/jpeg'};base64,${b64}`;

  const system = `You are a senior jewelry CAD engineer and metrologist. The user uploads a photo of a chain (often Miami Cuban). They also describe what they want changed.

${FEWSHOT}

Technical reference (use for vocabulary; estimates may still be uncertain from a single photo):
${String(referenceSnippet).slice(0, 12000)}

Respond with ONLY a JSON object (no markdown fences) with these keys:
- chainType: string — one of miami_cuban, curb, rope, figaro, other, unknown
- estimatedFaceWidthMm: number (8–26 typical for Miami retail)
- estimatedLengthIn: number (16–30 common) — guess from drape if ruler not visible; state uncertainty in styleNotes
- confidence: "high" | "medium" | "low"
- styleNotes: string — what you see (finish, stones, clasp, defects)
- claspVisible: boolean
- userRequestedChanges: string — concise restatement of the user's edit request
- printSpec: { linkWidthMm, chainLengthIn, thicknessRatio (0.34–0.48), styleIdHint: one of classic_solid, semi_hollow, hollow_light, iced_pave, channel_baguette, two_tone, white_rhodium, rose_gold, satin_brushed, beveled_edge }
- matchedPresetId: string or null — best matching preset id from the catalog list below if confident, else null
- dallePrompt: string — one detailed English prompt for a catalog-quality render of the TARGET design (after edits), not the raw photo
- printReadinessNotes: string[] — checklist for FDM/resin/wax printing (units mm, manifold, supports)

Catalog preset ids sample (match closest linkWidthMm + chainLengthIn): ${opts.presetIdSample || 'cuban_000…cuban_099'}

If the image is not a chain, still return JSON with chainType "unknown" and explain in styleNotes.
${getFeedbackPromptSlice(12)}`;

  const userText =
    String(userNotes || '').trim() ||
    'Analyze this chain. Estimate face width and length. Suggest print-ready CAD targets.';

  const payload = {
    model,
    messages: [
      { role: 'system', content: system },
      {
        role: 'user',
        content: [
          { type: 'text', text: userText },
          { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
        ],
      },
    ],
    max_tokens: 2500,
    temperature: 0.35,
  };
  if (env.DISABLE_OPENAI_JSON_MODE !== '1' && env.DISABLE_OPENAI_JSON_MODE !== 'true') {
    payload.response_format = { type: 'json_object' };
  }

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
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error('Vision model did not return valid JSON');
  }
  return { analysis: parsed, modelUsed: model, rawText: raw };
}

/**
 * Vision when OPENAI_API_KEY + image; otherwise text-only Groq→OpenAI fallback.
 * If vision fails and Groq is available, optional fallback to text-only (set LLM_VISION_FALLBACK_NOTES=0 to disable).
 */
async function analyzeChainPhoto(opts) {
  const { imageBuffer, mimeType, userNotes, referenceSnippet = '', env } = opts;
  const hasImage = imageBuffer && imageBuffer.length > 0;
  const oai = hasOpenAiKey(env);
  const groq = hasGroqKey(env);

  if (!hasImage || !oai) {
    return analyzeChainPhotoNotesOnly({ ...opts, userNotes });
  }

  try {
    return await analyzeChainPhotoVision(opts);
  } catch (e) {
    const allowNotesFallback =
      groq && env.LLM_VISION_FALLBACK_NOTES !== '0' && env.LLM_VISION_FALLBACK_NOTES !== 'false';
    if (allowNotesFallback) {
      const extra =
        `\n\n[Vision step failed (${String(e.message || e).slice(0, 200)}); infer print spec from these notes only.]`;
      return analyzeChainPhotoNotesOnly({
        ...opts,
        userNotes: String(userNotes || '') + extra,
      });
    }
    throw e;
  }
}

/**
 * Photo-to-photo (instruction edit) via Replicate instruct-pix2pix.
 * Saves PNG to generated/
 */
async function refineChainImageReplicate(opts) {
  const { imageBuffer, instruction, env, root, sharp } = opts;
  const token = env.REPLICATE_API_TOKEN;
  if (!token) {
    const err = new Error('Add REPLICATE_API_TOKEN for photo-to-photo refinement.');
    err.code = 'NO_REPLICATE';
    throw err;
  }

  const pngBuf = await sharp(imageBuffer)
    .png({ compressionLevel: 9 })
    .toBuffer();
  const dataUri = `data:image/png;base64,${pngBuf.toString('base64')}`;

  const model =
    env.REPLICATE_PIX2PIX_MODEL || 'timothybrooks/instruct-pix2pix';
  const prompt = [
    'Same chain composition and jewelry subject; luxury product photo.',
    String(instruction || 'sharpen detail and improve studio lighting').slice(0, 600),
  ].join(' ');

  const steps = Math.min(100, Math.max(10, parseInt(env.REPLICATE_PIX2PIX_STEPS, 10) || 20));
  const guidance = Math.min(10, Math.max(1, parseFloat(env.REPLICATE_PIX2PIX_GUIDANCE) || 1.2));

  async function createPred(input) {
    return fetch(`https://api.replicate.com/v1/models/${model}/predictions`, {
      method: 'POST',
      headers: {
        Authorization: `Token ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ input }),
    });
  }

  let input = {
    input_image: dataUri,
    prompt,
    num_inference_steps: steps,
    image_guidance_scale: guidance,
  };
  let cr = await createPred(input);
  if (!cr.ok) {
    input = { image: dataUri, prompt, num_inference_steps: steps };
    cr = await createPred(input);
  }
  if (!cr.ok) {
    const t = await cr.text();
    const err = new Error(`Replicate pix2pix: ${cr.status} ${t.slice(0, 400)}`);
    err.code = 'REPLICATE_FAIL';
    throw err;
  }

  const pred = await cr.json();
  const getUrl = pred.urls?.get;
  if (!getUrl) throw new Error('Replicate: no poll URL');

  const { pollReplicate } = require('./ai-images');
  const output = await pollReplicate(getUrl, token, 180000);
  const url = Array.isArray(output) ? output[0] : output;
  if (!url || typeof url !== 'string') throw new Error('Replicate: bad output');

  const img = await fetch(url);
  if (!img.ok) throw new Error('Replicate: download failed');
  const buf = Buffer.from(await img.arrayBuffer());
  const name = `chain_refine_${Date.now()}.png`;
  const rel = path.posix.join('generated', name);
  await fs.writeFile(path.join(root, 'generated', name), buf);
  return { imagePath: rel, predictionId: pred.id };
}

module.exports = {
  analyzeChainPhoto,
  analyzeChainPhotoNotesOnly,
  analyzeChainPhotoVision,
  FEWSHOT,
};
