'use strict';

/**
 * GPT-powered workshop assistant: jewelry build hints, Complex Studio wording,
 * Blender / Matrix / Rhino workflow bridges (not a replacement for desktop CAD).
 */
const OUTPUT_SCHEMA = `Return ONLY valid JSON:
{
  "summary": "one or two sentences addressing the user",
  "intent": "jewelry_build|complex_brief|cuban_chain|viewport|export|general",
  "jewelryHints": { "notes": "optional", "suggestPrintTight": true|false|null, "suggestReferenceIced": true|false|null },
  "complexBriefAddendum": "optional English paragraph to paste into Complex Design Studio",
  "cubanHints": { "faceWidthMm": number|null, "lengthIn": number|null, "notes": "optional" },
  "blenderSteps": ["short concrete Blender 4.x steps — import STL/OBJ, shade smooth, apply scale…"],
  "rhinoMatrixNotes": ["Rhino/Gold/Matrix-style workflow reminders — curves, rail sweeps, boolean as mesh export…"],
  "precautions": ["manufacturing or IP caveats"],
  "disclaimer": "Web preview is mesh-based; use Blender/Rhino/Matrix for full NURBS history and constraints."
}`;

const { chatCompletionsUrl, chatHeaders } = require('./openai-compatible');

async function runWorkshopCopilot({ message, context, env }) {
  const model =
    env.WORKSHOP_COPILOT_MODEL || env.LLM_MODEL || process.env.LLM_MODEL || 'gpt-4o-mini';
  const ctx = context && typeof context === 'object' ? JSON.stringify(context).slice(0, 6000) : '';

  const payload = {
    model,
    messages: [
      {
        role: 'system',
        content: `You are an elite jewelry manufacturing engineer and CAD tutor. The app is Matrix Workshop (Three.js preview + server mesh builds). You cannot run Blender/Rhino/Matrix inside the browser — guide users to use those tools for NURBS, history trees, and constraint solvers.\n\n${OUTPUT_SCHEMA}`,
      },
      {
        role: 'user',
        content: `Optional context (JSON): ${ctx || '{}'}\n\nUser request:\n${String(message || '').slice(0, 12000)}`,
      },
    ],
    max_tokens: 2500,
    temperature: 0.35,
  };
  if (env.DISABLE_OPENAI_JSON_MODE !== '1' && env.DISABLE_OPENAI_JSON_MODE !== 'true') {
    payload.response_format = { type: 'json_object' };
  }

  const r = await fetch(chatCompletionsUrl(env), {
    method: 'POST',
    headers: chatHeaders(env),
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`LLM: ${r.status} ${t.slice(0, 400)}`);
  }
  const j = await r.json();
  const raw = j.choices?.[0]?.message?.content;
  let out;
  try {
    out = JSON.parse(raw);
  } catch {
    throw new Error('Copilot did not return valid JSON');
  }
  return { result: out, modelUsed: model };
}

module.exports = { runWorkshopCopilot, OUTPUT_SCHEMA };
