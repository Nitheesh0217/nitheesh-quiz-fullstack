'use client';

import React, { useState } from 'react';

export function ThemeToggle() {
  // Lazy-initialized from the class the anti-FOUC script (src/app/layout.tsx)
  // already set on <html> before this component mounts, so the button never
  // shows the wrong label for a frame like a useEffect-based check would.
  const [isDark, setIsDark] = useState(
    () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  );

  const toggleDarkMode = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    if (typeof window !== 'undefined') {
      if (nextDark) {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
        localStorage.setItem('theme', 'dark');
      } else {
        document.documentElement.classList.add('light');
        document.documentElement.classList.remove('dark');
        localStorage.setItem('theme', 'light');
      }
    }
  };

  return (
    <button
      onClick={toggleDarkMode}
      type="button"
      className="p-2 rounded-lg border border-neutral-350 dark:border-dark-border text-neutral-900 dark:text-neutral-50 hover:bg-neutral-50 dark:hover:bg-slate-800 transition-all active:scale-95 text-xs font-semibold flex items-center gap-1.5 shadow-sm"
      aria-label="Toggle theme mode"
    >
      {isDark ? '☀️ Light' : '🌙 Dark'}
    </button>
  );
}
export default ThemeToggle;
