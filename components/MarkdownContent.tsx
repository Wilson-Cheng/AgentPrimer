'use client';

/**
 * components/MarkdownContent.tsx
 * ---------------------------------------------------------------------------
 * Shared rich-markdown renderer used by both MessageBubble and PreviewPanel.
 *
 * Features:
 *  • GFM (tables, strikethrough, task lists, autolinks)
 *  • LaTeX math via remark-math + rehype-katex  (inline $…$ and block $$…$$)
 *  • Mermaid diagrams  (```mermaid``` code fence → rendered SVG)
 *  • Diff blocks       (```diff``` code fence → +/- line colouring)
 *  • Syntax-highlighted code blocks with copy button
 *  • Styled: headings, lists, blockquotes, tables, links, hr
 */

import dynamic from 'next/dynamic';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Check } from 'lucide-react';
import { useState } from 'react';

// Mermaid is rendered entirely client-side; skip SSR to avoid window errors.
const MermaidBlock = dynamic(() => import('./MermaidBlock'), { ssr: false });

// ---------------------------------------------------------------------------
// Diff block renderer
// ---------------------------------------------------------------------------
function DiffBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const lines = code.split('\n');

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group/code my-2">
      <div className="flex items-center justify-between bg-gray-800 rounded-t-lg px-3 py-1.5">
        <span className="text-sm text-gray-400 font-mono">diff</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors px-2 py-0.5 rounded"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <div
        className="rounded-b-lg overflow-x-auto text-sm font-mono"
        style={{ background: '#1a1a2e' }}
      >
        {lines.map((line, i) => {
          const isAdd = line.startsWith('+');
          const isDel = line.startsWith('-');
          const isHdr = line.startsWith('@@') || line.startsWith('---') || line.startsWith('+++');
          return (
            <div
              key={i}
              style={{
                background: isAdd
                  ? 'rgba(0,200,80,0.15)'
                  : isDel
                    ? 'rgba(255,60,60,0.15)'
                    : isHdr
                      ? 'rgba(100,160,255,0.1)'
                      : 'transparent',
                color: isAdd ? '#86efac' : isDel ? '#fca5a5' : isHdr ? '#93c5fd' : '#d1d5db',
                padding: '0 12px',
                lineHeight: '1.6',
                whiteSpace: 'pre',
                display: 'block',
              }}
            >
              {line || '\u00a0'}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Code block with copy button (non-diff, non-mermaid)
// ---------------------------------------------------------------------------
function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group/code my-2">
      <div className="flex items-center justify-between bg-gray-800 rounded-t-lg px-3 py-1.5">
        <span className="text-sm text-gray-400 font-mono">{language}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors px-2 py-0.5 rounded"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <SyntaxHighlighter
        style={oneDark}
        language={language}
        PreTag="div"
        customStyle={{
          margin: 0,
          borderRadius: '0 0 8px 8px',
          fontSize: '0.8125rem',
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lightweight placeholder used while a code/mermaid block is still streaming.
// Avoids running Prism / Mermaid / diff colouring on every SSE token, which
// is the dominant cause of the chat UI freezing during long report generation.
// ---------------------------------------------------------------------------
function PlainCodePreview({ language, code }: { language: string; code: string }) {
  return (
    <div className="relative my-2">
      <div className="flex items-center justify-between bg-gray-800 rounded-t-lg px-3 py-1.5">
        <span className="text-sm text-gray-400 font-mono">
          {language || 'code'}
          <span className="ml-2 text-gray-500 italic">streaming…</span>
        </span>
      </div>
      <pre
        className="rounded-b-lg overflow-x-auto text-sm font-mono p-3 text-gray-200 whitespace-pre"
        style={{ background: '#1a1a2e', margin: 0 }}
      >
        {code}
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared component map (factory – `streaming` controls whether heavy code /
// mermaid renderers are used or replaced with plain previews).
// ---------------------------------------------------------------------------
function buildComponents(streaming: boolean): Components {
  return {
    code({ className, children, ...props }) {
      const match = /language-(\w+(?:-\w+)*)/.exec(className || '');
      const lang = match ? match[1] : '';
      const raw = String(children).replace(/\n$/, '');

      if (!lang) {
        // Inline code
        return (
          <code className={className} {...props}>
            {children}
          </code>
        );
      }
      // While streaming, render a cheap <pre> for every fenced block.
      // Prism / Mermaid / diff colouring all run on the main thread and would
      // re-execute on every token, freezing the page. Swap to the rich
      // renderers only once streaming completes.
      if (streaming) {
        return <PlainCodePreview language={lang} code={raw} />;
      }
      if (lang === 'mermaid') {
        return <MermaidBlock code={raw} />;
      }
      if (lang === 'diff') {
        return <DiffBlock code={raw} />;
      }
      return <CodeBlock language={lang} code={raw} />;
    },

    a({ children, href, ...props }) {
      const isExternal = href && (href.startsWith('http://') || href.startsWith('https://'));
      return (
        <a
          href={href}
          {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          {...props}
        >
          {children}
        </a>
      );
    },

    table({ children, ...props }) {
      return (
        <div className="overflow-x-auto">
          <table {...props}>{children}</table>
        </div>
      );
    },
  };
}

const COMPONENTS_STATIC = buildComponents(false);
const COMPONENTS_STREAMING = buildComponents(true);

// Hoisted to module scope so ReactMarkdown's plugin identity is stable across
// renders (avoids unnecessary plugin re-initialisation on every token).
const REMARK_PLUGINS_STATIC = [remarkGfm, remarkMath];
const REMARK_PLUGINS_STREAMING = [remarkGfm];
const REHYPE_PLUGINS_STATIC = [rehypeKatex];
const REHYPE_PLUGINS_STREAMING: never[] = [];

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------
interface MarkdownContentProps {
  /** Markdown source text */
  children: string;
  /** Optional extra class names on the wrapper div */
  className?: string;
  /** Show a blinking cursor at the end (while streaming) */
  streamingCursor?: boolean;
  /**
   * When true, render a lightweight version: plain <pre> for fenced code blocks
   * (skip Prism / Mermaid / diff colouring) and skip KaTeX. These plugins all
   * re-execute on the full message text on every SSE token and dominate the
   * main-thread cost — the dominant cause of the chat UI freezing while a long
   * report is being generated. The full rich render kicks in automatically
   * once `cheapRender` flips back to false.
   */
  cheapRender?: boolean;
}

export default function MarkdownContent({
  children,
  className = '',
  streamingCursor,
  cheapRender = false,
}: MarkdownContentProps) {
  const components = cheapRender ? COMPONENTS_STREAMING : COMPONENTS_STATIC;
  const remarkPlugins = cheapRender ? REMARK_PLUGINS_STREAMING : REMARK_PLUGINS_STATIC;
  const rehypePlugins = cheapRender ? REHYPE_PLUGINS_STREAMING : REHYPE_PLUGINS_STATIC;

  return (
    <div className={`markdown-content ${className}`}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {children}
      </ReactMarkdown>
      {streamingCursor && (
        <span className="inline-block w-2 h-4 bg-blue-500 animate-pulse rounded-sm ml-0.5" />
      )}
    </div>
  );
}
