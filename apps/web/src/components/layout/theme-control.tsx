'use client';

import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

export const THEME_KEY = 'premium-retail-theme';
type Theme = 'light' | 'dark';

export function ThemeControl() {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  }, []);

  function chooseTheme(next: Theme) {
    document.documentElement.dataset.theme = next;
    setTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch { /* The current page still updates. */ }
  }

  return (
    <div className="workspace-theme" role="group" aria-label="Color theme">
      <button type="button" aria-label="Light mode" title="Light mode" aria-pressed={theme === 'light'} onClick={() => chooseTheme('light')}><Sun size={19} aria-hidden="true" /></button>
      <button type="button" aria-label="Dark mode" title="Dark mode" aria-pressed={theme === 'dark'} onClick={() => chooseTheme('dark')}><Moon size={19} aria-hidden="true" /></button>
    </div>
  );
}
