'use client';

import { useState, useEffect } from 'react';

export const SIDEBAR_WIDTH_KEY = 'agentprimer_sidebar_width';
export const SIDEBAR_MIN = 180;
export const SIDEBAR_MAX = 480;
export const SIDEBAR_DEFAULT = 256;

/**
 * Reads the persisted sidebar width.
 * Checks localStorage first (instant, no round-trip), then falls back to
 * the server-side data/.ui-settings.json.  The chat page is responsible for
 * writing the value; this hook only reads it.
 */
export function useSidebarWidth(): number {
  const [width, setWidth] = useState<number>(SIDEBAR_DEFAULT);

  useEffect(() => {
    // localStorage gives the correct value immediately with no round-trip
    const stored = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    if (stored) {
      const n = parseInt(stored, 10);
      if (!isNaN(n) && n >= SIDEBAR_MIN && n <= SIDEBAR_MAX) {
        setWidth(n);
        return;
      }
    }

    // Fall back to the server-persisted preference (first load ever)
    fetch('/api/data-files?file=.ui-settings.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.content) return;
        const prefs = JSON.parse(data.content || '{}');
        if (typeof prefs.sidebarWidthPct === 'number') {
          const w = Math.max(
            SIDEBAR_MIN,
            Math.min(SIDEBAR_MAX, Math.round((prefs.sidebarWidthPct / 100) * window.innerWidth)),
          );
          setWidth(w);
          localStorage.setItem(SIDEBAR_WIDTH_KEY, String(w)); // warm the cache
        }
      })
      .catch(() => {});
  }, []);

  return width;
}
