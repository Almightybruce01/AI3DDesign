'use strict';

const fs = require('fs').promises;
const path = require('path');
const {
  fetchChatCompletionsWithFallback,
  imagesGenerationsUrl,
  llmConfigured,
} = require('./openai-compatible');
const { enhancePromptModelForProvider } = require('./model-defaults');

const STONE_TREATMENT_SUFFIX = {
  full:
    'Show finished jewelry with gemstones: pavé, faceted rounds, baguettes as appropriate, crisp sparkle and dispersion.',
  metal_only:
    'Polished precious metal only — absolutely no diamonds, no gemstones, no pavé, no stones; plain metal surfaces, subtle brushed or mirror highlights, manufacturing preview.',
};

const STYLE_SUFFIX = {
  studio:
    'Ultra-detailed jewelry product photography, softbox lighting, 85mm macro lens, neutral grey seamless, 8k, realistic specular highlights on metal and facets.',
  editorial:
    'High-fashion editorial jewelry photograph, natural window light mixed with bounce, shallow depth of field, subtle film grain, magazine composition.',
  cad_technical:
    'Technical jewelry CAD visualization: dimensionally plausible proportions, brushed noble metal, neutral studio HDR, subtle ambient occlusion, manufacturing-accurate edges.',
  luxury_dark:
    'Luxury jewelry hero shot on deep charcoal velvet, dramatic rim light, cinematic contrast, crisp micro-contrast on pavé and prongs, premium campaign art direction.',
  cuban_studio:
    'Miami Cuban link chain catalog photography: interlocking bar links with flat face width, uniform pitch, box clasp with figure-8 safety, studio softbox, 85–105mm macro, neutral seamless, physically plausible gold reflections, crisp edge highlights, no plastic or resin look.',
  cuban_macro:
    'Extreme macro product shot of Miami Cuban links and clasp tongue engagement, shallow depth of field, controlled speculars on beveled edges, manufacturing-accurate proportions, dark luxury set or seamless grey.',
};

