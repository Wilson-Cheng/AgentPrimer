'use client';

import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

export default function ThemeToggle() {
  // Start with `false` (same value the server renders) to avoid a hydration
  // mismatch. After mount, we read the real dark-mode state from the DOM.
  // The setState is deferred via setTimeout so React 19 treats it as async
  // (not a synchronous setState-in-effect that triggers the cascading-renders
  // warning).
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const t = setTimeout(() =>
      setDark(document.documentElement.classList.contains('dark'))
    );
    return () => clearTimeout(t);
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
  };

  return (
    <button
      onClick={toggle}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-800 hover:text-yellow-600 dark:hover:text-yellow-400 transition-all duration-150 text-sm font-medium"
    >
      {dark ? <Sun size={16} /> : <Moon size={16} />}
      {dark ? 'Light mode' : 'Dark mode'}
    </button>
  );
}
