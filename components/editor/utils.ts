/**
 * components/editor/utils.ts
 * ---------------------------------------------------------------------------
 * Pure helpers shared across the CodeEditorPanel family. Nothing here touches
 * React state — all functions are side-effect free except `patchUiSettings`,
 * which performs an HTTP round-trip against /api/data-files.
 */

import type { PreviewKind } from './types';

// ── Path helpers ──────────────────────────────────────────────────────────

/** Final segment of a `/`-separated path (`'a/b/c.md' → 'c.md'`). */
export function basename(p: string): string {
  return p.split('/').pop() ?? p;
}

/** Everything before the final `/` (`'a/b/c.md' → 'a/b'`, root → `''`). */
export function parentPath(p: string): string {
  const parts = p.split('/');
  parts.pop();
  return parts.join('/');
}

// ── Monaco language detection ─────────────────────────────────────────────

/** Maps a filename's extension to a Monaco language id. */
export function extToLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript',
    js: 'javascript', jsx: 'javascript',
    json: 'json', md: 'markdown',
    py: 'python', sh: 'shell',
    yaml: 'yaml', yml: 'yaml',
    html: 'html', css: 'css',
    txt: 'plaintext',
  };
  return map[ext] ?? 'plaintext';
}

// ── Preview kind detection ────────────────────────────────────────────────

/** Decides which preview renderer (if any) should handle a given filename. */
export function previewKind(filename: string): PreviewKind {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'md' || ext === 'markdown') return 'markdown';
  if (ext === 'html' || ext === 'htm')    return 'html';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'image';
  if (['mp4', 'webm', 'm4v', 'mov', 'ogv'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'm4a', 'flac', 'ogg', 'oga', 'opus', 'aac'].includes(ext)) return 'audio';
  if (ext === 'pdf')                       return 'pdf';
  return null;
}

// ── UI settings persistence ───────────────────────────────────────────────

/**
 * Merges a partial update into `data/.ui-settings.json`, preserving other
 * keys. Best-effort: network failures are swallowed so callers don't need
 * to wrap calls in try/catch.
 */
export async function patchUiSettings(patch: Record<string, unknown>): Promise<void> {
  try {
    const r = await fetch('/api/data-files?file=.ui-settings.json');
    const d = r.ok ? await r.json() : {};
    const current = d.content ? JSON.parse(d.content as string) : {};
    await fetch('/api/data-files', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file: '.ui-settings.json',
        content: JSON.stringify({ ...current, ...patch }),
      }),
    });
  } catch { /* best-effort */ }
}
