'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChatMarkdown } from './ChatMarkdown';

type Msg = { role: 'user' | 'assistant'; text: string };

type Health = {
  llmModel?: string;
  visionModel?: string;
  fineTuned?: boolean;
  llmConfigured?: boolean;
};

function parseSseAccumulate(buffer: string, onDelta: (s: string) => void): string {
  let rest = buffer;
  const lines = rest.split('\n');
  rest = lines.pop() || '';
  for (const line of lines) {
    const s = line.replace(/^data:\s*/, '').trim();
    if (!s || s === '[DONE]') continue;
    try {
      const json = JSON.parse(s);
      const delta = json.choices?.[0]?.delta?.content;
      if (typeof delta === 'string' && delta) onDelta(delta);
    } catch {
      /* partial line */
    }
  }
  return rest;
}

export function ChatPanel() {
  const [input, setInput] = useState('');
  const [log, setLog] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((j) => setHealth(j))
      .catch(() => setHealth(null));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [log, busy]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
  }, []);

  const clearChat = useCallback(() => {
    if (busy) stop();
    setLog([]);
  }, [busy, stop]);

  const copyMessage = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  }, []);

  const send = useCallback(async () => {
    const q = input.trim();
    if (!q || busy) return;
    setInput('');
    setBusy(true);
    const ac = new AbortController();
    abortRef.current = ac;

    setLog((prev) => [...prev, { role: 'user', text: q }, { role: 'assistant', text: '' }]);

    const messages = [
      ...log.map((m) => ({ role: m.role, content: m.text })),
      { role: 'user', content: q },
    ];

    const appendDelta = (delta: string) => {
      setLog((prev) => {
        const copy = [...prev];
        const last = copy.length - 1;
        if (copy[last]?.role === 'assistant') {
          copy[last] = { ...copy[last], text: copy[last].text + delta };
        }
        return copy;
      });
    };

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }),
        signal: ac.signal,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error || res.statusText);
      }
      const reader = res.body?.getReader();
      const dec = new TextDecoder();
      if (!reader) throw new Error('No response stream');
      let acc = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        const parts = acc.split('\n\n');
        acc = parts.pop() || '';
        for (const block of parts) {
          for (const line of block.split('\n')) {
            const s = line.replace(/^data:\s*/, '').trim();
            if (!s || s === '[DONE]') continue;
            try {
              const json = JSON.parse(s);
              const delta = json.choices?.[0]?.delta?.content;
              if (typeof delta === 'string' && delta) appendDelta(delta);
            } catch {
              /* ignore */
            }
          }
        }
      }
      if (acc.trim()) {
        acc = parseSseAccumulate(acc + '\n\n', appendDelta);
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') {
        setLog((prev) => {
          const copy = [...prev];
          const last = copy.length - 1;
          if (copy[last]?.role === 'assistant' && !copy[last].text.trim()) {
            copy[last] = { role: 'assistant', text: '_(Generation stopped.)_' };
          }
          return copy;
        });
      } else {
        const msg = e instanceof Error ? e.message : String(e);
        setLog((prev) => {
          const copy = [...prev];
          const last = copy.length - 1;
          if (copy[last]?.role === 'assistant') {
            copy[last] = { role: 'assistant', text: `**Error:** ${msg}` };
          }
          return copy;
        });
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }, [busy, input, log]);

  const modelLabel = health?.llmModel || '…';
  const visionNote = health?.visionModel
    ? `Workshop vision (Complex / chain photo): \`${health.visionModel}\``
    : 'Set `OPENAI_VISION_MODEL` on the Node workshop for photo analysis.';

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[var(--line)] bg-surface-1 p-4 shadow-lg shadow-black/20">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-[var(--gold)]">Matrix Copilot</h2>
          <p className="mt-1 text-xs text-zinc-500">
            ChatGPT-style streaming · fine-tuned when <code className="rounded bg-zinc-800 px-1">LLM_MODEL=ft:…</code>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={clearChat}
            disabled={log.length === 0 && !busy}
            className="rounded-lg border border-zinc-600 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
          >
            New chat
          </button>
          {busy && (
            <button
              type="button"
              onClick={stop}
              className="rounded-lg border border-amber-700/50 bg-amber-950/40 px-3 py-1.5 text-xs text-amber-100 hover:bg-amber-950/60"
            >
              Stop
            </button>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-zinc-800/80 bg-surface-0/80 px-3 py-2 font-mono text-[11px] leading-relaxed text-zinc-500">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span>
            <span className="text-zinc-600">Hub model</span>{' '}
            <span className="text-emerald-300/90">{modelLabel}</span>
            {health?.fineTuned ? (
              <span className="ml-1 rounded bg-emerald-950/60 px-1 text-emerald-400">fine-tuned</span>
            ) : null}
          </span>
        </div>
        <p className="mt-1 text-zinc-600">{visionNote}</p>
      </div>

      <div className="max-h-[min(52vh,560px)] space-y-4 overflow-y-auto rounded-lg bg-surface-0 p-3">
        {log.length === 0 && (
          <div className="rounded-lg border border-dashed border-zinc-700/60 bg-zinc-900/30 p-4 text-sm text-zinc-400">
            <p className="font-medium text-zinc-300">Ask anything about Matrix Workshop</p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-zinc-500">
              <li>Build flags: <code>printTight</code>, <code>referenceIced</code>, <code>vectorId</code></li>
              <li>Exports: STL for print, OBJ for Blender — mm scale</li>
              <li>Complex Studio JSON, Cuban presets, vector trace</li>
            </ul>
          </div>
        )}
        {log.map((m, i) => (
          <div
            key={i}
            className={
              m.role === 'user'
                ? 'ml-4 rounded-2xl rounded-br-md border border-zinc-700/50 bg-zinc-800/50 px-4 py-2.5 text-right'
                : 'mr-2 rounded-2xl rounded-bl-md border border-zinc-800/60 bg-zinc-900/40 px-4 py-2.5'
            }
          >
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                {m.role === 'user' ? 'You' : 'Assistant'}
              </span>
              {m.role === 'assistant' && m.text && (
                <button
                  type="button"
                  onClick={() => copyMessage(m.text)}
                  className="text-[10px] text-zinc-500 hover:text-zinc-300"
                >
                  Copy
                </button>
              )}
            </div>
            {m.role === 'user' ? (
              <p className="whitespace-pre-wrap text-sm text-zinc-100">{m.text}</p>
            ) : busy && i === log.length - 1 && !m.text ? (
              <p className="text-sm text-zinc-500">Thinking…</p>
            ) : (
              <ChatMarkdown>{m.text || '…'}</ChatMarkdown>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2">
        <textarea
          className="min-h-[88px] flex-1 resize-y rounded-lg border border-zinc-700 bg-surface-0 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-[var(--gold)]/50 focus:outline-none focus:ring-1 focus:ring-[var(--gold)]/30"
          placeholder="Ask for dimensions, API fields, or a step-by-step for your next build… (Enter to send, Shift+Enter for newline)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          disabled={busy}
        />
        <div className="flex flex-col gap-2 self-end">
          <button
            type="button"
            disabled={busy}
            onClick={send}
            className="rounded-lg bg-[var(--gold)] px-4 py-2 text-sm font-medium text-black hover:opacity-90 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
