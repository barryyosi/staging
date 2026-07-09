import { useState, useEffect, lazy, Suspense } from 'react';
import App from './App';

const PreviewApp = lazy(() => import('./PreviewApp'));

// Mode gate: standalone file preview (`staging file.md`) vs the normal
// staged-changes review UI. The server reports preview mode via /api/config.
export default function Root() {
  const [boot, setBoot] = useState(null);

  useEffect(() => {
    fetch('/api/config')
      .then((res) => res.json())
      .then((cfg) => setBoot({ preview: cfg.preview || null, config: cfg }))
      .catch(() => setBoot({ preview: null, config: null }));
  }, []);

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
