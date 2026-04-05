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

const { fetchChatCompletionsWithFallback } = require('./openai-compatible');
const { copilotModelForProvider } = require('./model-defaults');

async function runWorkshopCopilot({ message, context, env }) {
  const ctx = context && typeof context === 'object' ? JSON.stringify(context).slice(0, 6000) : '';

  const payloadBase = {
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
    payloadBase.response_format = { type: 'json_object' };
  }

  const { content, providerUsed } = await fetchChatCompletionsWithFallback(env, (p) => ({
    ...payloadBase,
    model: copilotModelForProvider(env, p),
  }));

  let out;
  try {
    out = JSON.parse(content);
  } catch {
    throw new Error('Copilot did not return valid JSON');
  }
  return { result: out, modelUsed: `${copilotModelForProvider(env, providerUsed)} (${providerUsed})` };
}

module.exports = { runWorkshopCopilot, OUTPUT_SCHEMA };