function hashPrompt(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildProceduralSvg(prompt, w, h) {
  const hsh = hashPrompt(prompt);
  const hue = hsh % 360;
  const safe = escapeXml(prompt.slice(0, 280));
  const fsz = Math.max(18, Math.round(w / 38));
  const fszSub = Math.max(13, Math.round(w / 52));
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <filter id="n" x="-20%" y="-20%" width="140%" height="140%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="${hsh % 97}" result="t"/>
      <feColorMatrix in="t" type="matrix" values="0 0 0 0 0.95  0 0 0 0 0.95  0 0 0 0 0.98  0 0 0 0.035 0" result="g"/>
      <feBlend in="SourceGraphic" in2="g" mode="overlay"/>
    </filter>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" style="stop-color:hsl(${hue},22%,10%)"/>
      <stop offset="0.45" style="stop-color:hsl(${(hue + 35) % 360},18%,16%)"/>
      <stop offset="1" style="stop-color:hsl(${(hue + 85) % 360},14%,7%)"/>
    </linearGradient>
    <radialGradient id="rim" cx="50%" cy="38%" r="58%">
      <stop offset="0" style="stop-color:#f8f4ea;stop-opacity:0.22"/>
      <stop offset="0.55" style="stop-color:#c8b8a0;stop-opacity:0.08"/>
      <stop offset="1" style="stop-color:#000000;stop-opacity:0"/>
    </radialGradient>
    <linearGradient id="metal" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" style="stop-color:#f2f6fa"/>
      <stop offset="0.35" style="stop-color:#c5d0da"/>
      <stop offset="0.7" style="stop-color:#8a98a8"/>
      <stop offset="1" style="stop-color:#5c6875"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <rect width="100%" height="100%" fill="url(#rim)"/>
  <g filter="url(#n)">
    <rect x="${w * 0.14}" y="${h * 0.22}" width="${w * 0.72}" height="${h * 0.48}" rx="${Math.min(w, h) * 0.022}" fill="url(#metal)" stroke="#e8eef4" stroke-width="${Math.max(1, w / 900)}" opacity="0.92"/>
    <rect x="${w * 0.14}" y="${h * 0.22}" width="${w * 0.72}" height="${h * 0.48}" rx="${Math.min(w, h) * 0.022}" fill="none" stroke="#ffffff" stroke-width="${Math.max(0.5, w / 1200)}" opacity="0.35"/>
  </g>
  <text x="50%" y="${h * 0.38}" text-anchor="middle" fill="#fdfcfa" font-family="'Cormorant Garamond','Georgia',serif" font-size="${fsz}" font-weight="600" text-rendering="geometricPrecision" style="paint-order:stroke fill" stroke="#1a1510" stroke-width="${Math.max(0.35, w / 2000)}">Matrix · AI3DDesign</text>
  <text x="50%" y="${h * 0.48}" text-anchor="middle" fill="#e8e4dc" font-family="'IBM Plex Sans',system-ui,sans-serif" font-size="${fszSub}" font-weight="500" text-rendering="geometricPrecision" style="paint-order:stroke fill" stroke="#141210" stroke-width="${Math.max(0.25, w / 2500)}">${safe}</text>
  <text x="50%" y="${h * 0.9}" text-anchor="middle" fill="#9a9488" font-family="'IBM Plex Sans',sans-serif" font-size="${Math.max(10, w / 80)}" letter-spacing="0.12em">LOCAL FALLBACK · ADD OPENAI / REPLICATE KEYS FOR PHOTOREAL</text>
</svg>`;
}

async function enhanceJewelryPrompt(userPrompt, env) {
  const payloadBase = {
    messages: [
      {
        role: 'system',
        content:
          'You are a senior jewelry CAD and photography art director. Expand the user\'s short idea into ONE detailed English prompt for an image model: specify metal (e.g. platinum, 18k yellow), stone cuts, setting style (pavé, channel), lighting, camera angle, background, and level of photorealism. Output only the final prompt text, max 180 words. No quotes or bullet points.',
      },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: 500,
    temperature: 0.7,
  };
  const { content } = await fetchChatCompletionsWithFallback(env, (p) => ({
    ...payloadBase,
    model: enhancePromptModelForProvider(env, p),
  }));
  return content?.trim() || userPrompt;
}

function openAiImageSize(w, h) {
  const ar = w / Math.max(h, 1);
  if (ar > 1.25) return '1792x1024';
  if (ar < 0.8) return '1024x1792';
  return '1024x1024';
}

async function generateOpenAiImage(prompt, env, w, h) {
  const apiKey = (env.OPENAI_API_KEY || '').trim();
  if (!apiKey) throw new Error('DALL·E image generation needs OPENAI_API_KEY (official OpenAI or compatible host with images API).');
  const size = openAiImageSize(w, h);
  const r = await fetch(imagesGenerationsUrl(env), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt: prompt.slice(0, 3900),
      n: 1,
      size,
      quality: 'hd',
      style: 'natural',
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`OpenAI images: ${r.status} ${t.slice(0, 300)}`);
  }
  const j = await r.json();
  const url = j.data?.[0]?.url;
  if (!url) throw new Error('OpenAI: missing image URL');
  const img = await fetch(url);
  if (!img.ok) throw new Error('OpenAI: download failed');
  return Buffer.from(await img.arrayBuffer());
}

function fluxAspectRatio(w, h) {
  const ar = w / Math.max(h, 1);
  if (ar > 1.5) return '16:9';
  if (ar < 0.67) return '9:16';
  if (ar > 1.2) return '4:3';
  if (ar < 0.85) return '3:4';
  return '1:1';
}

async function pollReplicate(getUrl, token, maxMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const r = await fetch(getUrl, { headers: { Authorization: `Token ${token}` } });
    if (!r.ok) throw new Error(`Replicate poll ${r.status}`);
    const j = await r.json();
    if (j.status === 'succeeded') return j.output;
    if (j.status === 'failed') throw new Error(j.error?.detail || j.error || 'Replicate failed');
    await new Promise((res) => setTimeout(res, 900));
  }
  throw new Error('Replicate: timeout');
}

async function generateReplicateFlux(prompt, token, w, h) {
  const create = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions', {
    method: 'POST',
    headers: {
      Authorization: `Token ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: {
        prompt: prompt.slice(0, 2000),
        aspect_ratio: fluxAspectRatio(w, h),
        output_format: 'png',
      },
    }),
  });
  if (!create.ok) {
    const t = await create.text();
    throw new Error(`Replicate create: ${create.status} ${t.slice(0, 300)}`);
  }
  const pred = await create.json();
  const getUrl = pred.urls?.get;
  if (!getUrl) throw new Error('Replicate: no poll URL');
  const output = await pollReplicate(getUrl, token, 180000);
  const url = Array.isArray(output) ? output[0] : output;
  if (!url || typeof url !== 'string') throw new Error('Replicate: bad output');
  const img = await fetch(url);
  if (!img.ok) throw new Error('Replicate: download failed');
  return Buffer.from(await img.arrayBuffer());
}

