'use client';

import { useEffect, useRef, useState } from 'react';

let mermaidPromise: Promise<typeof import('mermaid')> | null = null;

function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((m) => {
      m.default.initialize({
        startOnLoad: false,
        theme: 'neutral',
        securityLevel: 'strict',
        fontFamily: 'inherit',
      });
      return m;
    });
  }
  return mermaidPromise;
}

let counter = 0;

interface MermaidBlockProps {
  code: string;
}

export default function MermaidBlock({ code }: MermaidBlockProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const idRef = useRef(`mermaid-${++counter}`);

  useEffect(() => {
    let cancelled = false;
    setError(null);

    loadMermaid().then(async (m) => {
      if (cancelled || !containerRef.current) return;
      try {
        const { svg } = await m.default.render(idRef.current, code);
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [code]);

  if (error) {
    return (
      <div className="my-2 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-300 font-mono">
        Mermaid error: {error}
      </div>
    );
  }

  return (
    <div className="mermaid-wrapper">
      <div ref={containerRef} />
    </div>
  );
}
