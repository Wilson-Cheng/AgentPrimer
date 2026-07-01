'use client';

/**
 * components/PreviewPanel.tsx
 * ---------------------------------------------------------------------------
 * A resizable right-side panel that renders files produced by the agent:
 *   • HTML / web apps / games  → sandboxed <iframe>
 *   • Images                   → <img>
 *   • PDFs                     → <iframe> (browser native renderer)
 *   • Markdown                 → split editor + rendered preview with save
 *
 * Width is user-adjustable via a drag handle on the left edge and persisted
 * to localStorage.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import MarkdownContent from './MarkdownContent';
import SendToRagDialog from './SendToRagDialog';
import {
  X,
  RefreshCw,
  ExternalLink,
  Save,
  Check,
  PanelRight,
  PanelLeftClose,
  PanelRightClose,
  Columns2,
  ArrowLeft,
  BookPlus,
} from 'lucide-react';
import { ACTIVE_PREVIEW_SANDBOX } from '@/lib/preview-security';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const STORAGE_KEY = 'agentprimer_preview_widthpct'; // percentage of viewport
const MIN_PCT = 20; // 20%
const MAX_PCT = 82; // 82%
const DEFAULT_PCT = 38;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert an absolute filesystem path to the /api/workspace/… URL */
function fileUrl(absPath: string): string {
  // absPath starts with '/', e.g. /workspaces/agent-dev/output/index.html
  // Served at /api/workspace/workspaces/agent-dev/output/index.html
  return `/api/workspace${absPath}`;
}

function getExt(filePath: string): string {
  return filePath.split('.').pop()?.toLowerCase() ?? '';
}

type FileKind = 'html' | 'image' | 'video' | 'audio' | 'pdf' | 'markdown' | 'text' | 'unknown';

function detectKind(filePath: string): FileKind {
  const ext = getExt(filePath);
  if (['html', 'htm'].includes(ext)) return 'html';
  if (['md', 'markdown'].includes(ext)) return 'markdown';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext)) return 'image';
  if (['mp4', 'webm', 'm4v', 'mov', 'ogv'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'm4a', 'flac', 'ogg', 'oga', 'opus', 'aac'].includes(ext)) return 'audio';
  if (ext === 'pdf') return 'pdf';
  if (
    ['txt', 'json', 'csv', 'xml', 'yaml', 'yml', 'toml', 'js', 'ts', 'css', 'py', 'sh'].includes(
      ext,
    )
  )
    return 'text';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Sub-renderers
// ---------------------------------------------------------------------------

function HtmlPreview({ url, refreshKey }: { url: string; refreshKey: number }) {
  return (
    <iframe
      key={refreshKey}
      src={url}
      title="Preview"
      sandbox={ACTIVE_PREVIEW_SANDBOX}
      className="w-full h-full border-0"
    />
  );
}

function ImagePreview({ url, refreshKey }: { url: string; refreshKey: number }) {
  return (
    <div className="w-full h-full flex items-center justify-center overflow-auto p-4 bg-gray-50 dark:bg-gray-900">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={refreshKey}
        src={url}
        alt="Preview"
        className="max-w-full max-h-full object-contain rounded shadow-md"
      />
    </div>
  );
}

function VideoPreview({ url, refreshKey }: { url: string; refreshKey: number }) {
  // `key` forces a fresh <video> element on refresh / file change so the
  // browser does not keep playing the previous source from cache.
  return (
    <div className="w-full h-full flex items-center justify-center overflow-auto p-4 bg-black">
      <video
        key={refreshKey}
        src={url}
        controls
        playsInline
        preload="metadata"
        className="max-w-full max-h-full rounded shadow-md bg-black"
      >
        Your browser does not support inline video playback.
      </video>
    </div>
  );
}

