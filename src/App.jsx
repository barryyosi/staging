import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { useTheme } from './hooks/useTheme';
import { useComments } from './hooks/useComments';
import Header from './components/Header';
import FileList from './components/FileList';
import DiffViewer from './components/DiffViewer';
import CommentPanel from './components/CommentPanel';
import Toast from './components/Toast';
import { formatComments } from './utils/format';

const CommitModal = lazy(() => import('./components/CommitModal'));

const SIDEBAR_MIN_WIDTH = 180;
const SIDEBAR_MAX_WIDTH = 420;
const SIDEBAR_DEFAULT_WIDTH = 240;
const SIDEBAR_STORAGE_KEY = 'staging-sidebar-width';

function clampSidebarWidth(width) {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width));
}

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const { commentsByFile, allComments, addComment, updateComment, deleteComment } = useComments();

  const [files, setFiles] = useState(null);
  const [gitRoot, setGitRoot] = useState('');
  const [config, setConfig] = useState(null);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [showCommitModal, setShowCommitModal] = useState(false);
  const [committed, setCommitted] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    if (typeof window === 'undefined') return SIDEBAR_DEFAULT_WIDTH;
    const raw = Number.parseInt(localStorage.getItem(SIDEBAR_STORAGE_KEY) || '', 10);
    return Number.isFinite(raw) ? clampSidebarWidth(raw) : SIDEBAR_DEFAULT_WIDTH;
  });
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);

  // Active comment form state
  const [activeForm, setActiveForm] = useState(null); // { file, line, lineType }
  const [editingComment, setEditingComment] = useState(null); // comment object

  // Refs for sidebar resize optimization
  const layoutRef = useRef(null);
  const sidebarWidthRef = useRef(sidebarWidth);

  // Ref for toast timer cleanup
  const toastTimerRef = useRef(null);

  useEffect(() => {
    async function load() {
      try {
        const [diffRes, configRes] = await Promise.all([
          fetch('/api/diff'),
          fetch('/api/config'),
        ]);
        if (!diffRes.ok) throw new Error('Failed to load diff data');
        if (!configRes.ok) throw new Error('Failed to load config');

        const diffData = await diffRes.json();
        const configData = await configRes.json();

        if (diffData.error) {
          setError(diffData.error);
          return;
        }

        setFiles(diffData.files);
        setGitRoot(diffData.gitRoot);
        setConfig(configData);
      } catch (err) {
        setError(err.message);
      }
    }
    load();
  }, []);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => () => {
    document.body.classList.remove('is-resizing-sidebar');
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  const showToast = useCallback((message, type = 'info') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, type });
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 3000);
  }, []);

  const handleAddComment = useCallback((file, line, lineType) => {
    setEditingComment(null);
    setActiveForm({ file, line, lineType });
  }, []);

  const handleSubmitComment = useCallback((content) => {
    if (!content.trim()) return;
    if (editingComment) {
      updateComment(editingComment.id, content);
      setEditingComment(null);
    } else if (activeForm) {
      addComment(activeForm.file, activeForm.line, activeForm.lineType, content);
    }
    setActiveForm(null);
  }, [activeForm, editingComment, addComment, updateComment]);

  const handleCancelForm = useCallback(() => {
    setActiveForm(null);
    setEditingComment(null);
  }, []);

  const handleEditComment = useCallback((comment) => {
    setActiveForm({ file: comment.file, line: comment.line, lineType: comment.lineType });
    setEditingComment(comment);
  }, []);

  const handleDeleteComment = useCallback((id) => {
    deleteComment(id);
  }, [deleteComment]);

  const handleSendComments = useCallback(async () => {
    if (allComments.length === 0) return;
    const formatted = formatComments(allComments, gitRoot);

    try {
      await navigator.clipboard.writeText(formatted);
    } catch {
      // Clipboard might not be available
    }

    try {
      const res = await fetch('/api/send-comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formatted }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Comments saved to ${config.reviewFileName} and copied to clipboard`, 'success');
      } else {
        showToast(`Failed to send comments: ${data.error}`, 'error');
      }
    } catch (err) {
      showToast(`Failed to send comments: ${err.message}`, 'error');
    }
  }, [allComments, gitRoot, config, showToast]);

  const handleCommit = useCallback(() => {
    if (allComments.length > 0) {
      if (!confirm(`You have ${allComments.length} unresolved comment${allComments.length === 1 ? '' : 's'}. Commit anyway?`)) {
        return;
      }
    }
    setShowCommitModal(true);
  }, [allComments]);

  const handleDoCommit = useCallback(async (message) => {
    if (!message.trim()) {
      showToast('Commit message cannot be empty', 'error');
      return;
    }
    try {
      const res = await fetch('/api/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message.trim() }),
      });
      const data = await res.json();
      setShowCommitModal(false);
      if (data.success) {
        setCommitted(true);
        showToast('Changes committed!', 'success');
      } else {
        showToast(`Commit failed: ${data.error}`, 'error');
      }
    } catch (err) {
      setShowCommitModal(false);
      showToast(`Commit failed: ${err.message}`, 'error');
    }
  }, [showToast]);

  const handleCloseCommitModal = useCallback(() => setShowCommitModal(false), []);

  // Sidebar resize: write CSS variable directly during drag, commit to state on release
  const handleSidebarResizeStart = useCallback((event) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = sidebarWidthRef.current;

    const handlePointerMove = (moveEvent) => {
      const nextWidth = clampSidebarWidth(startWidth + moveEvent.clientX - startX);
      sidebarWidthRef.current = nextWidth;
      if (layoutRef.current) {
        layoutRef.current.style.setProperty('--sidebar-width', `${nextWidth}px`);
      }
    };

    const stopResize = () => {
      setIsResizingSidebar(false);
      document.body.classList.remove('is-resizing-sidebar');
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopResize);
      window.removeEventListener('pointercancel', stopResize);
      setSidebarWidth(sidebarWidthRef.current);
    };

    setIsResizingSidebar(true);
    document.body.classList.add('is-resizing-sidebar');
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopResize);
    window.addEventListener('pointercancel', stopResize);
  }, []);

  const handleSidebarResizeKeyDown = useCallback((event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const delta = event.shiftKey ? 32 : 16;
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    setSidebarWidth((current) => {
      const next = clampSidebarWidth(current + direction * delta);
      sidebarWidthRef.current = next;
      return next;
    });
  }, []);

  const hasComments = allComments.length > 0;

  return (
    <>
      <Header
        theme={theme}
        onToggleTheme={toggleTheme}
        files={files}
        hasComments={hasComments}
        onSendComments={handleSendComments}
        onCommit={handleCommit}
        committed={committed}
      />

      <div
        id="layout"
        ref={layoutRef}
        className={hasComments ? 'has-comments' : ''}
        style={{ '--sidebar-width': `${sidebarWidth}px` }}
      >
        <FileList files={files} />
        <div
          className={`sidebar-resizer${isResizingSidebar ? ' active' : ''}`}
          role="separator"
          aria-label="Resize file sidebar"
          aria-orientation="vertical"
          aria-valuemin={SIDEBAR_MIN_WIDTH}
          aria-valuemax={SIDEBAR_MAX_WIDTH}
          aria-valuenow={sidebarWidth}
          tabIndex={0}
          onPointerDown={handleSidebarResizeStart}
          onKeyDown={handleSidebarResizeKeyDown}
        />

        <main id="diff-container">
          {error ? (
            <div id="loading">Error: {error}</div>
          ) : !files ? (
            <div id="loading">Loading staged changes...</div>
          ) : files.length === 0 ? (
            <div id="loading">No staged changes found.</div>
          ) : (
            <>
              {committed && (
                <div className="commit-banner success">
                  Committed successfully!
                </div>
              )}
              {files.map(file => {
                const filePath = file.to || file.from;
                return (
                  <DiffViewer
                    key={filePath}
                    file={file}
                    fileComments={commentsByFile[filePath]}
                    activeForm={activeForm}
                    editingComment={editingComment}
                    onAddComment={handleAddComment}
                    onSubmitComment={handleSubmitComment}
                    onCancelForm={handleCancelForm}
                    onEditComment={handleEditComment}
                    onDeleteComment={handleDeleteComment}
                  />
                );
              })}
            </>
          )}
        </main>

        <CommentPanel
          commentsByFile={commentsByFile}
          commentCount={allComments.length}
          visible={hasComments}
        />
      </div>

      <Toast toast={toast} />

      {showCommitModal && (
        <Suspense fallback={null}>
          <CommitModal
            onCommit={handleDoCommit}
            onClose={handleCloseCommitModal}
          />
        </Suspense>
      )}
    </>
  );
}
