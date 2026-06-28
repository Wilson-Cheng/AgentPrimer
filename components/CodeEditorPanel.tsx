'use client';

/**
 * components/CodeEditorPanel.tsx
 * ---------------------------------------------------------------------------
 * Standalone, reusable code editor panel.
 *
 * Features:
 *  - Left file-browser sidebar for the `data/` directory (configurable
 *    base path; see `initialFolder`)
 *  - Monaco multi-tab editor (VSCode-like)
 *  - Per-tab dirty tracking with Save / Save All buttons
 *  - File operations: create, rename, delete (delegated to <FileBrowser>)
 *  - Optional right-side live preview (md / html / image / pdf)
 *  - Drag-to-resize for both the sidebar and the editor↔preview split
 *  - All visual prefs (sidebar width, collapse, preview on/off and width,
 *    open tabs) persisted to `data/.ui-settings.json` with a localStorage
 *    fast path so the UI paints in its previous state without an extra
 *    round-trip.
 *
 * The big sub-components live in `components/editor/` to keep this file
 * focused on the panel-level orchestration:
 *   - editor/FileBrowser.tsx  — folder tree & file ops
 *   - editor/EditorTabBar.tsx — top bar (sidebar toggle / tabs / save / preview)
 *   - editor/PreviewPane.tsx  — md/html/image/pdf renderer
 *   - editor/ContextMenu.tsx  — floating right-click menu
 *   - editor/hooks.ts         — drag-resize + dark-mode custom hooks
 *   - editor/utils.ts         — pure helpers (language detection, paths, …)
 *   - editor/types.ts         — shared interfaces
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { FileText, SaveAll, X, Loader2, Eye } from 'lucide-react';
import FileBrowser    from './editor/FileBrowser';
import PreviewPane    from './editor/PreviewPane';
import ContextMenu    from './editor/ContextMenu';
import EditorTabBar   from './editor/EditorTabBar';
import type { ContextMenuState, OpenTab } from './editor/types';
import { basename, extToLanguage, patchUiSettings, previewKind } from './editor/utils';
import { useSidebarResize, usePreviewSplit, useDarkMode } from './editor/hooks';

interface CodeEditorPanelProps {
  /** Start the file browser at this sub-path of the data directory. Default: `''` (root). */
  initialFolder?: string;
  /** Tailwind height class applied to the root element. Default: `'h-full'`. */
  className?: string;
}

// Sidebar width constraints (px) and preview split constraints (percent).
const SIDEBAR_MIN = 140;
const SIDEBAR_MAX = 480;
const PREVIEW_MIN_PCT = 20;
const PREVIEW_MAX_PCT = 80;

/** Kinds that are preview-only (no Monaco). Loading binary audio/video into
 *  the text editor triggers Monaco's "unusual line terminators" alert and is
 *  meaningless to edit. The preview pane streams bytes directly via
 *  /api/editor/preview/<path>. */
function isPreviewOnly(filePath: string): boolean {
  const k = previewKind(filePath);
  return k === 'image' || k === 'video' || k === 'audio' || k === 'pdf';
}

