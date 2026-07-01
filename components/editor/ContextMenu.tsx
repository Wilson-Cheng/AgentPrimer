'use client';

/**
 * components/editor/ContextMenu.tsx
 * ---------------------------------------------------------------------------
 * Lightweight floating right-click menu used by both the file browser
 * (file/folder actions) and the tab bar (close / close-others / etc.).
 *
 * Closes on Escape or any outside click. Auto-clamps its position so it
 * doesn't render off-screen on the right or bottom edges of the viewport.
 */

import { useEffect, useRef } from 'react';
import type { ContextMenuState } from './types';

interface Props extends ContextMenuState {
  onClose: () => void;
}

export default function ContextMenu({ x, y, items, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // Keep the menu inside the viewport.
  const safeX = typeof window !== 'undefined' ? Math.min(x, window.innerWidth - 192) : x;
  const safeY =
    typeof window !== 'undefined' ? Math.min(y, window.innerHeight - items.length * 32 - 16) : y;

  return (
    <div
      ref={menuRef}
      style={{ position: 'fixed', left: safeX, top: safeY, zIndex: 9999 }}
      className="min-w-[172px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl py-1 text-sm"
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) => (
        <button
          key={i}
          onClick={() => {
            item.onClick();
            onClose();
          }}
          className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left transition-colors ${
            item.danger
              ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30'
              : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
        >
          {item.icon && (
            <span className="flex-shrink-0 opacity-70 flex items-center">{item.icon}</span>
          )}
          {item.label}
        </button>
      ))}
    </div>
  );
}
