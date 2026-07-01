'use client';

/**
 * components/editor/PreviewPane.tsx
 * ---------------------------------------------------------------------------
 * Right-hand-side renderer that mirrors the file currently open in Monaco.
 *
 * Mounted exactly once whenever the parent toggle is on — switching tabs
 * updates `path` / `refreshKey` instead of remounting the container, so an
 * md → html switch doesn't trigger an iframe-style visible reload of the
 * pane chrome.
 *
 * Refresh contract:
 *   • `refreshKey` is bumped by the parent after every successful save.
 *   • For markdown we re-fetch the file body when `path` OR `refreshKey`
 *     changes; the rendered <MarkdownContent> swaps in place.
 *   • For html / image / pdf we point the iframe/img src at
 *     /api/editor/preview/<path>?v=<refreshKey>. Path-style URLs let browser
 *     relative imports like ./style.css and ./game.js resolve correctly.
 *
 * Files we can't preview show a friendly hint instead of going blank.
 */

import { useEffect, useState } from 'react';
import { Eye, Loader2 } from 'lucide-react';
import MarkdownContent from '../MarkdownContent';
import { basename, previewKind } from './utils';
import { ACTIVE_PREVIEW_SANDBOX } from '@/lib/preview-security';

interface Props {
  path: string;
  refreshKey: number;
  isDark: boolean;
}

function previewUrl(filePath: string, refreshKey: number): string {
  const encoded = filePath
    .replace(/^\/+/, '')
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
  return `/api/editor/preview/${encoded}?v=${refreshKey}`;
}

export default function PreviewPane({ path, refreshKey, isDark }: Props) {
  const kind = previewKind(path);
  const src = previewUrl(path, refreshKey);

  // Fetched body for markdown previews. Stored so the swap is instant when
  // refreshKey bumps mid-stream (no flash of empty preview).
  const [mdBody, setMdBody] = useState<string>('');
  const [mdError, setMdError] = useState<string | null>(null);
  const [mdLoading, setMdLoading] = useState(false);

  useEffect(() => {
    if (kind !== 'markdown') return;
    let cancelled = false;
    setMdLoading(true);
    setMdError(null);
    fetch(src)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((text) => {
        if (!cancelled) {
          setMdBody(text);
          setMdLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setMdError(String(err.message ?? err));
          setMdLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [src, kind]);

  // ── Unsupported extension ────────────────────────────────────────────────
  if (!kind) {
    const ext = path.split('.').pop()?.toLowerCase() ?? '';
    return (
      <div className="h-full w-full flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 gap-2 p-4 text-center text-sm">
        <Eye size={24} className="opacity-30" />
        <p>
          No preview for <span className="font-mono">.{ext || '(no extension)'}</span> files
        </p>
        <p className="text-sm opacity-70">
          Supported: md, html, png, jpg, jpeg, gif, svg, webp, pdf, mp4, webm, mov, mp3, wav, ogg,
          flac, m4a
        </p>
      </div>
    );
  }

  // ── Markdown ─────────────────────────────────────────────────────────────
  if (kind === 'markdown') {
    return (
      <div className={`h-full w-full overflow-auto p-4 ${isDark ? 'bg-gray-950' : 'bg-white'}`}>
        {mdError ? (
          <p className="text-red-500 text-sm">Preview failed: {mdError}</p>
        ) : mdLoading && !mdBody ? (
          <p className="text-gray-400 text-sm flex items-center gap-2">
            <Loader2 size={14} className="animate-spin" /> Loading…
          </p>
        ) : (
          <MarkdownContent>{mdBody}</MarkdownContent>
        )}
      </div>
    );
  }

  // ── Image ────────────────────────────────────────────────────────────────
  if (kind === 'image') {
    return (
      <div
        className={`h-full w-full overflow-auto flex items-center justify-center ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={basename(path)} className="max-w-full max-h-full object-contain" />
      </div>
    );
  }

  // ── Video ───────────────────────────────────────────────────────────────
  // `key` forces a fresh <video> element when the file changes so the browser
  // does not keep playing the previous source from cache.
  if (kind === 'video') {
    return (
      <div className={`h-full w-full overflow-auto flex items-center justify-center p-4 bg-black`}>
        <video
          key={kind}
          src={src}
          controls
          playsInline
          preload="metadata"
          className="max-w-full max-h-full rounded bg-black"
        >
          Your browser does not support inline video playback.
        </video>
      </div>
    );
  }

  // ── Audio ───────────────────────────────────────────────────────────────
  if (kind === 'audio') {
    const filename = basename(path);
    return (
      <div className="h-full w-full flex flex-col items-center justify-center gap-6 p-8 bg-gray-50 dark:bg-gray-900">
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
        <audio key={kind} src={src} controls preload="metadata" className="w-full max-w-xl">
          Your browser does not support inline audio playback.
        </audio>
      </div>
    );
  }

  // ── html or pdf — sandboxed iframe ───────────────────────────────────────
  // We deliberately set the `src` attribute (not `srcDoc`) so the browser
  // hits /api/editor/preview/<path>, which streams raw bytes from a path-style
  // URL so the iframe resolves relative URLs against the file's own folder.
  return (
    <iframe
      key={kind} // ensure src actually swaps when kind changes (html ↔ pdf)
      src={src}
      title={`Preview of ${basename(path)}`}
      className={`h-full w-full border-0 ${isDark ? 'bg-gray-900' : 'bg-white'}`}
      sandbox={kind === 'html' ? ACTIVE_PREVIEW_SANDBOX : undefined}
    />
  );
}
