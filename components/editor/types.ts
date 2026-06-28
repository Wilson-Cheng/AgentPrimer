/**
 * components/editor/types.ts
 * ---------------------------------------------------------------------------
 * Shared TypeScript interfaces for the CodeEditorPanel component family.
 *
 * Used by:
 *   - components/CodeEditorPanel.tsx        (orchestrator)
 *   - components/editor/FileBrowser.tsx     (left sidebar)
 *   - components/editor/PreviewPane.tsx     (right-side renderer)
 *   - components/editor/ContextMenu.tsx     (right-click menu)
 */

import type React from 'react';

// ── Filesystem ────────────────────────────────────────────────────────────

/** One entry returned by GET /api/editor/files. */
export interface FsEntry {
  name: string;
  isDir: boolean;
  path: string; // relative to data root
}

/** Node in the FileBrowser's lazy-loaded tree. */
export interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children?: TreeNode[];
  loaded?: boolean;
}

// ── Tabs ──────────────────────────────────────────────────────────────────

/** A single open tab in the editor. */
export interface OpenTab {
  path: string;         // relative to data root
  label: string;        // filename
  content: string;      // current (possibly dirty) content
  savedContent: string; // content as last saved / loaded
  loading: boolean;
  /** True for binary/preview-only kinds (image/video/audio/pdf). The editor
   *  pane is hidden and only the preview pane is shown — Monaco would just
   *  trigger the "unusual line terminators" alert on raw audio/video bytes. */
  previewOnly?: boolean;
}

// ── Context menu ──────────────────────────────────────────────────────────

export interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}

export interface ContextMenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

// ── Preview ───────────────────────────────────────────────────────────────

/**
 * Inline-previewable file kinds. The preview pane renders one of:
 *   • 'markdown' — fetched as text, rendered via <MarkdownContent>
 *   • 'html'     — <iframe src> pointing at /api/editor/preview
 *   • 'image'    — <img src>     pointing at /api/editor/preview
 *   • 'video'    — <video>       pointing at /api/editor/preview
 *   • 'audio'    — <audio>       pointing at /api/editor/preview
 *   • 'pdf'      — <iframe src>  pointing at /api/editor/preview
 *   • null       — not previewable; the pane shows a hint message
 */
export type PreviewKind = 'markdown' | 'html' | 'image' | 'video' | 'audio' | 'pdf' | null;