async function proceduralPngBuffer(sharp, prompt, w, h) {
  const svg = buildProceduralSvg(prompt, w, h);
  return sharp(Buffer.from(svg), { density: 144 }).png({ compressionLevel: 9, effort: 10 }).toBuffer();
}

/**
 * @param {object} opts
 * @param {string} opts.root - project root
 * @param {import('sharp')} opts.sharp
 * @param {string} opts.userPrompt
 * @param {number} opts.width
 * @param {number} opts.height
 * @param {string} opts.provider - auto|openai|replicate|local
 * @param {string} opts.styleKey - studio|editorial|cad_technical|luxury_dark
 * @param {boolean} opts.enhancePrompt
 * @param {object} opts.memory - optional merged prefs (prefix, etc.)
 * @param {object} opts.env - process.env slice
 * @param {'full'|'metal_only'} [opts.stoneTreatment] - diamonds/stones vs metal-only catalog shot
 */
async function generateJewelryPreviewImage(opts) {
  const {
    root,
    sharp,
    userPrompt,
    width,
    height,
    provider = 'auto',
    styleKey = 'studio',
    enhancePrompt = false,
    memory = {},
    env = process.env,
    cubanPromptAppend = '',
    stoneTreatment = 'full',
  } = opts;

  const w = Math.min(2560, Math.max(400, width));
  const h = Math.min(2560, Math.max(300, height));

  let base = String(userPrompt || 'luxury jewelry piece').slice(0, 500);
  if (cubanPromptAppend && String(cubanPromptAppend).trim()) {
    base = `${String(cubanPromptAppend).trim()}\n${base}`;
  }
  if (memory.promptPrefix) {
    base = `${String(memory.promptPrefix).trim()}\n${base}`;
  }
  const style = STYLE_SUFFIX[styleKey] || STYLE_SUFFIX.studio;
  const stone =
    STONE_TREATMENT_SUFFIX[stoneTreatment] ||
    STONE_TREATMENT_SUFFIX.full;
  let finalPrompt = `${base}\n\n${style}\n\n${stone}`;

  let enhancedFromModel = null;
  const apiKey = (env.OPENAI_API_KEY || '').trim();
  if (enhancePrompt && llmConfigured(env)) {
    try {
      enhancedFromModel = await enhanceJewelryPrompt(finalPrompt, env);
      finalPrompt = enhancedFromModel;
    } catch (e) {
      console.warn('Prompt enhance failed, using un-enhanced:', e.message);
    }
  }

  let buf = null;
  let providerUsed = 'local';

  if (provider === 'local') {
    buf = await proceduralPngBuffer(sharp, base, w, h);
    providerUsed = 'local';
  }

  const wantOpenai = !buf && (provider === 'auto' || provider === 'openai');
  const wantRep = !buf && (provider === 'auto' || provider === 'replicate');

  if (wantOpenai && apiKey && provider !== 'replicate') {
    try {
      buf = await generateOpenAiImage(finalPrompt, env, w, h);
      providerUsed = 'openai';
    } catch (e) {
      console.warn('OpenAI image failed:', e.message);
      if (provider === 'openai') throw e;
    }
  }

  if (!buf && wantRep && env.REPLICATE_API_TOKEN && provider !== 'openai') {
    try {
      buf = await generateReplicateFlux(finalPrompt, env.REPLICATE_API_TOKEN, w, h);
      providerUsed = 'replicate';
    } catch (e) {
      console.warn('Replicate failed:', e.message);
      if (provider === 'replicate') throw e;
    }
  }

  if (!buf) {
    buf = await proceduralPngBuffer(sharp, base, w, h);
    providerUsed = 'local';
  }

  buf = await sharp(buf)
    .resize(w, h, { fit: 'cover', position: 'attention' })
    .png({ compressionLevel: 9, effort: 10 })
    .toBuffer();

  const name = `preview_${Date.now()}.png`;
  const rel = path.posix.join('generated', name);
  await fs.writeFile(path.join(root, 'generated', name), buf);

  return {
    imagePath: rel,
    width: w,
    height: h,
    providerUsed,
    finalPrompt: finalPrompt.slice(0, 500),
    enhancedPrompt: enhancedFromModel,
  };
}

module.exports = {
  generateJewelryPreviewImage,
  buildProceduralSvg,
  STYLE_SUFFIX,
  pollReplicate,
};
