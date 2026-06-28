'use client';

/**
 * components/editor/FileBrowser.tsx
 * ---------------------------------------------------------------------------
 * Left sidebar for the code editor — a lazy-loaded folder tree for the
 * `data/` directory with inline create / rename / delete and a right-click
 * context menu.
 *
 * Highlights:
 *   • Children of each folder are fetched on first expand and cached on the
 *     `TreeNode` itself; subsequent toggles just flip the `expanded` set.
 *   • `revealSignal` from the parent expands every ancestor folder of a
 *     given file path so opening a tab also focuses it in the sidebar.
 *   • Folder downloads stream a server-built `.tar.gz`; a spinner is shown
 *     on the row while the archive is being prepared.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Folder, FolderOpen, FileText, Pencil, Trash2,
  ChevronRight, ChevronDown, Loader2, FolderPlus, FilePlus, Download,
} from 'lucide-react';
import { useConfirm } from '@/components/ui/CustomConfirmDialog';
import ContextMenu from './ContextMenu';
import type { ContextMenuItem, ContextMenuState, FsEntry, TreeNode } from './types';
import { parentPath } from './utils';

interface Props {
  rootFolder: string;
  initialExpandPath?: string;
  activeFilePath: string | null;
  revealSignal?: { path: string; tick: number } | null;
  onOpenFile: (path: string) => void;
}

// ── Tree mutation helpers ──────────────────────────────────────────────────
// Pure functions over `TreeNode[]`. Kept module-scoped so they don't get
// recreated on every render.

/**
 * Replaces the children of the node at `targetPath`, preserving any cached
 * grandchildren on entries that already had them.
 *
 * `loadDir` only returns name / path / isDir for each entry, so a naïve
 * replace would wipe `.children` and `.loaded` on every descendant. That
 * causes a subtle bug: collapse an ancestor → re-expand it → the previously
 * expanded grandchild folders still appear "open" (because `expanded` is
 * unchanged) but render no children (because their `.children` is gone).
 *
 * Merging by path keeps the cache intact across reloads while still
 * letting siblings appear / disappear if the server's listing changed.
 */
function setChildren(nodes: TreeNode[], targetPath: string, children: TreeNode[]): TreeNode[] {
  return nodes.map(n => {
    if (n.path === targetPath) {
      const oldByPath = new Map(n.children?.map(c => [c.path, c]) ?? []);
      const merged = children.map(c => {
        const prev = oldByPath.get(c.path);
        return prev
          ? { ...c, children: prev.children, loaded: prev.loaded }
          : c;
      });
      return { ...n, children: merged, loaded: true };
    }
    return { ...n, children: n.children ? setChildren(n.children, targetPath, children) : undefined };
  });
}

/** Replaces the children of `parent`, treating `''` as the root list. */
function replaceParentChildren(nodes: TreeNode[], parent: string, siblings: TreeNode[]): TreeNode[] {
  if (parent === '') return siblings;
  return setChildren(nodes, parent, siblings);
}

// ── CreateInput ───────────────────────────────────────────────────────────
// Single source of truth for the inline "new file / new folder" input.
// Used at two locations — inside a folder node, and at the root when the
// target parent isn't yet a visible node. The visual differences (icon
// size, wrapper padding, border) live in props so the event handling
// (onChange / onKeyDown / onBlur / placeholder) can never drift between
// the two call sites. The shared `inputRef` is also passed in by the
// parent so the auto-focus effect still targets the rendered element.

interface CreateInputProps {
  creating: { parentPath: string; type: 'file' | 'dir'; value: string };
  setCreating: React.Dispatch<React.SetStateAction<
    { parentPath: string; type: 'file' | 'dir'; value: string } | null
  >>;
  submitCreate: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  /** Tailwind classes for the outer <div>. */
  wrapperClassName: string;
  /** Optional inline style for the outer <div> (used for tree indent). */
  wrapperStyle?: React.CSSProperties;
  /** Icon size (px). 14 at root, 16 inside the tree. */
  iconSize: number;
}

function CreateInput({
  creating, setCreating, submitCreate, inputRef,
  wrapperClassName, wrapperStyle, iconSize,
}: CreateInputProps) {
  const Icon = creating.type === 'dir' ? FolderPlus : FilePlus;
  const iconColor = creating.type === 'dir' ? 'text-yellow-400' : 'text-blue-400';
  return (
    <div className={wrapperClassName} style={wrapperStyle}>
      <Icon size={iconSize} className={`${iconColor} flex-shrink-0`} />
      <input
        ref={inputRef}
        value={creating.value}
        onChange={e => setCreating(c => c ? { ...c, value: e.target.value } : null)}
        onKeyDown={e => {
          if (e.key === 'Enter')  submitCreate();
          if (e.key === 'Escape') setCreating(null);
        }}
        onBlur={submitCreate}
        placeholder={creating.type === 'dir' ? 'folder name' : 'file name'}
        className="flex-1 min-w-0 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm rounded px-1.5 py-0.5 outline-none border border-blue-500"
      />
    </div>
  );
}

