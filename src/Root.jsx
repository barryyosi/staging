import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import App from './App';

const PreviewApp = lazy(() => import('./PreviewApp'));

const BOOT_RETRIES = 3;
const BOOT_RETRY_DELAY_MS = 500;

// Mode gate: standalone file preview (`staging file.md`) vs the normal
// staged-changes review UI. The server reports preview mode via /api/config.
export default function Root() {
  const [boot, setBoot] = useState(null);
  const [failed, setFailed] = useState(false);

  const fetchBoot = useCallback(async () => {
    setFailed(false);
    for (let attempt = 0; attempt <= BOOT_RETRIES; attempt++) {
      try {
        const res = await fetch('/api/config');
        const cfg = await res.json();
        setBoot({ preview: cfg.preview || null, config: cfg });
        return;
      } catch {
        if (attempt < BOOT_RETRIES) {
          await new Promise((resolve) =>
            setTimeout(resolve, BOOT_RETRY_DELAY_MS * (attempt + 1)),
          );
        }
      }
    }
    // Don't guess a mode — mounting the git-review App against a
    // preview-mode server produces a wall of 400s
    setFailed(true);
  }, []);

  useEffect(() => {
    fetchBoot();
  }, [fetchBoot]);

  if (failed) {
    return (
      <div className="boot-error">
        <p>Could not reach the staging server.</p>
        <button className="btn btn-primary" onClick={fetchBoot} type="button">
          Retry
        </button>
      </div>
    );
  }

  if (!boot) return null;

  if (boot.preview) {
    return (
      <Suspense fallback={null}>
        <PreviewApp preview={boot.preview} config={boot.config} />
      </Suspense>
    );
  }

  return <App />;
}
