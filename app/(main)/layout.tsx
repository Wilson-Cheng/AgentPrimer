'use client';

/**
 * app/(main)/layout.tsx
 * ---------------------------------------------------------------------------
 * Persistent shell that wraps all "app" pages (chat, agents, skills, etc.).
 * By living in a layout, ResizableSidebar is never unmounted during page
 * transitions — eliminating the black flash caused by the sidebar tearing
 * down and rebuilding on every navigation.
 *
 * The active session highlight is tracked via two signals:
 *  1. `usePathname()` — updated by proper Next.js router.push navigations.
 *  2. `session-active` custom event — dispatched by ChatInterface when it
 *     switches sessions in-place via window.history.pushState (no remount).
 */

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import ResizableSidebar from '@/components/ResizableSidebar';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  // Derive initial session ID from the URL (SSR-safe via usePathname)
  const [activeSessionId, setActiveSessionId] = useState<string | undefined>(
    () => pathname.match(/^\/chat\/([^/]+)$/)?.[1]
  );

  // Keep in sync with Next.js navigations (router.push / browser back-forward)
  useEffect(() => {
    const match = pathname.match(/^\/chat\/([^/]+)$/);
    setActiveSessionId(match?.[1]);
  }, [pathname]);

  // Keep in sync with in-place pushState session switches from ChatInterface
  useEffect(() => {
    const handler = (e: Event) => {
      setActiveSessionId((e as CustomEvent<{ id: string | undefined }>).detail.id);
    };
    window.addEventListener('session-active', handler);
    return () => window.removeEventListener('session-active', handler);
  }, []);

  return (
    <div className="flex h-dvh bg-[#f8f8f8] dark:bg-gray-950 overflow-hidden">
      <ResizableSidebar
        currentSessionId={activeSessionId}
        onNewSession={() => {
          if (pathname.startsWith('/chat')) {
            // ChatInterface uses history.replaceState to silently rewrite the URL
            // to /chat/<id> after the first response (to avoid a remount/flash).
            // That leaves Next.js's router cache out of sync with the real URL,
            // so router.push('/chat') would often be a no-op. Reset in place
            // via a custom event and align both the URL and our local state.
            window.dispatchEvent(new Event('new-chat-requested'));
            window.history.replaceState(null, '', '/chat');
            setActiveSessionId(undefined);
          } else {
            router.push('/chat');
          }
        }}
        onSelectSession={(id) => {
          // Same desync problem as onNewSession: after silent replaceState,
          // Next.js may think pathname is /chat (or a stale /chat/<old>),
          // making router.push('/chat/<id>') a no-op when ids collide.
          // When we're already on a /chat route, switch in place via a
          // custom event that ChatInterface listens for; otherwise let
          // the router mount /chat/[id] normally.
          if (pathname.startsWith('/chat')) {
            window.dispatchEvent(new CustomEvent('load-session-requested', { detail: { id } }));
            window.history.replaceState(null, '', `/chat/${id}`);
            setActiveSessionId(id);
          } else {
            router.push(`/chat/${id}`);
          }
        }}
        onRenameSession={(id, title) => {
          // Forward rename notification to any mounted page (e.g. ChatInterface)
          window.dispatchEvent(new CustomEvent('session-renamed', { detail: { id, title } }));
        }}
      />
      <div className="flex flex-1 overflow-hidden min-w-0">
        {children}
      </div>
    </div>
  );
}
