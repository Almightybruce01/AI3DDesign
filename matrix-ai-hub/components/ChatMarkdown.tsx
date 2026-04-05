'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Props = { children: string; className?: string };

/**
 * Renders assistant text like ChatGPT: GFM markdown, code blocks, lists.
 */
export function ChatMarkdown({ children, className = '' }: Props) {
  return (
    <div className={`chat-md text-[0.9375rem] leading-relaxed text-zinc-200 ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (p) => <h1 className="mt-3 text-base font-semibold text-zinc-50 first:mt-0" {...p} />,
          h2: (p) => <h2 className="mt-3 text-sm font-semibold text-zinc-100 first:mt-0" {...p} />,
          h3: (p) => <h3 className="mt-2 text-sm font-medium text-zinc-200" {...p} />,
          p: (p) => <p className="my-2 text-zinc-300 first:mt-0 last:mb-0" {...p} />,
          ul: (p) => <ul className="my-2 list-disc pl-5 text-zinc-300" {...p} />,
          ol: (p) => <ol className="my-2 list-decimal pl-5 text-zinc-300" {...p} />,
          li: (p) => <li className="my-0.5" {...p} />,
          strong: (p) => <strong className="font-semibold text-zinc-100" {...p} />,
          a: (p) => (
            <a className="text-amber-200/90 underline decoration-amber-200/40 hover:decoration-amber-200" {...p} />
          ),
          code: ({ className: cn, children: ch, ...rest }) => {
            const inline = !cn;
            if (inline) {
              return (
                <code
                  className="rounded bg-zinc-800/90 px-1.5 py-0.5 font-mono text-[0.85em] text-amber-100/95"
                  {...rest}
                >
                  {ch}
                </code>
              );
            }
            return (
              <code className="font-mono text-[0.8125rem] text-zinc-200" {...rest}>
                {ch}
              </code>
            );
          },
          pre: (p) => (
            <pre className="my-2 overflow-x-auto rounded-lg border border-zinc-700/50 bg-zinc-950/90 p-3 font-mono text-xs text-zinc-200" {...p} />
          ),
          blockquote: (p) => (
            <blockquote className="border-l-2 border-[var(--gold)]/50 pl-3 text-zinc-400 italic" {...p} />
          ),
          table: (p) => (
            <div className="my-2 overflow-x-auto">
              <table className="w-full border-collapse text-sm" {...p} />
            </div>
          ),
          th: (p) => <th className="border border-zinc-700 bg-zinc-900/80 px-2 py-1 text-left" {...p} />,
          td: (p) => <td className="border border-zinc-800 px-2 py-1" {...p} />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
