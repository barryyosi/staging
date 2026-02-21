import { useState, useCallback, useEffect } from 'react';

const params = new URLSearchParams(window.location.search);
const isVSCode = params.get('vscode') === '1';

function applyTheme(value) {
  document.documentElement.setAttribute('data-theme', value);
}

export function useTheme() {
  const [theme, setTheme] = useState(() => {
    return document.documentElement.getAttribute('data-theme') || 'light';
  });

  // Listen for VS Code theme changes via postMessage
  useEffect(() => {
    if (!isVSCode) return;

    const handler = (e) => {
      if (e.data && e.data.type === 'setTheme') {
        const next = e.data.theme === 'dark' ? 'dark' : 'light';
        applyTheme(next);
        setTheme(next);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const toggleTheme = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    if (!isVSCode) {
      localStorage.setItem('staging-theme', next);
    }
    setTheme(next);
  }, [theme]);

  return { theme, toggleTheme };
}
