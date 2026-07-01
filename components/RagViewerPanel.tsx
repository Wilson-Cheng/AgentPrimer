'use client';

/**
 * components/RagViewerPanel.tsx
 * ---------------------------------------------------------------------------
 * Right-side resizable panel that renders an indexed RAG document.
 *
 * Mirrors the chat window's PreviewPanel:
 *   • text / markdown — fetched as JSON, rendered inline
 *   • PDF             — embedded via /api/rag/sources/<id>/content?raw=1
 *                       (the panel only reads ?meta=1 for the mime; the
 *                       iframe streams the bytes itself)
 *   • html            — fetched as JSON, rendered inside a hard-sandboxed
 *                       iframe (sandbox="" — no scripts, no same-origin) via
 *                       a data: URL, NOT served from the app origin.
 *
 * Width is user-adjustable via a drag handle on the left edge and persisted
 * to localStorage (separate key from the chat preview so the two panels can
 * keep independent widths).
 *
 * Drag-to-resize is rAF-throttled and the panel body is rendered inline
 * (NOT as a nested function component) so the iframe / MarkdownContent
 * subtree does not unmount on every render frame.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, ExternalLink, PanelRight, ArrowLeft, FileText } from 'lucide-react';
import MarkdownContent from './MarkdownContent';

const STORAGE_KEY = 'agentprimer_ragviewer_widthpct';
const MIN_PCT = 20;
const MAX_PCT = 82;
const DEFAULT_PCT = 38;

interface Props {
  sourceId: number;
  /** Display name shown in the header. */
  title: string;
  onClose: () => void;
}

interface MetaResponse {
  id: number;
  name: string;
  mime: string;
}

interface ContentResponse extends MetaResponse {
  content: string;
}

