import { ChatPanel } from '@/components/ChatPanel';
import { VectorPanel } from '@/components/VectorPanel';

export default function Home() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <header className="mb-10 border-b border-[var(--line)] pb-8">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">Standalone deploy</p>
        <h1 className="mt-2 font-serif text-3xl text-[var(--gold)] md:text-4xl">Matrix AI Hub</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400">
          Standalone dashboard: <strong className="text-zinc-300">ChatGPT-style</strong> copilot (streaming, markdown, stop)
          plus your <code className="font-mono text-xs text-zinc-300">LLM_MODEL</code> fine-tune. Deploy on Vercel; point env at
          this hub and at your Node workshop for potrace / CSG / STL. Vision for Complex + chain photo runs on the workshop
          with <code className="font-mono text-xs">OPENAI_VISION_MODEL</code>.
        </p>
        <ul className="mt-4 list-inside list-disc text-sm text-zinc-500">
          <li>Training large models does not run on Vercel — see <code className="font-mono text-xs">docs/TRAINING_PIPELINE.md</code></li>
          <li>Vector + mesh quality stays on your workshop server (sharp, potrace, three-bvh-csg)</li>
        </ul>
        <div className="mt-6 rounded-lg border border-emerald-900/40 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-100/90">
          <strong className="text-emerald-200">Dashboard (local):</strong>{' '}
          <a href="http://localhost:3010" className="font-mono text-emerald-300 underline">
            http://localhost:3010
          </a>
          <span className="block pt-2 text-emerald-200/80">
            Production URL is on <strong>Vercel → Project → Domains</strong> after you deploy (e.g.{' '}
            <code className="font-mono text-xs">https://&lt;name&gt;.vercel.app</code>). See{' '}
            <code className="font-mono text-xs">DASHBOARD_LINKS.md</code>.
          </span>
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-2">
        <ChatPanel />
        <VectorPanel />
      </div>

      <footer className="mt-16 border-t border-[var(--line)] pt-8 text-center text-xs text-zinc-600">
        Matrix AI Hub · configure in Vercel · workshop is a separate service
      </footer>
    </main>
  );
}