export default function FileBrowser({
  rootFolder, initialExpandPath, activeFilePath, revealSignal,
  onOpenFile,
}: Props) {
  const [tree, setTree]           = useState<TreeNode[]>([]);
  const [expanded, setExpanded]   = useState<Set<string>>(new Set());
  const [renaming, setRenaming]   = useState<{ path: string; value: string } | null>(null);
  const [creating, setCreating]   = useState<{ parentPath: string; type: 'file' | 'dir'; value: string } | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  /** Path of the folder currently being compressed for a tarball download.
   *  Used to show a spinner on that row while the server streams the archive. */
  const [compressingPath, setCompressingPath] = useState<string | null>(null);

  const renameRef            = useRef<HTMLInputElement>(null);
  const createRef            = useRef<HTMLInputElement>(null);
  const hasAutoExpandedRef   = useRef(false);
  const { showConfirm, ConfirmModal } = useConfirm();

  // ── Data loading ─────────────────────────────────────────────────────────

  const loadDir = useCallback(async (rel: string): Promise<TreeNode[]> => {
    const res = await fetch(`/api/editor/files?path=${encodeURIComponent(rel)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.entries as FsEntry[]).map(e => ({
      name: e.name,
      path: e.path,
      isDir: e.isDir,
    }));
  }, []);

  /** Re-fetches `parent`'s children and patches them into the tree. */
  const reloadParent = useCallback(async (parent: string) => {
    const effective = parent || rootFolder;
    const siblings = await loadDir(effective);
    setTree(prev => replaceParentChildren(prev, effective, siblings));
  }, [loadDir, rootFolder]);

  // Load root + auto-expand initialExpandPath on first mount.
  useEffect(() => {
    loadDir('').then(async nodes => {
      setTree(nodes);
      if (!initialExpandPath || hasAutoExpandedRef.current) return;
      hasAutoExpandedRef.current = true;

      const parts = initialExpandPath.split('/').filter(Boolean);
      let built = '';
      const toExpand = new Set<string>();
      for (const part of parts) {
        built = built ? `${built}/${part}` : part;
        toExpand.add(built);
        const children = await loadDir(built);
        const cp = built;
        setTree(prev => setChildren(prev, cp, children));
      }
      setExpanded(toExpand);
    });
  }, [rootFolder, loadDir]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reveal: expand every ancestor folder whenever `revealSignal` changes.
  useEffect(() => {
    if (!revealSignal?.path) return;
    const parts = revealSignal.path.split('/');
    parts.pop(); // strip filename — only folders need expanding
    if (parts.length === 0) return;
    (async () => {
      let built = '';
      const toExpand = new Set<string>();
      for (const part of parts) {
        built = built ? `${built}/${part}` : part;
        toExpand.add(built);
        const children = await loadDir(built);
        const cp = built;
        setTree(prev => setChildren(prev, cp, children));
      }
      setExpanded(prev => new Set([...prev, ...toExpand]));
    })();
  }, [revealSignal, loadDir]);

  // Focus inline inputs as soon as they appear.
  useEffect(() => { if (renaming) renameRef.current?.focus(); }, [renaming]);
  useEffect(() => { if (creating) createRef.current?.focus(); }, [creating]);

  // ── Tree interactions ────────────────────────────────────────────────────

  const toggleDir = async (node: TreeNode) => {
    if (!node.isDir) return;
    if (expanded.has(node.path)) {
      setExpanded(prev => { const s = new Set(prev); s.delete(node.path); return s; });
      return;
    }
    const children = await loadDir(node.path);
    setTree(prev => setChildren(prev, node.path, children));
    setExpanded(prev => new Set([...prev, node.path]));
  };

  // ── File operations ──────────────────────────────────────────────────────

  const handleDelete = async (node: TreeNode) => {
    const ok = await showConfirm(
      `"${node.name}" will be permanently deleted.`,
      { title: node.isDir ? 'Delete folder?' : 'Delete file?', confirmLabel: 'Delete' }
    );
    if (!ok) return;
    await fetch(`/api/editor/file?path=${encodeURIComponent(node.path)}`, { method: 'DELETE' });
    await reloadParent(parentPath(node.path));
  };

  const handleDownload = async (node: TreeNode) => {
    const url = `/api/editor/download?path=${encodeURIComponent(node.path)}`;

    // ── File ──────────────────────────────────────────────────────────────
    // Plain files use the anchor-click trick — the browser shows its native
    // Save dialog (when "Ask where to save each file" is enabled) or drops
    // the file into the default download folder. No spinner needed because
    // the request just streams bytes.
    if (!node.isDir) {
      const a = document.createElement('a');
      a.href = url;
      a.download = node.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      return;
    }

    // ── Folder ────────────────────────────────────────────────────────────
    // Tarballs can take a few seconds to build for large folders, so we
    // fetch the whole response into a blob (showing a spinner on that
    // tree row) and only THEN trigger the save dialog. This gives the
    // user honest feedback about server-side work that's actually in
    // flight.
    setCompressingPath(node.path);
    try {
      const res = await fetch(url);
      if (!res.ok) {
        await showConfirm(`Download failed: ${res.status} ${res.statusText}`, {
          title: 'Download error',
          confirmLabel: 'OK',
        });
        return;
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `${node.name}.tar.gz`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
    } finally {
      setCompressingPath(null);
    }
  };

  const submitRename = async () => {
    if (!renaming) return;
    const newName = renaming.value.trim();
    if (!newName) { setRenaming(null); return; }
    const newPath = parentPath(renaming.path)
      ? `${parentPath(renaming.path)}/${newName}`
      : newName;
    await fetch('/api/editor/file', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: renaming.path, to: newPath }),
    });
    const parent = parentPath(renaming.path);
    setRenaming(null);
    await reloadParent(parent);
  };

  const submitCreate = async () => {
    if (!creating) return;
    const name = creating.value.trim();
    if (!name) { setCreating(null); return; }
    const newPath = creating.parentPath ? `${creating.parentPath}/${name}` : name;

    if (creating.type === 'dir') {
      await fetch('/api/editor/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: newPath }),
      });
    } else {
      await fetch('/api/editor/file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: newPath, content: '' }),
      });
      onOpenFile(newPath);
    }

    const parent = creating.parentPath;
    setCreating(null);
    await reloadParent(parent);
  };

  // ── Render ───────────────────────────────────────────────────────────────

  const buildContextItems = (node: TreeNode): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [];
    if (node.isDir) {
      items.push({
        label: 'New File', icon: <FilePlus size={16} />,
        onClick: () => {
          setCreating({ parentPath: node.path, type: 'file', value: '' });
          setExpanded(prev => new Set([...prev, node.path]));
        },
      });
      items.push({
        label: 'New Folder', icon: <FolderPlus size={16} />,
        onClick: () => {
          setCreating({ parentPath: node.path, type: 'dir', value: '' });
          setExpanded(prev => new Set([...prev, node.path]));
        },
      });
    }
    items.push({
      label: 'Rename', icon: <Pencil size={16} />,
      onClick: () => setRenaming({ path: node.path, value: node.name }),
    });
    // Folders are compressed into a .tar.gz on the server before download;
    // the label differs to set expectation. Files use the browser's native
    // download flow with no preprocessing.
    items.push({
      label: node.isDir ? 'Compress and Download' : 'Download',
      icon: <Download size={16} />,
      onClick: () => handleDownload(node),
    });
    items.push({
      label: 'Delete', icon: <Trash2 size={16} />,
      onClick: () => handleDelete(node), danger: true,
    });
    return items;
  };

  const renderNodes = (nodes: TreeNode[], depth = 0): React.ReactNode => nodes.map(node => {
    const isOpen   = expanded.has(node.path);
    const isActive = activeFilePath === node.path;

    return (
      <div key={node.path}>
        <div
          className={`group flex items-center gap-1 rounded-md cursor-pointer select-none transition-colors
            ${isActive
              ? 'bg-blue-500/20 text-blue-600 dark:text-blue-300'
              : 'hover:bg-gray-100 dark:hover:bg-gray-700/50 text-gray-600 dark:text-gray-300'}
          `}
          style={{ paddingLeft: `${depth * 12 + 8}px`, paddingRight: 4, paddingTop: 4, paddingBottom: 4 }}
          onClick={() => node.isDir ? toggleDir(node) : onOpenFile(node.path)}
          onContextMenu={e => {
            e.preventDefault();
            e.stopPropagation();
            setContextMenu({ x: e.clientX, y: e.clientY, items: buildContextItems(node) });
          }}
        >
          {/* Expand chevron (folders only) */}
          <span className="flex-shrink-0 text-gray-400 dark:text-gray-500">
            {node.isDir
              ? isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />
              : <span className="w-3.5" />}
          </span>

          {/* Folder / file icon, or spinner during folder compression */}
          <span className="flex-shrink-0">
            {compressingPath === node.path
              ? <Loader2 size={16} className="text-blue-500 dark:text-blue-400 animate-spin" />
              : node.isDir
                ? isOpen
                  ? <FolderOpen size={16} className="text-yellow-500 dark:text-yellow-400" />
                  : <Folder size={16} className="text-yellow-500 dark:text-yellow-400" />
                : <FileText size={16} className="text-blue-500 dark:text-blue-400" />}
          </span>

          {/* Label OR inline rename input */}
          {renaming?.path === node.path ? (
            <input
              ref={renameRef}
              value={renaming.value}
              onChange={e => setRenaming(r => r ? { ...r, value: e.target.value } : null)}
              onKeyDown={e => {
                if (e.key === 'Enter')  submitRename();
                if (e.key === 'Escape') setRenaming(null);
              }}
              onBlur={submitRename}
              onClick={e => e.stopPropagation()}
              className="flex-1 min-w-0 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm rounded px-1.5 py-0.5 outline-none border border-blue-500 ml-1"
            />
          ) : (
            <span className="flex-1 min-w-0 truncate text-base ml-1">{node.name}</span>
          )}

          {/* Hover-only action buttons */}
          {renaming?.path !== node.path && (
            <span className="hidden group-hover:flex items-center gap-0.5 ml-auto flex-shrink-0">
              {node.isDir && (
                <>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      setCreating({ parentPath: node.path, type: 'file', value: '' });
                      setExpanded(prev => new Set([...prev, node.path]));
                    }}
                    className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-400 hover:text-gray-700 dark:hover:text-white"
                    title="New file"
                  ><FilePlus size={16} /></button>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      setCreating({ parentPath: node.path, type: 'dir', value: '' });
                      setExpanded(prev => new Set([...prev, node.path]));
                    }}
                    className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-400 hover:text-gray-700 dark:hover:text-white"
                    title="New folder"
                  ><FolderPlus size={16} /></button>
                </>
              )}
              <button
                onClick={e => { e.stopPropagation(); setRenaming({ path: node.path, value: node.name }); }}
                className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-400 hover:text-gray-700 dark:hover:text-white"
                title="Rename"
              ><Pencil size={16} /></button>
              <button
                onClick={e => { e.stopPropagation(); handleDelete(node); }}
                className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-600 text-gray-400 hover:text-red-600 dark:hover:text-white"
                title="Delete"
              ><Trash2 size={16} /></button>
            </span>
          )}
        </div>

        {/* Inline create input (rendered as a child of its parent folder) */}
        {creating && creating.parentPath === node.path && (
          <CreateInput
            creating={creating}
            setCreating={setCreating}
            submitCreate={submitCreate}
            inputRef={createRef}
            wrapperClassName="flex items-center gap-2 py-1 px-2 rounded-md"
            wrapperStyle={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}
            iconSize={16}
          />
        )}

        {/* Children — lazy-loaded on first expand */}
        {node.isDir && isOpen && node.children && renderNodes(node.children, depth + 1)}
      </div>
    );
  });

  // Root-level inline create input (when target parent isn't visible as a node).
  const showRootCreate =
    creating
    && creating.parentPath === rootFolder
    && !tree.some(n => n.path === creating.parentPath);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white dark:bg-gray-900">
      {ConfirmModal}
      {contextMenu && <ContextMenu {...contextMenu} onClose={() => setContextMenu(null)} />}

      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-2 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
        <span className="text-gray-500 dark:text-gray-400 text-sm font-medium flex-1 truncate">
          {rootFolder ? `data/${rootFolder}` : 'data'}
        </span>
        <button
          onClick={() => setCreating({ parentPath: rootFolder, type: 'file', value: '' })}
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors"
          title="New file"
        ><FilePlus size={16} /></button>
        <button
          onClick={() => setCreating({ parentPath: rootFolder, type: 'dir', value: '' })}
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors"
          title="New folder"
        ><FolderPlus size={16} /></button>
      </div>

      {showRootCreate && (
        <CreateInput
          creating={creating!}
          setCreating={setCreating}
          submitCreate={submitCreate}
          inputRef={createRef}
          wrapperClassName="flex items-center gap-2 px-3 py-1.5 border-b border-gray-200 dark:border-gray-700"
          iconSize={14}
        />
      )}

      <div className="flex-1 overflow-y-auto overflow-x-auto py-1 px-1">
        {tree.length === 0
          ? <p className="text-gray-400 dark:text-gray-500 text-sm px-3 py-4 text-center">Empty</p>
          : renderNodes(tree)}
      </div>
    </div>
  );
}
