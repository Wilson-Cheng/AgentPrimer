'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  MessageSquare, Plus, Settings, Brain, LogOut,
  Trash2, ChevronRight, Zap, ShieldCheck, Pencil, X, BarChart2, BookOpen,
  Code2, Pin, PinOff, ChevronDown, Bookmark, BookmarkX, Wrench, MoreHorizontal,
} from 'lucide-react';
import { useConfirm } from '@/components/ui/CustomConfirmDialog';
import BrandLogo from './BrandLogo';

interface Session {
  id: string;
  title: string;
  agent_name: string;
  updated_at: number;
  pinned_chat: number;
  pinned_prompt: string | null;
}

interface SidebarProps {
  currentSessionId?: string;
  onNewSession: () => void;
  onSelectSession: (id: string, title: string, agentName?: string) => void;
  onRenameSession?: (id: string, title: string) => void;
  onCloseMobile?: () => void;
}

const ACTION_MENU_WIDTH = 220;
const ACTION_MENU_HEIGHT = 188;
const ACTION_MENU_GAP = 8;
const ACTION_MENU_MARGIN = 8;

function getActionMenuPosition(rect: Pick<DOMRect, 'top' | 'bottom' | 'right'>) {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const left = Math.max(
    ACTION_MENU_MARGIN,
    Math.min(rect.right - ACTION_MENU_WIDTH, viewportWidth - ACTION_MENU_WIDTH - ACTION_MENU_MARGIN),
  );
  const below = rect.bottom + ACTION_MENU_GAP;
  const above = rect.top - ACTION_MENU_GAP - ACTION_MENU_HEIGHT;
  const top = below + ACTION_MENU_HEIGHT <= viewportHeight - ACTION_MENU_MARGIN
    ? below
    : Math.max(ACTION_MENU_MARGIN, above);
  return { x: left, y: top };
}

