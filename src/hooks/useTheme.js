import { useState, useCallback } from 'react';

export function useTheme() {
  const [theme, setTheme] = useState(() => {
    return document.documentElement.getAttribute('data-theme') || 'light';
  });

  const toggleTheme = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('staging-theme', next);
    setTheme(next);
  }, [theme]);

  return { theme, toggleTheme };
}
