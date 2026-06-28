'use client';

import { useState, useRef, useEffect, type ComponentProps } from 'react';
import Sidebar from './Sidebar';
import BrandLogo from './BrandLogo';

const STORAGE_KEY = 'agentprimer_sidebar_width';
const MIN = 180;
const MAX = 480;
const DEFAULT = 256;

type SidebarProps = ComponentProps<typeof Sidebar>;

/**
 * Merges a partial update into data/.ui-settings.json on the server.
 * Reads the current value first so unrelated keys are preserved.
 */
async function patchUiSettings(patch: Record<string, unknown>) {
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

/**
 * Wraps <Sidebar> with:
 *  - Desktop (≥ 768 px): a drag handle so the user can resize the sidebar.
 *    Width is persisted to localStorage and data/.ui-settings.json on the server.
 *  - Mobile (< 768 px): a slide-in drawer triggered by a hamburger button.
 *    The sidebar takes no space in the flex layout when closed.
 */
export default function ResizableSidebar(props: SidebarProps) {
  const [width, setWidth] = useState(DEFAULT);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const widthRef   = useRef(DEFAULT);
  const isDragging = useRef(false);
  const startX     = useRef(0);
  const startW     = useRef(0);

  // Detect mobile breakpoint – runs only on the client to avoid hydration mismatch
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check, { passive: true });
    return () => window.removeEventListener('resize', check);
  }, []);

  // Load persisted width on mount (desktop only)
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const n = parseInt(stored, 10);
      if (!isNaN(n) && n >= MIN && n <= MAX) {
        widthRef.current = n;
        setTimeout(() => setWidth(n), 0); // Defer to avoid hydration mismatch
        return;
      }
    }
    // Fall back to server-persisted preference
    fetch('/api/data-files?file=.ui-settings.json')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d?.content) return;
        const prefs = JSON.parse(d.content as string);
        if (typeof prefs.sidebarWidthPct === 'number') {
          const w = Math.max(MIN, Math.min(MAX,
            Math.round((prefs.sidebarWidthPct / 100) * window.innerWidth)));
          widthRef.current = w;
          setWidth(w);
          localStorage.setItem(STORAGE_KEY, String(w));
        }
      })
      .catch(() => {});
  }, []);

  // Global mouse drag handlers (desktop only)
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const next = Math.max(MIN, Math.min(MAX, startW.current + e.clientX - startX.current));
      widthRef.current = next;
      setWidth(next);
    };
    const onUp = async () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      const w = widthRef.current;
      localStorage.setItem(STORAGE_KEY, String(w));
      const pct = (w / window.innerWidth) * 100;
      await patchUiSettings({ sidebarWidthPct: Math.round(pct * 100) / 100 });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  // ── Mobile layout ──────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <>
        {/* Logo toggle – fixed top-left, hidden while drawer is open */}
        {!mobileOpen && (
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            className="shadow-lg rounded-r-4xl bg-white/50  fixed top-6 left-0 z-50 h-12 w-12 flex items-center justify-center"
          >
            <BrandLogo className="h-11 w-11 drop-shadow-md dark:drop-shadow-[0_0_8px_rgba(108,92,231,0.5)]" />
          </button>
        )}

        {/* Backdrop – tap to close */}
        {mobileOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setMobileOpen(false)}
          />
        )}

        {/* Slide-in drawer */}
        <div
          className={`fixed top-0 left-0 h-dvh z-50 w-72 transform transition-transform duration-300 ease-in-out ${
            mobileOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <Sidebar {...props} onCloseMobile={() => setMobileOpen(false)} />
        </div>
      </>
    );
  }

  // ── Desktop layout ─────────────────────────────────────────────────────────
  return (
    <>
      <div style={{ width, flexShrink: 0 }} className="h-full overflow-hidden">
        <Sidebar {...props} />
      </div>

      {/* Drag handle */}
      <div
        onMouseDown={e => {
          isDragging.current = true;
          startX.current = e.clientX;
          startW.current = widthRef.current;
          document.body.style.cursor = 'col-resize';
          document.body.style.userSelect = 'none';
          e.preventDefault();
        }}
        className="w-1 flex-shrink-0 cursor-col-resize bg-gray-200 dark:bg-gray-800 hover:bg-blue-400 dark:hover:bg-blue-500 transition-colors duration-150"
      />
    </>
  );
}
