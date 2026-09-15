import { useState, useEffect, useCallback } from 'react';

// State that belongs to one project (or document) and is mirrored to
// storage. A key change swaps the value wholesale, and nothing from the
// previous key is shown or saved under the new one in between: `load` and
// `save` must be stable callbacks. Returns `null` for the value until the
// current key's value is in.
export function useProjectStore(projectKey, load, save) {
  const [store, setStore] = useState(() => ({
    key: projectKey,
    value: load(projectKey),
  }));
  const loaded = store.key === projectKey;

  useEffect(() => {
    if (loaded) return;
    setStore({ key: projectKey, value: load(projectKey) });
  }, [loaded, projectKey, load]);

  useEffect(() => {
    if (!loaded) return;
    save(projectKey, store.value);
  }, [loaded, projectKey, store.value, save]);

  const setValue = useCallback((updater) => {
    setStore((prev) => ({
      ...prev,
      value: typeof updater === 'function' ? updater(prev.value) : updater,
    }));
  }, []);

  return [loaded ? store.value : null, setValue];
}
