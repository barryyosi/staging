import { useState, useEffect, useCallback, useRef } from 'react';

// State that belongs to one project (or document) and is mirrored to the
// server's per-project review file. A key change swaps the value wholesale,
// and nothing from the previous key is shown or saved under the new one in
// between: `load(key)` resolves to the stored value (never rejects), `save`
// writes it; both must be stable callbacks. Returns `null` for the value
// until the current key's value is in.
export function useProjectStore(projectKey, load, save) {
  const [store, setStore] = useState({ key: null, value: null });
  // Set by setValue; the save effect writes only what the user changed, not
  // what was just loaded
  const dirtyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    dirtyRef.current = false;
    setStore({ key: projectKey, value: null });
    load(projectKey).then((value) => {
      if (!cancelled) setStore({ key: projectKey, value });
    });
    return () => {
      cancelled = true;
    };
  }, [projectKey, load]);

  useEffect(() => {
    if (store.value === null || !dirtyRef.current) return;
    dirtyRef.current = false;
    save(store.key, store.value).catch((err) => {
      console.warn(`Failed to save review state: ${err.message}`);
    });
  }, [store, save]);

  const setValue = useCallback((updater) => {
    setStore((prev) => {
      // Nothing to change until the current key's value is in
      if (prev.value === null) return prev;
      dirtyRef.current = true;
      return {
        ...prev,
        value: typeof updater === 'function' ? updater(prev.value) : updater,
      };
    });
  }, []);

  return [store.key === projectKey ? store.value : null, setValue];
}
