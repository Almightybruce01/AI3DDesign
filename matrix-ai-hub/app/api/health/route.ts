import { NextResponse } from 'next/server';
import {
  defaultChatModel,
  defaultVisionModel,
  llmConfigured,
  openaiApiBase,
  resolveLlmApiKey,
} from '@/lib/llm-resolve';

export async function GET() {
  const workshop = process.env.WORKSHOP_API_BASE_URL || process.env.NEXT_PUBLIC_WORKSHOP_API || '';
  const key = resolveLlmApiKey();
  const groqOnly = Boolean(process.env.GROQ_API_KEY?.trim()) && !process.env.OPENAI_API_KEY?.trim();
  return NextResponse.json({
    ok: true,
    service: 'matrix-ai-hub',
    llmConfigured: llmConfigured(),
    llmProvider: groqOnly ? 'groq' : key ? 'openai_or_custom' : process.env.OPENAI_ALLOW_NO_KEY ? 'keyless' : 'none',
    llmBase: openaiApiBase(),
    llmModel: defaultChatModel(),
    visionModel: defaultVisionModel(),
    openAiKey: Boolean(process.env.OPENAI_API_KEY?.trim()),
    fineTuned: Boolean((process.env.LLM_MODEL || '').trim().startsWith('ft:')),
    workshopConfigured: Boolean(workshop),
    workshopPreview: workshop ? `${workshop.slice(0, 24)}…` : null,
  });
}