export default function Sidebar({ currentSessionId, onNewSession, onSelectSession, onRenameSession, onCloseMobile }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [workspaceOpen, setWorkspaceOpen] = useState(true);
  const [systemOpen, setSystemOpen] = useState(true);
  const [pinnedChatsOpen, setPinnedChatsOpen] = useState(true);
  const [recentChatsOpen, setRecentChatsOpen] = useState(true);
  const [showLearnNav, setShowLearnNav] = useState(true);
  const [optimisticSessionId, setOptimisticSessionId] = useState<string | undefined>(currentSessionId);
  const editInputRef = useRef<HTMLInputElement>(null);
  const { showConfirm, ConfirmModal } = useConfirm();

  // Load UI settings from data/.ui-settings.json
  useEffect(() => {
    fetch('/api/ui-settings')
      .then(r => r.json())
      .then((d: Record<string, unknown>) => {
        if (d.sidebar_workspace_open !== undefined) setWorkspaceOpen(d.sidebar_workspace_open !== false);
        if (d.sidebar_system_open !== undefined) setSystemOpen(d.sidebar_system_open !== false);
        if (d.sidebar_pinned_chats_open !== undefined) setPinnedChatsOpen(d.sidebar_pinned_chats_open !== false);
        if (d.sidebar_recent_chats_open !== undefined) setRecentChatsOpen(d.sidebar_recent_chats_open !== false);
        if (d.show_learn_nav !== undefined) setShowLearnNav(d.show_learn_nav !== false);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<Record<string, unknown>>).detail;
      if (detail?.show_learn_nav !== undefined) setShowLearnNav(detail.show_learn_nav !== false);
    };
    window.addEventListener('ui-settings-changed', handler);
    return () => window.removeEventListener('ui-settings-changed', handler);
  }, []);

  const saveUiSetting = useCallback((key: string, value: boolean) => {
    fetch('/api/ui-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: value }),
    }).catch(() => {});
  }, []);

  // Load sessions
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const res = await fetch('/api/sessions');
      if (res.ok && !cancelled) {
        const data = await res.json();
        setSessions(data.sessions);
      }
    };
    load();
    const interval = setInterval(load, 30000);
    const onSessionsChanged = () => { if (!cancelled) load(); };
    window.addEventListener('sessions-changed', onSessionsChanged);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener('sessions-changed', onSessionsChanged);
    };
  }, []);

  useEffect(() => {
    setOptimisticSessionId(currentSessionId);
  }, [currentSessionId]);

  useEffect(() => {
    if (editingId) editInputRef.current?.focus();
  }, [editingId]);

  const startRename = (id: string, currentTitle: string) => {
    setContextMenu(null);
    setEditingId(id);
    setEditTitle(currentTitle);
  };

  const submitRename = async (id: string) => {
    const trimmed = editTitle.trim();
    const finalTitle = trimmed || 'New Chat';
    setEditingId(null);
    setSessions(prev => prev.map(s => s.id === id ? { ...s, title: finalTitle } : s));
    await fetch('/api/sessions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, title: finalTitle }),
    });
    onRenameSession?.(id, finalTitle);
  };

  const cancelRename = () => { setEditingId(null); setEditTitle(''); };

  const openContextMenu = (id: string, x: number, y: number) => {
    setContextMenu({ id, x, y });
  };

  const handleContextPinChat = async (id: string, currentlyPinned: boolean) => {
    setContextMenu(null);
    setSessions(prev => prev.map(s => s.id === id ? { ...s, pinned_chat: currentlyPinned ? 0 : 1 } : s));
    await fetch('/api/sessions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, pinChat: !currentlyPinned }),
    });
    window.dispatchEvent(new Event('sessions-changed'));
  };

  const handlePinChat = async (e: React.MouseEvent, id: string, currentlyPinned: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    await handleContextPinChat(id, currentlyPinned);
  };

  const handlePinPrompt = async (id: string, currentlyPinned: boolean) => {
    setContextMenu(null);
    await fetch('/api/sessions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, pinPrompt: !currentlyPinned }),
    });
    const res = await fetch('/api/sessions');
    if (res.ok) setSessions((await res.json()).sessions);
    window.dispatchEvent(new Event('sessions-changed'));
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu(null);
    const ok = await showConfirm('This conversation and all its messages will be permanently deleted.', {
      title: 'Delete conversation?',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    setDeletingId(id);
    await fetch(`/api/sessions?id=${id}`, { method: 'DELETE' });
    setSessions(prev => prev.filter(s => s.id !== id));
    setDeletingId(null);
    if (currentSessionId === id) onNewSession();
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  const renderSessionItem = (session: Session) => (
    <div
      key={session.id}
      onClick={() => { if (!editingId) { setOptimisticSessionId(session.id); onSelectSession(session.id, session.title, session.agent_name); onCloseMobile?.(); } }}
      onContextMenu={(e) => {
        e.preventDefault();
        openContextMenu(session.id, e.clientX, e.clientY);
      }}
      className={`
        w-full flex items-center gap-3 px-3 py-1 rounded-lg text-left border
        transition-colors duration-150 group cursor-pointer
        ${optimisticSessionId === session.id
          ? 'bg-blue-500/15 text-blue-600 dark:text-blue-300 border-blue-500/30'
          : 'border-transparent text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100'
        }
      `}
    >
      {session.pinned_chat
        ? <Pin size={15} className="flex-shrink-0" />
        : <MessageSquare size={15} className="flex-shrink-0" />
      }
      {editingId === session.id ? (
        <input
          ref={editInputRef}
          value={editTitle}
          onChange={e => setEditTitle(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); submitRename(session.id); }
            if (e.key === 'Escape') cancelRename();
          }}
          onBlur={() => submitRename(session.id)}
          onClick={e => e.stopPropagation()}
          className="flex-1 min-w-0 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm rounded px-1.5 py-0.5 outline-none border border-blue-500 focus:ring-1 focus:ring-blue-400"
        />
      ) : (
        <span className="flex-1 text-sm font-medium truncate">{session.title}</span>
      )}
      {editingId !== session.id && (
        <>
        <button
          onClick={e => { e.preventDefault(); e.stopPropagation(); const pos = getActionMenuPosition(e.currentTarget.getBoundingClientRect()); openContextMenu(session.id, pos.x, pos.y); }}
          aria-label="Open chat actions"
          className="md:hidden h-8 w-8 flex items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100 flex-shrink-0"
        >
          <MoreHorizontal size={18} />
        </button>
        <span className="hidden md:group-hover:flex items-center gap-0.5 flex-shrink-0">
          <button
            onClick={e => handlePinChat(e, session.id, !!session.pinned_chat)}
            title={session.pinned_chat ? 'Unpin chat' : 'Pin chat'}
            className="p-0.5 rounded hover:bg-gray-300 dark:hover:bg-gray-600 hover:text-gray-800 dark:hover:text-gray-200 transition-colors duration-150"
          >
            {session.pinned_chat ? <PinOff size={15} /> : <Pin size={15} />}
          </button>
          <button
            onClick={e => { e.stopPropagation(); handlePinPrompt(session.id, !!session.pinned_prompt); }}
            title={session.pinned_prompt ? 'Unpin prompt' : 'Pin prompt'}
            className="p-0.5 rounded hover:bg-gray-300 dark:hover:bg-gray-600 hover:text-amber-600 dark:hover:text-amber-400 transition-colors duration-150"
          >
            {session.pinned_prompt ? <BookmarkX size={15} /> : <Bookmark size={15} />}
          </button>
          <button
            onClick={e => { e.stopPropagation(); startRename(session.id, session.title); }}
            title="Rename"
            className="p-0.5 rounded hover:bg-gray-300 dark:hover:bg-gray-600 hover:text-gray-800 dark:hover:text-gray-200 transition-colors duration-150"
          >
            <Pencil size={15} />
          </button>
          <button
            onClick={e => handleDelete(e, session.id)}
            title="Delete"
            className="p-0.5 rounded hover:bg-red-500/20 hover:text-red-400 transition-colors duration-150"
            disabled={deletingId === session.id}
          >
            <Trash2 size={15} />
          </button>
        </span>
        </>
      )}
    </div>
  );

  const renderNavLink = ({ href, icon: Icon, label }: { href: string; icon: React.ElementType; label: string }) => {
    const active = pathname.startsWith(href);
    return (
      <Link
        key={href}
        href={href}
        // Close the mobile drawer on navigation so the user sees the
        // page they just opened. Recent-chat / New-Chat already do this
        // — this keeps every sidebar entry behaving consistently on mobile.
        onClick={() => onCloseMobile?.()}
        className={`
          flex items-center gap-3 px-3 py-2 rounded-lg mb-0.5
          text-sm font-medium transition-all duration-150
          ${active
            ? 'bg-blue-500 text-white'
            : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'
          }
        `}
      >
        <Icon size={15} className="flex-shrink-0" />
        <span className="truncate">{label}</span>
        {active && <ChevronRight size={13} className="ml-auto opacity-60" />}
      </Link>
    );
  };

  const workspaceItems = [
    ...(showLearnNav ? [{ href: '/learn', icon: BookOpen, label: 'Learn' }] : []),
    { href: '/agents',    icon: Brain,    label: 'Prompts & Memory' },
    { href: '/skills',    icon: Zap,      label: 'Skills & MCP'     },
    { href: '/tools',     icon: Wrench,   label: 'Tool Playground'  },
    { href: '/knowledge', icon: BookOpen, label: 'RAG'              },
    { href: '/editor',    icon: Code2,    label: 'Agent Files'      },
  ];

  const systemItems = [
    { href: '/approvals',  icon: ShieldCheck, label: 'Approvals'  },
    { href: '/statistics', icon: BarChart2,   label: 'Statistics' },
    { href: '/settings',   icon: Settings,    label: 'Settings'   },
  ];

  const isNew = !sessions.some(s => s.id === currentSessionId);

  return (
    <aside className="w-full bg-gray-100 dark:bg-gray-900 flex flex-col h-full overflow-hidden border-r border-gray-200 dark:border-gray-800">
      {ConfirmModal}

      {/* Chat context menu: anchored to the clicked item and clamped inside the viewport */}
      {contextMenu && (() => {
        const s = sessions.find(s => s.id === contextMenu.id);
        if (!s) return null;
        return (
          <>
            <div className="fixed inset-0 z-40 bg-black/10 md:bg-transparent" onClick={() => setContextMenu(null)} />
            <div
              className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl py-1 min-w-[220px]"
              style={{ left: contextMenu.x, top: contextMenu.y }}
              onClick={e => e.stopPropagation()}
            >
              <button
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
                onClick={() => handleContextPinChat(s.id, !!s.pinned_chat)}
              >
                {s.pinned_chat ? <PinOff size={15} /> : <Pin size={15} />}
                {s.pinned_chat ? 'Unpin Chat' : 'Pin Chat'}
              </button>
              <button
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
                onClick={() => handlePinPrompt(s.id, !!s.pinned_prompt)}
              >
                {s.pinned_prompt ? <BookmarkX size={15} /> : <Bookmark size={15} />}
                {s.pinned_prompt ? 'Unpin Prompt' : 'Pin Prompt'}
              </button>
              <button
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
                onClick={() => startRename(s.id, s.title)}
              >
                <Pencil size={15} />
                Rename
              </button>
              <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
              <button
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 text-left"
                onClick={(e) => handleDelete(e, s.id)}
              >
                <Trash2 size={15} />
                Delete
              </button>
            </div>
          </>
        );
      })()}

      {/* Brand header */}
      <div className="px-4 pt-5 pb-4 border-b border-gray-300 dark:border-gray-600 flex-shrink-0">
        <div className="w-full flex items-center gap-1.5 text-left rounded-lg -mx-1 px-1">
          <button onClick={() => { onNewSession(); onCloseMobile?.(); }} className="flex-1 flex items-center gap-2 cursor-pointer rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 py-1">
            <div className="h-10 w-10 rounded-lg min-w-10 flex items-center justify-center flex-shrink-0">
              <BrandLogo className="h-10 w-10 mb-0.25" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-gray-900 dark:text-white font-800 text-base tracking-tight leading-none text-left">AgentPrimer</p>
              <p className="text-gray-600 dark:text-gray-400 text-sm mt-0.5 truncate text-left">AI Agent Platform</p>
            </div>
          </button>
          {onCloseMobile && (
            <button
              onClick={onCloseMobile}
              aria-label="Close navigation"
              className="h-8 w-8 rounded-lg text-gray-600 hover:bg-gray-200 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-300 flex items-center justify-center flex-shrink-0 transition-colors"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* New Chat – fixed, never scrolls */}
      <div className="px-3 pt-3 pb-1 flex-shrink-0">
        <button
          onClick={() => { onNewSession(); onCloseMobile?.(); }}
          className={`mb-1 w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-150 text-sm font-medium group ${
            isNew
              ? 'bg-blue-500 text-white'
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          <Plus size={15} className={`flex-shrink-0 transition-transform duration-200 ${!isNew ? 'group-hover:rotate-90' : ''}`} />
          <span>New Chat</span>
        </button>
      </div>

      {/* Session list – its own scrollable area */}
      <div className="flex-1 overflow-y-auto min-h-0 px-3 pb-2 space-y-0.5">
        {sessions.length === 0 ? (
          <p className="text-gray-600 dark:text-gray-400 text-sm px-3 py-3 text-center">No conversations yet</p>
        ) : (
          <>
            {sessions.some(s => s.pinned_chat) && (
              <>
                <button
                  onClick={() => { setPinnedChatsOpen(o => { const next = !o; saveUiSetting('sidebar_pinned_chats_open', next); return next; }); }}
                  className="w-full flex items-center gap-1.5 px-2 pt-2 pb-0.5 text-sm font-600 text-gray-600 dark:text-gray-300 tracking-wider hover:text-gray-900 dark:hover:text-white transition-colors"
                >
                  <ChevronDown size={13} className={`flex-shrink-0 transition-transform duration-200 ${pinnedChatsOpen ? 'rotate-0' : '-rotate-90'}`} />
                  Pinned Chats
                </button>
                <div className={`grid transition-[grid-template-rows] duration-200 ease-in-out ${pinnedChatsOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                  <div className="overflow-hidden space-y-0.5">
                    {sessions.filter(s => s.pinned_chat).map(renderSessionItem)}
                  </div>
                </div>
                <div className="my-1.5 border-t border-gray-300 dark:border-gray-800" />
              </>
            )}
            {sessions.some(s => !s.pinned_chat) && (
              <>
                <button
                  onClick={() => { setRecentChatsOpen(o => { const next = !o; saveUiSetting('sidebar_recent_chats_open', next); return next; }); }}
                  className="w-full flex items-center gap-1.5 px-2 pb-0.5 text-sm font-600 text-gray-600 dark:text-gray-300 tracking-wider hover:text-gray-900 dark:hover:text-white transition-colors"
                >
                  <ChevronDown size={13} className={`flex-shrink-0 transition-transform duration-200 ${recentChatsOpen ? 'rotate-0' : '-rotate-90'}`} />
                  Recent Chats
                </button>
                <div className={`grid transition-[grid-template-rows] duration-200 ease-in-out ${recentChatsOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                  <div className="overflow-hidden space-y-0.5">
                    {sessions.filter(s => !s.pinned_chat).map(renderSessionItem)}
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Divider – fixed */}
      <div className="mx-3 border-t border-gray-300 dark:border-gray-700 flex-shrink-0" />

      {/* Workspace group */}
      <nav className="px-3 py-2 flex-shrink-0">
          <button
            onClick={() => { setWorkspaceOpen(o => { const next = !o; saveUiSetting('sidebar_workspace_open', next); return next; }); }}
            className="w-full flex items-center gap-1.5 px-2 py-1.5 mb-0.5 rounded text-sm font-600 text-gray-600 dark:text-gray-300 tracking-wider hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <ChevronDown size={14} className={`flex-shrink-0 transition-transform duration-200 ${workspaceOpen ? 'rotate-0' : '-rotate-90'}`} />
            Workspace
          </button>
          <div className={`grid transition-[grid-template-rows] duration-200 ease-in-out ${workspaceOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
            <div className="overflow-hidden">
              {workspaceItems.map(renderNavLink)}
            </div>
          </div>
        </nav>

      {/* System group */}
      <nav className="px-3 pb-2 flex-shrink-0">
          <button
            onClick={() => { setSystemOpen(o => { const next = !o; saveUiSetting('sidebar_system_open', next); return next; }); }}
            className="w-full flex items-center gap-1.5 px-2 py-1.5 mb-0.5 rounded text-sm font-600 text-gray-600 dark:text-gray-300 tracking-wider hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <ChevronDown size={14} className={`flex-shrink-0 transition-transform duration-200 ${systemOpen ? 'rotate-0' : '-rotate-90'}`} />
            System
          </button>
          <div className={`grid transition-[grid-template-rows] duration-200 ease-in-out ${systemOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
            <div className="overflow-hidden">
              {systemItems.map(renderNavLink)}
            </div>
          </div>
        </nav>

      {/* Bottom – theme toggle + logout */}
      <div className="px-3 py-3 border-t border-gray-300 dark:border-gray-700 flex-shrink-0 space-y-0.5">
        {/* <ThemeToggle /> */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-600 hover:bg-gray-200 dark:hover:bg-gray-800 hover:text-red-500 dark:hover:text-red-400 transition-all duration-150 text-sm font-medium"
        >
          <LogOut size={16} />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