function AudioPreview({
  url,
  refreshKey,
  filename,
}: {
  url: string;
  refreshKey: number;
  filename: string;
}) {
  // `key` forces a fresh <audio> element on refresh / file change so the
  // browser does not keep playing the previous source from cache.
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-6 p-8 bg-gray-50 dark:bg-gray-900">
      <div className="flex flex-col items-center gap-3 text-gray-500 dark:text-gray-400">
        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 dark:from-blue-600 dark:to-purple-700 flex items-center justify-center shadow-lg">
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
        </div>
        <p className="text-sm font-medium max-w-xs truncate" title={filename}>
          {filename}
        </p>
      </div>
      <audio key={refreshKey} src={url} controls preload="metadata" className="w-full max-w-xl">
        Your browser does not support inline audio playback.
      </audio>
    </div>
  );
}

function PdfPreview({ url, refreshKey }: { url: string; refreshKey: number }) {
  return (
    <iframe key={refreshKey} src={url} title="PDF Preview" className="w-full h-full border-0" />
  );
}

function TextPreview({ url, refreshKey }: { url: string; refreshKey: number }) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(url)
      .then((r) => r.text())
      .then((t) => {
        setContent(t);
        setLoading(false);
      })
      .catch(() => {
        setContent('Failed to load file.');
        setLoading(false);
      });
    // refreshKey intentionally triggers re-fetch
  }, [url, refreshKey]);

  if (loading) return <div className="p-4 text-sm text-gray-400">Loading…</div>;
  return (
    <pre className="w-full h-full overflow-auto p-4 text-sm font-mono text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-900 whitespace-pre-wrap break-all">
      {content}
    </pre>
  );
}

interface MarkdownPreviewProps {
  filePath: string;
  url: string;
  refreshKey: number;
}