export default function RagViewerPanel({ sourceId, title, onClose }: Props) {
  const [widthPct, setWidthPct] = useState(DEFAULT_PCT);
  const [isMobile, setIsMobile] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [meta, setMeta] = useState<MetaResponse | null>(null);
  const [textContent, setTextContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const widthPctRef = useRef(DEFAULT_PCT);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startPct = useRef(DEFAULT_PCT);
  /** rAF handle for the drag throttle so we don't setState 60+ times/sec
   *  during mousemove (which would re-render the panel and remount the
   *  iframe / MarkdownContent subtree). */
  const dragRaf = useRef<number | null>(null);
  const pendingPct = useRef(DEFAULT_PCT);

  // Mobile breakpoint
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check, { passive: true });
    return () => window.removeEventListener('resize', check);
  }, []);

  // Restore persisted width
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const n = parseFloat(stored);
      if (!isNaN(n) && n >= MIN_PCT && n <= MAX_PCT) {
        widthPctRef.current = n;
        setWidthPct(n);
      }
    }
  }, []);

  // Load metadata first. For PDFs we stop there — the iframe streams the
  // bytes via ?raw=1. For text-ish mimes we fetch the JSON content too.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setMeta(null);
    setTextContent('');

    (async () => {
      try {
        const metaRes = await fetch(`/api/rag/sources/${sourceId}/content?meta=1`);
        if (!metaRes.ok) {
          const err = (await metaRes.json().catch(() => ({}))) as { error?: string };
          throw new Error(err.error ?? `HTTP ${metaRes.status}`);
        }
        const m = (await metaRes.json()) as MetaResponse;
        if (cancelled) return;
        setMeta(m);

        if (m.mime !== 'application/pdf') {
          const cRes = await fetch(`/api/rag/sources/${sourceId}/content`);
          if (!cRes.ok) {
            const err = (await cRes.json().catch(() => ({}))) as { error?: string };
            throw new Error(err.error ?? `HTTP ${cRes.status}`);
          }
          const c = (await cRes.json()) as ContentResponse;
          if (cancelled) return;
          setTextContent(c.content);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sourceId]);

  // Drag-to-resize — rAF-throttled
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    setDragActive(true);
    startX.current = e.clientX;
    startPct.current = widthPctRef.current;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const flush = () => {
      dragRaf.current = null;
      widthPctRef.current = pendingPct.current;
      setWidthPct(pendingPct.current);
    };
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      if (e.buttons === 0) {
        isDragging.current = false;
        setDragActive(false);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        localStorage.setItem(STORAGE_KEY, String(widthPctRef.current));
        return;
      }
      const vw = window.innerWidth;
      if (vw === 0) return;
      const deltaPct = ((startX.current - e.clientX) / vw) * 100;
      const next = Math.max(MIN_PCT, Math.min(MAX_PCT, startPct.current + deltaPct));
      pendingPct.current = next;
      if (dragRaf.current === null) {
        dragRaf.current = requestAnimationFrame(flush);
      }
    };
    const onUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      setDragActive(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (dragRaf.current !== null) {
        cancelAnimationFrame(dragRaf.current);
        dragRaf.current = null;
        widthPctRef.current = pendingPct.current;
        setWidthPct(pendingPct.current);
      }
      localStorage.setItem(STORAGE_KEY, String(widthPctRef.current));
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('blur', onUp);
    return () => {
      onUp();
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('blur', onUp);
    };
  }, []);

  const rawUrl = `/api/rag/sources/${sourceId}/content?raw=1`;

  // Memoize the HTML data: URL so the iframe is stable across renders.
  // (Hard-sandboxed: no scripts, no same-origin — safe for untrusted HTML.)
  const htmlDataUrl = useMemo(() => {
    if (!meta || meta.mime !== 'text/html') return '';
    return `data:text/html;charset=utf-8,${encodeURIComponent(textContent)}`;
  }, [meta, textContent]);

  return (
    <>
      {dragActive && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, cursor: 'col-resize' }} />
      )}
      <div
        className="flex-shrink-0 flex h-full bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 relative"
        style={{ width: isMobile ? '100%' : `${widthPct}%` }}
      >
        {!isMobile && (
          <div
            onMouseDown={onMouseDown}
            className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-teal-400 dark:hover:bg-teal-600 transition-colors z-10 group"
            title="Drag to resize"
          >
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-10 rounded-full bg-gray-300 dark:bg-gray-600 group-hover:bg-teal-400 dark:group-hover:bg-teal-500 transition-colors" />
          </div>
        )}

        <div className="flex flex-col w-full overflow-hidden pl-0 md:pl-1">
          {/* Header */}
          <div className="flex items-center gap-2 pl-4 pr-3 py-4 md:px-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex-shrink-0">
            <button
              onClick={onClose}
              title="Back to list"
              className="md:hidden h-8 flex items-center gap-1 px-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors flex-shrink-0 text-sm font-medium"
            >
              <ArrowLeft size={20} />
              <span>Back</span>
            </button>
            <PanelRight size={20} className="hidden md:block text-gray-400 flex-shrink-0" />
            <span
              className="flex-1 text-md font-600 text-gray-800 dark:text-gray-200 truncate min-w-0"
              title={title}
            >
              <FileText size={14} className="inline-block mr-1.5 text-teal-500 align-[-2px]" />
              {title}
            </span>
            <div className="flex items-center gap-3 flex-shrink-0">
              {/* "Open in new tab" — only meaningful for PDFs (the raw
                  endpoint forces text/plain + nosniff for everything else,
                  so opening text in a new tab would just download it). */}
              {meta?.mime === 'application/pdf' && (
                <a
                  href={rawUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open in new tab"
                  className="h-7 w-7 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
                >
                  <ExternalLink size={20} />
                </a>
              )}
              <button
                onClick={onClose}
                title="Close"
                className="hidden md:flex h-7 w-7 items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Body — rendered inline so React doesn't remount the iframe /
              markdown subtree on each parent render. */}
          <div className="flex-1 overflow-hidden">
            {loading && <div className="p-4 text-sm text-gray-400">Loading…</div>}
            {error && <div className="p-4 text-sm text-red-500">Failed to load: {error}</div>}
            {!loading && !error && meta && meta.mime === 'application/pdf' && (
              <iframe src={rawUrl} title="PDF" className="w-full h-full border-0" />
            )}
            {!loading && !error && meta && meta.mime === 'text/html' && (
              <iframe
                src={htmlDataUrl}
                title="HTML"
                sandbox=""
                className="w-full h-full border-0 bg-white"
              />
            )}
            {!loading && !error && meta && meta.mime === 'text/markdown' && (
              <div className="w-full h-full overflow-auto p-4 max-w-none">
                <MarkdownContent>{textContent}</MarkdownContent>
              </div>
            )}
            {!loading &&
              !error &&
              meta &&
              meta.mime !== 'application/pdf' &&
              meta.mime !== 'text/html' &&
              meta.mime !== 'text/markdown' && (
                <pre className="w-full h-full overflow-auto p-4 text-sm font-mono text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-900 whitespace-pre-wrap break-all">
                  {textContent}
                </pre>
              )}
          </div>
        </div>
      </div>
    </>
  );
}
