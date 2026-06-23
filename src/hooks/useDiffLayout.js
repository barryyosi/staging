import { useState, useCallback } from 'react';

const STORAGE_KEY = 'staging-diff-layout';

function getInitialDiffLayout() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'split' || stored === 'unified') return stored;
  } catch {
    // localStorage unavailable (e.g. private mode) — fall back to default
  }
  return 'unified';
}

export function useDiffLayout() {
  const [diffLayout, setDiffLayout] = useState(getInitialDiffLayout);

  const toggleDiffLayout = useCallback(() => {
    setDiffLayout((prev) => {
      const next = prev === 'split' ? 'unified' : 'split';
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // ignore persistence failures
      }
      return next;
    });
  }, []);

  return { diffLayout, toggleDiffLayout };
}