function MarkdownPreview({ filePath, url, refreshKey }: MarkdownPreviewProps) {
  const [source, setSource] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  // Which panes are visible: 'both' | 'editor' | 'preview'
  const [paneMode, setPaneMode] = useState<'both' | 'editor' | 'preview'>('both');
  // Editor width fraction (0..1); only relevant when paneMode === 'both'
  const [editorFrac, setEditorFrac] = useState(0.5);

  const splitRef = useRef<HTMLDivElement>(null);
  const isDraggingSplit = useRef(false);
  const startSplitX = useRef(0);
  const startFrac = useRef(0.5);

  // Scroll-sync refs
  const editorScrollRef = useRef<HTMLTextAreaElement>(null);
  const previewScrollRef = useRef<HTMLDivElement>(null);
  const syncingEditor = useRef(false);
  const syncingPreview = useRef(false);

  // Load content on mount / refresh
  useEffect(() => {
    setLoading(true);
    fetch(url)
      .then((r) => r.text())
      .then((t) => {
        setSource(t);
        setLoading(false);
        setIsDirty(false);
      })
      .catch(() => {
        setSource('');
        setLoading(false);
      });
  }, [url, refreshKey]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch('/api/workspace', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath, content: source }),
      });
      setSavedOk(true);
      setIsDirty(false);
      setTimeout(() => setSavedOk(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  // Ctrl/Cmd+S keyboard shortcut to save
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (isDirty && !saving) handleSave();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // handleSave is stable across renders (no deps that change); isDirty/saving captured via closure
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty, saving]);

  // Drag-to-resize between editor and preview
  const onSplitMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingSplit.current = true;
    startSplitX.current = e.clientX;
    startFrac.current = editorFrac;
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDraggingSplit.current || !splitRef.current) return;
      const containerW = splitRef.current.offsetWidth;
      if (containerW === 0) return;
      const delta = e.clientX - startSplitX.current;
      const next = Math.max(0.15, Math.min(0.85, startFrac.current + delta / containerW));
      setEditorFrac(next);
    };
    const onUp = () => {
      isDraggingSplit.current = false;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [editorFrac]);

  if (loading) return <div className="p-4 text-sm text-gray-400">Loading…</div>;

  const showEditor = paneMode === 'both' || paneMode === 'editor';
  const showPreview = paneMode === 'both' || paneMode === 'preview';

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex-shrink-0 gap-2">
        {/* Pane toggle buttons */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setPaneMode('editor')}
            title="Editor only"
            className={`h-7 w-7 flex items-center justify-center rounded transition-colors
              ${
                paneMode === 'editor'
                  ? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300'
                  : 'text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
          >
            <PanelLeftClose size={14} />
          </button>
          <button
            onClick={() => setPaneMode('both')}
            title="Split view"
            className={`h-7 w-7 flex items-center justify-center rounded transition-colors
              ${
                paneMode === 'both'
                  ? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300'
                  : 'text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
          >
            <Columns2 size={14} />
          </button>
          <button
            onClick={() => setPaneMode('preview')}
            title="Preview only"
            className={`h-7 w-7 flex items-center justify-center rounded transition-colors
              ${
                paneMode === 'preview'
                  ? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300'
                  : 'text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
          >
            <PanelRightClose size={14} />
          </button>
        </div>

        {/* Status + Save */}
        <span className="text-sm text-gray-400 flex-1 min-w-0 truncate">
          {isDirty ? 'Unsaved changes' : ''}
        </span>
        <button
          onClick={handleSave}
          disabled={saving || !isDirty}
          className="flex items-center gap-1.5 px-3 h-7 rounded-md text-sm font-semibold transition-colors
            bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-40 flex-shrink-0"
        >
          {savedOk ? (
            <>
              <Check size={14} /> Saved
            </>
          ) : saving ? (
            <>
              <RefreshCw size={14} className="animate-spin" /> Saving…
            </>
          ) : (
            <>
              <Save size={14} /> Save
            </>
          )}
        </button>
      </div>

      {/* Panes */}
      <div ref={splitRef} className="flex flex-1 overflow-hidden relative">
        {/* Editor pane */}
        {showEditor && (
          <div
            className="flex flex-col overflow-hidden"
            style={paneMode === 'both' ? { width: `${editorFrac * 100}%` } : { width: '100%' }}
          >
            {paneMode === 'both' && (
              <div className="px-2 py-1 text-sm font-semibold text-gray-400 uppercase tracking-wide bg-gray-50 dark:bg-gray-800 flex-shrink-0">
                Editor
              </div>
            )}
            <textarea
              ref={editorScrollRef}
              value={source}
              onChange={(e) => {
                setSource(e.target.value);
                setIsDirty(true);
              }}
              spellCheck={false}
              className="flex-1 w-full resize-none p-3 font-mono text-sm text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-950 focus:outline-none"
              onScroll={(e) => {
                if (syncingEditor.current) return;
                const ta = e.currentTarget;
                const pv = previewScrollRef.current;
                if (!pv) return;
                const ratio = ta.scrollTop / Math.max(1, ta.scrollHeight - ta.clientHeight);
                syncingPreview.current = true;
                pv.scrollTop = ratio * Math.max(0, pv.scrollHeight - pv.clientHeight);
                setTimeout(() => {
                  syncingPreview.current = false;
                }, 50);
              }}
            />
          </div>
        )}

        {/* Drag divider (only in split mode) */}
        {paneMode === 'both' && (
          <div
            onMouseDown={onSplitMouseDown}
            className="absolute top-0 bottom-0 w-1 cursor-col-resize z-10 group flex items-center justify-center"
            style={{ left: `calc(${editorFrac * 100}% - 2px)` }}
            title="Drag to resize panes"
          >
            <div className="w-0.5 h-full bg-gray-200 dark:bg-gray-700 group-hover:bg-blue-400 dark:group-hover:bg-blue-500 transition-colors" />
          </div>
        )}

        {/* Preview pane */}
        {showPreview && (
          <div
            className="flex flex-col overflow-hidden"
            style={
              paneMode === 'both' ? { width: `${(1 - editorFrac) * 100}%` } : { width: '100%' }
            }
          >
            {paneMode === 'both' && (
              <div className="px-2 py-1 text-sm font-semibold text-gray-400 uppercase tracking-wide bg-gray-50 dark:bg-gray-800 flex-shrink-0 border-l border-gray-200 dark:border-gray-700">
                Preview
              </div>
            )}
            <div
              ref={previewScrollRef}
              className={`flex-1 overflow-auto p-4 max-w-none ${paneMode === 'both' ? 'border-l border-gray-200 dark:border-gray-700' : ''}`}
              onScroll={(e) => {
                if (syncingPreview.current) return;
                const pv = e.currentTarget;
                const ta = editorScrollRef.current;
                if (!ta) return;
                const ratio = pv.scrollTop / Math.max(1, pv.scrollHeight - pv.clientHeight);
                syncingEditor.current = true;
                ta.scrollTop = ratio * Math.max(0, ta.scrollHeight - ta.clientHeight);
                setTimeout(() => {
                  syncingEditor.current = false;
                }, 50);
              }}
            >
              <MarkdownContent>{source}</MarkdownContent>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export interface PreviewFile {
  path: string;
  title?: string;
  /** Incremented by the chat page on every open_preview call; drives auto-refresh */
  version?: number;
}

interface PreviewPanelProps {
  file: PreviewFile;
  onClose: () => void;
}

export default function PreviewPanel({ file, onClose }: PreviewPanelProps) {
  // Width is stored as a percentage of viewport so it scales when the browser is resized
  const [widthPct, setWidthPct] = useState(DEFAULT_PCT);
  const [isMobile, setIsMobile] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  // extraRefresh is bumped by the manual Refresh button;
  // file.version is bumped by the chat page on every open_preview call.
  const [extraRefresh, setExtraRefresh] = useState(0);
  /** When set, opens the 2-step Send-to-RAG dialog. We snapshot the file at
   *  the moment the user clicks so the dialog is unaffected by later
   *  preview navigation. For text/markdown/html we fetch the bytes as text;
   *  for PDFs the dialog uploads the raw blob via multipart. */
  const [ragSnapshot, setRagSnapshot] = useState<
    | { kind: 'text'; title: string; content: string; mime: string }
    | { kind: 'pdf'; title: string; pdfUrl: string; filename: string }
    | null
  >(null);
  const refreshKey = (file.version ?? 0) + extraRefresh;
  const widthPctRef = useRef(DEFAULT_PCT);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startPct = useRef(DEFAULT_PCT);

  // Track mobile breakpoint
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check, { passive: true });
    return () => window.removeEventListener('resize', check);
  }, []);

  // Restore persisted width (percentage)
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

  // Drag-to-resize: handle is on the LEFT edge.
  // The panel sits on the right; dragging LEFT widens it (clientX decreases → pct increases).
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
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      // If the button was released outside the browser window, cancel the drag
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
      // Convert pixel delta to percentage of viewport
      const deltaPct = ((startX.current - e.clientX) / vw) * 100;
      const next = Math.max(MIN_PCT, Math.min(MAX_PCT, startPct.current + deltaPct));
      widthPctRef.current = next;
      setWidthPct(next);
    };
    const onUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      setDragActive(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      localStorage.setItem(STORAGE_KEY, String(widthPctRef.current));
    };
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') onUp();
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('dragend', onUp);
    // Also cancel if the window loses focus (e.g. alt-tab while dragging)
    window.addEventListener('blur', onUp);
    document.addEventListener('mouseleave', onUp);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      onUp();
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('dragend', onUp);
      window.removeEventListener('blur', onUp);
      document.removeEventListener('mouseleave', onUp);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  const kind = detectKind(file.path);
  const url = fileUrl(file.path);
  const title = file.title ?? file.path.split('/').pop() ?? 'Preview';
  const newTabUrl = url;

  return (
    <>
      {/* Full-screen transparent overlay while resizing.
          Sits above the iframe so the iframe cannot capture mouse events,
          allowing the drag to continue when the cursor moves into the preview. */}
      {dragActive && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, cursor: 'col-resize' }} />
      )}
      <div
        className="flex-shrink-0 flex h-full bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 relative"
        style={{ width: isMobile ? '100%' : `${widthPct}%` }}
      >
        {/* Drag handle – desktop only */}
        {!isMobile && (
          <div
            onMouseDown={onMouseDown}
            className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 dark:hover:bg-blue-600 transition-colors z-10 group"
            title="Drag to resize"
          >
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-10 rounded-full bg-gray-300 dark:bg-gray-600 group-hover:bg-blue-400 dark:group-hover:bg-blue-500 transition-colors" />
          </div>
        )}

        {/* Panel content */}
        <div className="flex flex-col w-full overflow-hidden pl-0 md:pl-1">
          {/* Header
            On mobile: pl-16 clears the fixed hamburger button (top-3 left-3 w-12).
            On desktop: normal px-3. */}
          <div className="flex items-center gap-2 pl-18 pr-3 py-4 md:px-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex-shrink-0">
            {/* Mobile: back-to-chat button replaces the panel icon */}
            <button
              onClick={onClose}
              title="Back to chat"
              className="md:hidden h-8 flex items-center gap-1 px-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors flex-shrink-0 text-sm font-medium"
            >
              <ArrowLeft size={20} />
              <span>Chat</span>
            </button>
            {/* Desktop: decorative panel icon */}
            <PanelRight size={20} className="hidden md:block text-gray-400 flex-shrink-0" />
            <span
              className="flex-1 text-md font-600 text-gray-800 dark:text-gray-200 truncate min-w-0"
              title={file.path}
            >
              {title}
            </span>
            <div className="flex items-center gap-1 flex-shrink-0 gap-3">
              {/* Send to RAG — only meaningful for textual / pdf previews */}
              {(kind === 'html' || kind === 'pdf' || kind === 'markdown' || kind === 'text') && (
                <button
                  onClick={async () => {
                    const filename = file.path.split('/').pop() || 'document';
                    if (kind === 'pdf') {
                      setRagSnapshot({
                        kind: 'pdf',
                        title: title.replace(/\.[^.]+$/, ''),
                        pdfUrl: url,
                        filename,
                      });
                    } else {
                      // Fetch bytes as text — works for html / md / txt / json etc.
                      try {
                        const res = await fetch(url);
                        const text = await res.text();
                        const mime =
                          kind === 'html'
                            ? 'text/html'
                            : kind === 'markdown'
                              ? 'text/markdown'
                              : 'text/plain';
                        setRagSnapshot({
                          kind: 'text',
                          title: title.replace(/\.[^.]+$/, ''),
                          content: text,
                          mime,
                        });
                      } catch {
                        // Best-effort — if fetch fails the dialog never opens
                      }
                    }
                  }}
                  title="Send to RAG"
                  className="h-7 w-7 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
                >
                  <BookPlus size={20} />
                </button>
              )}
              <button
                onClick={() => setExtraRefresh((k) => k + 1)}
                title="Refresh"
                className="h-7 w-7 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
              >
                <RefreshCw size={20} />
              </button>
              <a
                href={newTabUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="Open in new tab"
                className="h-7 w-7 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
              >
                <ExternalLink size={20} />
              </a>
              {/* Desktop only: X close button (mobile uses the ← Chat button instead) */}
              <button
                onClick={onClose}
                title="Close preview"
                className="hidden md:flex h-7 w-7 items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Content area */}
          <div className="flex-1 overflow-hidden">
            {kind === 'html' && <HtmlPreview url={url} refreshKey={refreshKey} />}
            {kind === 'image' && <ImagePreview url={url} refreshKey={refreshKey} />}
            {kind === 'video' && <VideoPreview url={url} refreshKey={refreshKey} />}
            {kind === 'audio' && (
              <AudioPreview url={url} refreshKey={refreshKey} filename={title} />
            )}
            {kind === 'pdf' && <PdfPreview url={url} refreshKey={refreshKey} />}
            {kind === 'markdown' && (
              <MarkdownPreview filePath={file.path} url={url} refreshKey={refreshKey} />
            )}
            {(kind === 'text' || kind === 'unknown') && (
              <TextPreview url={url} refreshKey={refreshKey} />
            )}
          </div>
        </div>
      </div>

      {/* 2-step Send-to-RAG dialog (Send → Index) */}
      {ragSnapshot && ragSnapshot.kind === 'text' && (
        <SendToRagDialog
          mode="content"
          defaultTitle={ragSnapshot.title}
          content={ragSnapshot.content}
          mime={ragSnapshot.mime}
          onClose={() => setRagSnapshot(null)}
        />
      )}
      {ragSnapshot && ragSnapshot.kind === 'pdf' && (
        <SendToRagDialog
          mode="content"
          defaultTitle={ragSnapshot.title}
          pdfUrl={ragSnapshot.pdfUrl}
          filename={ragSnapshot.filename}
          onClose={() => setRagSnapshot(null)}
        />
      )}
    </>
  );
}
