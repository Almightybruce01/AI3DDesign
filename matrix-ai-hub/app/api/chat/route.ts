import { NextResponse } from 'next/server';
import { ELITE_SYSTEM_PROMPT } from '@/lib/elite-system-prompt';
import { defaultChatModel, llmConfigured, openaiApiBase, resolveLlmApiKey } from '@/lib/llm-resolve';

/**
 * Streams OpenAI-compatible chat/completions. Works with OpenAI or Groq (free tier) — no Cursor required.
 */
export async function POST(req: Request) {
  const apiKey = resolveLlmApiKey();
  const base = openaiApiBase();
  const model = defaultChatModel();

  if (!llmConfigured()) {
    return NextResponse.json(
      {
        error:
          'Set OPENAI_API_KEY or GROQ_API_KEY (free: console.groq.com), or OPENAI_ALLOW_NO_KEY=1 for keyless hosts.',
      },
      { status: 503 },
    );
  }

  let body: { messages?: { role: string; content: string }[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const incoming = (body.messages || []).filter((m) => m.role !== 'system');
  const append = process.env.LLM_SYSTEM_APPEND?.trim();
  const systemContent = [ELITE_SYSTEM_PROMPT, append].filter(Boolean).join('\n\n');
  const messages = [{ role: 'system', content: systemContent }, ...incoming];

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const upstream = await fetch(`${base.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers,
    signal: req.signal,
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      temperature: 0.42,
      max_tokens: 8192,
    }),
  });

  if (!upstream.ok) {
    const t = await upstream.text();
    return NextResponse.json(
      { error: `Upstream ${upstream.status}`, detail: t.slice(0, 800) },
      { status: 502 },
    );
  }

  return new Response(upstream.body, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
