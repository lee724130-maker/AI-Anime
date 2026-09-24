import { useState, useEffect, useCallback } from 'react';

// Theme key = admin_theme (bundle `yB`)
const THEME_KEY = 'admin_theme';

// bB: read persisted theme, default 'dark'
function readTheme(): 'light' | 'dark' {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch {
    /* ignore */
  }
  return 'dark';
}

// xB: apply theme attribute
function applyTheme(theme: string) {
  document.documentElement.setAttribute('data-theme', theme);
}

// SB
export function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>(readTheme);

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const attr = document.documentElement.getAttribute('data-theme');
      if (attr && attr !== theme) setTheme(attr as 'light' | 'dark');
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }, []);

  return { theme, isDark: theme === 'dark', toggleTheme };
}
