'use client';

import { useCallback, useState } from 'react';

type ScanResult = {
  success?: boolean;
  vectorId?: string;
  svgUrl?: string;
  error?: string;
};

export function VectorPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [invert, setInvert] = useState(false);
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<ScanResult | null>(null);

  const run = useCallback(async () => {
    if (!file) return;
    setBusy(true);
    setOut(null);
    const fd = new FormData();
    fd.append('image', file);
    if (invert) fd.append('invert', '1');
    try {
      const res = await fetch('/api/workshop/vector-scan', { method: 'POST', body: fd });
      const j = (await res.json()) as ScanResult;
      setOut(j);
    } catch (e) {
      setOut({ success: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }, [file, invert]);

  const workshopPublic = process.env.NEXT_PUBLIC_WORKSHOP_API || '';

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[var(--line)] bg-surface-1 p-4">
      <h2 className="text-lg font-semibold text-[var(--gold)]">Elite vector trace</h2>
      <p className="text-sm text-[var(--muted)]">
        Proxies to your Matrix Workshop <code className="font-mono text-xs">/api/jewelry/vector-scan</code> — sharp
        preprocess → potrace → SVG for extrusion. Same pipeline as the main app.
      </p>
      {!workshopPublic && (
        <p className="rounded border border-amber-900/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-200">
          Set <code className="font-mono">WORKSHOP_API_BASE_URL</code> on Vercel (and{' '}
          <code className="font-mono">NEXT_PUBLIC_WORKSHOP_API</code> for display links).
        </p>
      )}
      <label className="flex cursor-pointer flex-col gap-2 rounded-lg border border-dashed border-zinc-600 p-4 hover:border-zinc-500">
        <span className="text-sm text-zinc-400">PNG / JPEG / WebP</span>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="text-sm"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
      </label>
      <label className="flex items-center gap-2 text-sm text-zinc-400">
        <input type="checkbox" checked={invert} onChange={(e) => setInvert(e.target.checked)} />
        Invert luminance (silhouette tweaks)
      </label>
      <button
        type="button"
        disabled={!file || busy}
        onClick={run}
        className="rounded-lg bg-zinc-200 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-white disabled:opacity-50"
      >
        {busy ? 'Tracing…' : 'Trace to SVG'}
      </button>
      {out && (
        <pre className="max-h-48 overflow-auto rounded-lg bg-surface-0 p-3 font-mono text-xs text-emerald-200/90">
          {JSON.stringify(out, null, 2)}
        </pre>
      )}
      {out?.success && out.svgUrl && (
        <a
          href={out.svgUrl.startsWith('http') ? out.svgUrl : `${workshopPublic}${out.svgUrl}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-[var(--gold)] underline"
        >
          Open SVG
        </a>
      )}
    </div>
  );
}
