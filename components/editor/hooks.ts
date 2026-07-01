'use client';

/**
 * components/editor/hooks.ts
 * ---------------------------------------------------------------------------
 * Custom React hooks that encapsulate the drag-to-resize lifecycles used by
 * <CodeEditorPanel>. Extracted to keep the panel orchestration file
 * focused on layout and state composition rather than pointer plumbing.
 *
 * Each hook owns its global mousemove/mouseup listeners and debounces
 * persistence to `data/.ui-settings.json` so a long drag doesn't spam the
 * server with PUT requests.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { patchUiSettings } from './utils';

// ── useSidebarResize ──────────────────────────────────────────────────────

interface SidebarResizeOptions {
  /** Initial width (px). Server-safe default; restored after mount. */
  initial: number;
  min: number;
  max: number;
  /** Persistence delay after the user releases the divider (ms). */
  persistDelayMs?: number;
}

interface SidebarResizeResult {
  /** Current width in pixels. */
  width: number;
  /** Imperatively set width (also updates the internal ref used during drags). */
  setWidth: (next: number) => void;
  /** True while the user is actively dragging the divider. */
  isDragging: boolean;
  /** Bind to the divider's `onMouseDown`. */
  onDividerMouseDown: (e: React.MouseEvent) => void;
}

/**
 * Manages a horizontally-dragged sidebar. The width is clamped to
 * `[min, max]` on every pointer move; on release it's written to
 * localStorage immediately and to `.ui-settings.json` after a short debounce.
 */
export function useSidebarResize({
  initial,
  min,
  max,
  persistDelayMs = 800,
}: SidebarResizeOptions): SidebarResizeResult {
  const [width, setWidthState] = useState(initial);
  const [isDragging, setIsDragging] = useState(false);

  const widthRef = useRef(initial);
  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setWidth = useCallback((next: number) => {
    widthRef.current = next;
    setWidthState(next);
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      const next = Math.max(
        min,
        Math.min(max, startWidthRef.current + e.clientX - startXRef.current),
      );
      widthRef.current = next;
      setWidthState(next);
    };
    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      setIsDragging(false);
      const w = widthRef.current;
      localStorage.setItem('editor-sidebar-width', String(w));
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
      persistTimerRef.current = setTimeout(
        () => patchUiSettings({ editorFileBrowserWidth: w }),
        persistDelayMs,
      );
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [min, max, persistDelayMs]);

  const onDividerMouseDown = useCallback((e: React.MouseEvent) => {
    draggingRef.current = true;
    setIsDragging(true);
    startXRef.current = e.clientX;
    startWidthRef.current = widthRef.current;
    e.preventDefault();
  }, []);

  return { width, setWidth, isDragging, onDividerMouseDown };
}

// ── usePreviewSplit ───────────────────────────────────────────────────────

interface PreviewSplitOptions {
  /** Initial preview width as a percent (0-100) of the container. */
  initial: number;
  /** Clamp range (percent). */
  min: number;
  max: number;
  /** Container whose width is used to convert px deltas → percent. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  persistDelayMs?: number;
}

interface PreviewSplitResult {
  /** Current preview width as a percent (0-100). */
  widthPct: number;
  /** Imperatively set the percent. */
  setWidthPct: (next: number) => void;
  isDragging: boolean;
  onDividerMouseDown: (e: React.MouseEvent) => void;
}

/**
 * Manages the editor↔preview split. Translates pointer-X deltas into a
 * percent of the container's current width so the panel sizes correctly
 * regardless of the file-browser width. On release the percentage is
 * persisted to `.ui-settings.json` after a short debounce.
 */
export function usePreviewSplit({
  initial,
  min,
  max,
  containerRef,
  persistDelayMs = 600,
}: PreviewSplitOptions): PreviewSplitResult {
  const [widthPct, setWidthPctState] = useState(initial);
  const [isDragging, setIsDragging] = useState(false);

  const widthRef = useRef(initial);
  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const startPctRef = useRef(initial);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setWidthPct = useCallback((next: number) => {
    widthRef.current = next;
    setWidthPctState(next);
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current || !containerRef.current) return;
      if (e.buttons === 0) {
        onUp();
        return;
      }
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width === 0) return;
      const deltaPx = e.clientX - startXRef.current;
      const deltaPct = (deltaPx / rect.width) * 100;
      // Editor width grows as the handle moves right → preview shrinks.
      const next = Math.max(min, Math.min(max, startPctRef.current - deltaPct));
      widthRef.current = next;
      setWidthPctState(next);
    };
    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      setIsDragging(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      const pct = widthRef.current;
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
      persistTimerRef.current = setTimeout(
        () => patchUiSettings({ editorPreviewWidthPct: pct }),
        persistDelayMs,
      );
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('blur', onUp);
    document.addEventListener('mouseleave', onUp);
    return () => {
      onUp();
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('blur', onUp);
      document.removeEventListener('mouseleave', onUp);
    };
  }, [min, max, containerRef, persistDelayMs]);

  const onDividerMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!containerRef.current) return;
      draggingRef.current = true;
      setIsDragging(true);
      startXRef.current = e.clientX;
      startPctRef.current = widthRef.current;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    },
    [containerRef],
  );

  return { widthPct, setWidthPct, isDragging, onDividerMouseDown };
}

// ── useDarkMode ───────────────────────────────────────────────────────────

/** Watches `<html class="dark">` so the editor follows the global theme. */
export function useDarkMode(): boolean {
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const check = () => setIsDark(document.documentElement.classList.contains('dark'));
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return isDark;
}