export default function CodeEditorPanel({ initialFolder = '', className = 'h-full' }: CodeEditorPanelProps) {
  // ── Tabs & save state ───────────────────────────────────────────────────
  const [tabs, setTabs]                   = useState<OpenTab[]>([]);
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null);
  const [saving, setSaving]               = useState<Set<string>>(new Set());
  const [saveError, setSaveError]         = useState<string | null>(null);
  const [hasRestored, setHasRestored]     = useState(false);
  const [revealSignal, setRevealSignal]   = useState<{ path: string; tick: number } | null>(null);
  const [tabContextMenu, setTabContextMenu] = useState<ContextMenuState | null>(null);

  // ── Theme follows global <html class="dark"> ────────────────────────────
  const isDark = useDarkMode();

  // ── Sidebar (collapse + drag-to-resize via custom hook) ─────────────────
  // The SSR-safe default of 224 is later overwritten by localStorage / the
  // server in effects below; reading localStorage in the initializer would
  // cause a hydration mismatch (https://nextjs.org/docs/messages/react-hydration-error).
  const sidebar = useSidebarResize({ initial: 224, min: SIDEBAR_MIN, max: SIDEBAR_MAX });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // ── Preview pane state ──────────────────────────────────────────────────
  /** Persisted toggle, default OFF. */
  const [previewEnabled, setPreviewEnabled] = useState(false);
  /** Bumped after each successful save so the preview re-renders. */
  const [previewRefreshKey, setPreviewRefreshKey] = useState(0);
  /** Container ref used by the split-drag hook to convert px → percent. */
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const preview = usePreviewSplit({
    initial: 50, min: PREVIEW_MIN_PCT, max: PREVIEW_MAX_PCT,
    containerRef: splitContainerRef,
  });

  // ── Other refs ──────────────────────────────────────────────────────────
  const sidebarToggleSyncRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tabScrollRef         = useRef<HTMLDivElement>(null);
  const activeTabRef         = useRef<HTMLDivElement>(null);
  const serverSyncRef        = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Auto-scroll tab bar so the active tab stays visible ─────────────────
  useEffect(() => {
    if (!activeTabPath || !activeTabRef.current || !tabScrollRef.current) return;
    activeTabRef.current.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeTabPath]);

  // ── Post-hydration localStorage restore ─────────────────────────────────
  // Runs once on mount (client only). Pulls last-session sidebar width /
  // collapsed state from localStorage. The .ui-settings.json fetch below
  // is the cross-machine source of truth and overwrites these values if it
  // disagrees — last-writer-wins is fine because both writes happen in the
  // same effect tick, before the user can interact.
  useEffect(() => {
    const storedWidth = localStorage.getItem('editor-sidebar-width');
    if (storedWidth) {
      const n = parseInt(storedWidth, 10);
      if (!isNaN(n) && n >= SIDEBAR_MIN && n <= SIDEBAR_MAX) sidebar.setWidth(n);
    }
    if (localStorage.getItem('editor-sidebar-collapsed') === 'true') setSidebarCollapsed(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Restore visual prefs from .ui-settings.json (server-of-truth) ───────
  useEffect(() => {
    fetch('/api/data-files?file=.ui-settings.json')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d?.content) return;
        const prefs = JSON.parse(d.content as string);
        if (prefs.editorSidebarCollapsed === true) setSidebarCollapsed(true);
        if (typeof prefs.editorFileBrowserWidth === 'number') {
          const n = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, prefs.editorFileBrowserWidth));
          sidebar.setWidth(n);
          localStorage.setItem('editor-sidebar-width', String(n));
        }
        if (prefs.editorPreviewEnabled === true) setPreviewEnabled(true);
        if (typeof prefs.editorPreviewWidthPct === 'number') {
          const pct = Math.max(PREVIEW_MIN_PCT, Math.min(PREVIEW_MAX_PCT, prefs.editorPreviewWidthPct));
          preview.setWidthPct(pct);
        }
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sidebar collapse: persist with the same debounce shape as resize ────
  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('editor-sidebar-collapsed', String(next));
      if (sidebarToggleSyncRef.current) clearTimeout(sidebarToggleSyncRef.current);
      sidebarToggleSyncRef.current = setTimeout(
        () => patchUiSettings({ editorSidebarCollapsed: next }), 800);
      return next;
    });
  }, []);

  // ── Preview toggle (debounced persistence) ──────────────────────────────
  const togglePreview = useCallback(() => {
    setPreviewEnabled(prev => {
      const next = !prev;
      patchUiSettings({ editorPreviewEnabled: next });
      // Force refresh when the pane re-opens, so saves made while it was
      // closed are reflected.
      if (next) setPreviewRefreshKey(k => k + 1);
      return next;
    });
  }, []);

  // ── Restore open tabs — localStorage first, server fallback ─────────────
  useEffect(() => {
    const restore = async (raw: { paths: string[]; activePath: string | null }) => {
      const { paths, activePath } = raw;
      if (!Array.isArray(paths) || paths.length === 0) { setHasRestored(true); return; }

      // previewOnly is derived from the path so the persisted tab list
      // doesn't need a schema migration.
      const makeTab = (p: string, loading: boolean): OpenTab => ({
        path: p, label: basename(p), content: '', savedContent: '', loading, previewOnly: isPreviewOnly(p),
      });
      setTabs(paths.map(p => makeTab(p, !isPreviewOnly(p))));
      setActiveTabPath(activePath ?? paths[0]);

      const textPaths = paths.filter(p => !isPreviewOnly(p));
      const results = await Promise.all(
        textPaths.map(p =>
          fetch(`/api/editor/file?path=${encodeURIComponent(p)}`)
            .then(res => res.ok
              ? res.json().then((d: { content: string }) => ({ path: p, content: d.content, ok: true }))
              : { path: p, content: '', ok: false })
            .catch(() => ({ path: p, content: '', ok: false }))
        )
      );
      const alive = results.filter(r => r.ok);
      setTabs(alive.map(r => ({
        path: r.path, label: basename(r.path),
        content: r.content, savedContent: r.content, loading: false,
        previewOnly: isPreviewOnly(r.path),
      })));
      setActiveTabPath(prev => alive.some(r => r.path === prev) ? prev : (alive[0]?.path ?? null));
      setHasRestored(true);
    };

    // 1) localStorage (instant, no round-trip)
    const stored = localStorage.getItem('editor-open-tabs');
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as { paths: string[]; activePath: string | null };
        restore(parsed);
        return;
      } catch { /* fall through */ }
    }

    // 2) .ui-settings.json (first load on a new browser)
    fetch('/api/data-files?file=.ui-settings.json')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d?.content) { setHasRestored(true); return; }
        const prefs = JSON.parse(d.content as string);
        if (prefs.editorTabs) restore(prefs.editorTabs);
        else setHasRestored(true);
      })
      .catch(() => setHasRestored(true));
  }, []);

  // ── Persist open tabs — localStorage immediately, server debounced 1s ───
  useEffect(() => {
    if (!hasRestored) return;
    const snapshot = { paths: tabs.map(t => t.path), activePath: activeTabPath };
    localStorage.setItem('editor-open-tabs', JSON.stringify(snapshot));
    if (serverSyncRef.current) clearTimeout(serverSyncRef.current);
    serverSyncRef.current = setTimeout(() => patchUiSettings({ editorTabs: snapshot }), 1000);
  }, [tabs, activeTabPath, hasRestored]);

  // ── Derived ─────────────────────────────────────────────────────────────
  const activeTab     = tabs.find(t => t.path === activeTabPath) ?? null;
  const dirtyCount    = tabs.filter(t => t.content !== t.savedContent).length;
  const activeIsDirty = !!activeTab && activeTab.content !== activeTab.savedContent;

  // ── Tab operations ──────────────────────────────────────────────────────
  const openFile = useCallback(async (filePath: string) => {
    if (tabs.find(t => t.path === filePath)) { setActiveTabPath(filePath); return; }

    const label      = basename(filePath);
    const previewOnly = isPreviewOnly(filePath);
    setTabs(prev => [...prev, {
      path: filePath, label, content: '', savedContent: '', loading: false, previewOnly,
    }]);
    setActiveTabPath(filePath);

    if (previewOnly) {
      // Auto-open the preview pane and skip the text fetch entirely —
      // preview bytes stream directly from /api/editor/preview/<path>.
      setPreviewEnabled(true);
      return;
    }

    const res = await fetch(`/api/editor/file?path=${encodeURIComponent(filePath)}`);
    if (res.ok) {
      const data = await res.json();
      setTabs(prev => prev.map(t =>
        t.path === filePath ? { ...t, content: data.content, savedContent: data.content, loading: false } : t));
    } else {
      setTabs(prev => prev.filter(t => t.path !== filePath));
    }
  }, [tabs]);

  const closeTab = useCallback((filePath: string) => {
    setTabs(prev => {
      const next = prev.filter(t => t.path !== filePath);
      if (activeTabPath === filePath) {
        setActiveTabPath(next.length > 0 ? next[next.length - 1].path : null);
      }
      return next;
    });
  }, [activeTabPath]);

  const closeOthers = useCallback((filePath: string) => {
    setTabs(prev => prev.filter(t => t.path === filePath));
    setActiveTabPath(filePath);
  }, []);

  const closeSaved = useCallback(() => {
    setTabs(prev => {
      const next = prev.filter(t => t.content !== t.savedContent);
      if (!next.some(t => t.path === activeTabPath)) {
        setActiveTabPath(next.length > 0 ? next[next.length - 1].path : null);
      }
      return next;
    });
  }, [activeTabPath]);

  const closeAll = useCallback(() => { setTabs([]); setActiveTabPath(null); }, []);

  const handleEditorChange = useCallback((value: string | undefined) => {
    if (!activeTabPath) return;
    setTabs(prev => prev.map(t => t.path === activeTabPath ? { ...t, content: value ?? '' } : t));
  }, [activeTabPath]);

  const saveTab = useCallback(async (filePath: string) => {
    const tab = tabs.find(t => t.path === filePath);
    if (!tab || tab.content === tab.savedContent) return;
    setSaving(prev => new Set([...prev, filePath]));
    setSaveError(null);
    try {
      const res = await fetch('/api/editor/file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath, content: tab.content }),
      });
      if (!res.ok) throw new Error('save failed');
      setTabs(prev => prev.map(t => t.path === filePath ? { ...t, savedContent: t.content } : t));
      // Refresh the preview iframe / re-fetch markdown so the user sees
      // their just-saved bytes. We bump unconditionally — checking whether
      // the saved file matches the active tab would miss the case where
      // the user uses Ctrl+S then switches tabs before the preview catches
      // up. The cost of an extra refresh on an unaffected file is zero.
      setPreviewRefreshKey(k => k + 1);
    } catch {
      setSaveError(`Failed to save ${basename(filePath)}`);
    } finally {
      setSaving(prev => { const s = new Set(prev); s.delete(filePath); return s; });
    }
  }, [tabs]);

  const saveAll = useCallback(async () => {
    const dirty = tabs.filter(t => t.content !== t.savedContent);
    await Promise.all(dirty.map(t => saveTab(t.path)));
  }, [tabs, saveTab]);

  // Ctrl/Cmd+S to save current file
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (activeTabPath) saveTab(activeTabPath);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeTabPath, saveTab]);

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className={`flex flex-col ${className} overflow-hidden`}>
      <div className={`flex flex-1 min-h-0 overflow-hidden${sidebar.isDragging ? ' cursor-col-resize select-none' : ''}`}>

        {/* File browser */}
        <div
          style={{ width: sidebarCollapsed ? 0 : sidebar.width }}
          className="flex-shrink-0 overflow-hidden transition-[width] duration-300 max-w-[80%]"
        >
          <FileBrowser
            rootFolder=""
            initialExpandPath={initialFolder || undefined}
            activeFilePath={activeTabPath}
            revealSignal={revealSignal}
            onOpenFile={openFile}
          />
        </div>

        {/* Sidebar drag handle */}
        <div
          onMouseDown={sidebar.onDividerMouseDown}
          className={`w-1 flex-shrink-0 cursor-col-resize transition-all duration-300 ${
            sidebarCollapsed ? 'opacity-0 pointer-events-none' : ''
          } ${
            sidebar.isDragging
              ? 'bg-blue-500'
              : 'bg-gray-200 dark:bg-gray-700 hover:bg-blue-400 dark:hover:bg-blue-500'
          }`}
        />

        {/* Editor area */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden bg-white dark:bg-gray-900">
          <EditorTabBar
            tabs={tabs}
            activeTabPath={activeTabPath}
            sidebarCollapsed={sidebarCollapsed}
            saving={saving}
            saveError={saveError}
            dirtyCount={dirtyCount}
            activeIsDirty={activeIsDirty}
            previewEnabled={previewEnabled}
            tabScrollRef={tabScrollRef}
            activeTabRef={activeTabRef}
            onToggleSidebar={toggleSidebar}
            onTogglePreview={togglePreview}
            onSelectTab={path => { setActiveTabPath(path); setRevealSignal({ path, tick: Date.now() }); }}
            onCloseTab={closeTab}
            onSaveActive={() => activeTabPath && saveTab(activeTabPath)}
            onSaveAll={saveAll}
            onTabContextMenu={(e, path) => {
              e.preventDefault();
              setTabContextMenu({
                x: e.clientX,
                y: e.clientY,
                items: [
                  { label: 'Close',        icon: <X size={14} />,       onClick: () => closeTab(path) },
                  { label: 'Close Others', icon: <X size={14} />,       onClick: () => closeOthers(path) },
                  { label: 'Close Saved',  icon: <SaveAll size={14} />, onClick: () => closeSaved() },
                  { label: 'Close All',    icon: <X size={14} />,       onClick: () => closeAll() },
                ],
              });
            }}
          />

          {/* Monaco + (optional) preview, or empty state */}
          {activeTab ? (
            activeTab.loading ? (
              <div className="flex-1 flex items-center justify-center text-gray-400 gap-2">
                <Loader2 size={18} className="animate-spin" /> Loading…
              </div>
            ) : activeTab.previewOnly ? (
              // ── Preview-only tab (image/video/audio/pdf) ────────────────
              // Monaco is hidden: loading raw audio/video bytes into a text
              // editor just fires the "unusual line terminators" dialog.
              // The preview pane streams the file directly, full-width.
              <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400 flex-shrink-0">
                  <Eye size={14} className="text-emerald-600 dark:text-emerald-400" />
                  <span>
                    Preview-only file — not editable.
                    Extension <span className="font-mono">.{activeTab.label.split('.').pop()}</span> is binary; the preview pane streams the raw bytes.
                  </span>
                </div>
                <div className="flex-1 min-h-0 overflow-hidden">
                  <PreviewPane
                    path={activeTab.path}
                    refreshKey={previewRefreshKey}
                    isDark={isDark}
                  />
                </div>
              </div>
            ) : (
              // ── Editor + preview split row ─────────────────────────────
              // When previewEnabled is off, Monaco fills the whole area
              // (preview siblings unmounted). When on, we render a 3-child
              // flex row: Monaco | drag handle | preview pane. Widths use
              // inline styles so the divider drag can update them at 60fps
              // without triggering a Tailwind class swap.
              <div ref={splitContainerRef} className="flex-1 min-h-0 overflow-hidden flex">
                {preview.isDragging && (
                  <div className="fixed inset-0 z-[9999] cursor-col-resize" />
                )}
                <div
                  className="min-h-0 overflow-hidden"
                  style={previewEnabled
                    ? { width: `${100 - preview.widthPct}%`, flexShrink: 0 }
                    : { width: '100%', flexShrink: 0 }}
                >
                  <Editor
                    key={activeTab.path}
                    height="100%"
                    language={extToLanguage(activeTab.label)}
                    defaultValue={activeTab.content}
                    theme={isDark ? 'vs-dark' : 'light'}
                    onChange={handleEditorChange}
                    options={{
                      fontSize: 14,
                      minimap: { enabled: false },
                      scrollBeyondLastLine: false,
                      wordWrap: 'on',
                      lineNumbers: 'on',
                      renderLineHighlight: 'line',
                      tabSize: 2,
                    }}
                  />
                </div>

                {previewEnabled && (
                  <>
                    {/* Editor↔preview drag handle */}
                    <div
                      onMouseDown={preview.onDividerMouseDown}
                      className={`w-1 flex-shrink-0 cursor-col-resize transition-colors ${
                        preview.isDragging
                          ? 'bg-blue-500'
                          : 'bg-gray-200 dark:bg-gray-700 hover:bg-blue-400 dark:hover:bg-blue-500'
                      }`}
                      title="Drag to resize preview"
                    />
                    <div
                      className="min-h-0 overflow-hidden border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950"
                      style={{ width: `${preview.widthPct}%`, flexShrink: 0 }}
                    >
                      <PreviewPane
                        path={activeTab.path}
                        refreshKey={previewRefreshKey}
                        isDark={isDark}
                      />
                    </div>
                  </>
                )}
              </div>
            )
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-3 select-none">
              <FileText size={40} className="opacity-20" />
              <p className="text-base">Select a file to start editing</p>
            </div>
          )}
        </div>
      </div>

      {tabContextMenu && (
        <ContextMenu {...tabContextMenu} onClose={() => setTabContextMenu(null)} />
      )}
    </div>
  );
}


