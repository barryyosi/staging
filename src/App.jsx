import { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from 'react';
import { useTheme } from './hooks/useTheme';
import { useComments } from './hooks/useComments';
import Header from './components/Header';
import FileList from './components/FileList';
import DiffViewer from './components/DiffViewer';
import CommentPanel from './components/CommentPanel';
import Toast from './components/Toast';
import { formatComments } from './utils/format';
import { slugify } from './utils/escape';

const CommitModal = lazy(() => import('./components/CommitModal'));

const SIDEBAR_MIN_WIDTH = 180;
const SIDEBAR_MAX_WIDTH = 420;
const SIDEBAR_DEFAULT_WIDTH = 240;
const SIDEBAR_STORAGE_KEY = 'staging-sidebar-width';
const DIFF_PAGE_SIZE = 40;
const FILE_JUMP_LIMIT = 1;

function clampSidebarWidth(width) {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width));
}

function getFilePath(file) {
  return file.to || file.from || '';
}

function mergeFileDetails(existing, files) {
  const next = { ...existing };
  for (const file of files) {
    const filePath = getFilePath(file);
    if (!filePath) continue;
    next[filePath] = file;
  }
  return next;
}

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const { commentsByFile, allComments, addComment, updateComment, deleteComment } = useComments();

  const [fileSummaries, setFileSummaries] = useState(null);
  const [fileDetailsByPath, setFileDetailsByPath] = useState({});
  const [gitRoot, setGitRoot] = useState('');
  const [config, setConfig] = useState(null);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [showCommitModal, setShowCommitModal] = useState(false);
  const [committed, setCommitted] = useState(false);
  const [isLoadingPage, setIsLoadingPage] = useState(false);
  const [hasMoreFiles, setHasMoreFiles] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
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
  const sidebarPreviewWidthRef = useRef(sidebarWidth);
  const resizeGuideRef = useRef(null);
  const resizeGuideRafRef = useRef(0);

  // Refs for pagination and side effects
  const toastTimerRef = useRef(null);
  const loadMoreTriggerRef = useRef(null);
  const fileSummariesRef = useRef(null);
  const fileDetailsByPathRef = useRef({});
  const nextOffsetRef = useRef(0);
  const hasMoreFilesRef = useRef(false);
  const isLoadingPageRef = useRef(false);
  const fileSelectionRequestIdRef = useRef(0);

  useEffect(() => {
    fileSummariesRef.current = fileSummaries;
  }, [fileSummaries]);

  useEffect(() => {
    fileDetailsByPathRef.current = fileDetailsByPath;
  }, [fileDetailsByPath]);

  useEffect(() => {
    nextOffsetRef.current = nextOffset;
  }, [nextOffset]);

  useEffect(() => {
    hasMoreFilesRef.current = hasMoreFiles;
  }, [hasMoreFiles]);

  const showToast = useCallback((message, type = 'info') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, type });
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 3000);
  }, []);

  const requestDiffPage = useCallback(async (offset, limit = DIFF_PAGE_SIZE) => {
    const params = new URLSearchParams({
      mode: 'page',
      offset: String(offset),
      limit: String(limit),
    });
    const response = await fetch(`/api/diff?${params.toString()}`);
    if (!response.ok) throw new Error('Failed to load staged changes page');

    const data = await response.json();
    if (data.error) throw new Error(data.error);
    return data;
  }, []);

  const loadNextPage = useCallback(async () => {
    if (isLoadingPageRef.current || !hasMoreFilesRef.current) return false;

    isLoadingPageRef.current = true;
    setIsLoadingPage(true);

    try {
      const data = await requestDiffPage(nextOffsetRef.current);
      setFileDetailsByPath((prev) => mergeFileDetails(prev, data.files || []));

      const next = Number.isFinite(data.nextOffset)
        ? data.nextOffset
        : nextOffsetRef.current + (data.files ? data.files.length : 0);
      const more = Boolean(data.hasMore);

      nextOffsetRef.current = next;
      hasMoreFilesRef.current = more;
      setNextOffset(next);
      setHasMoreFiles(more);
      return true;
    } catch (err) {
      setError(err.message);
      setHasMoreFiles(false);
      hasMoreFilesRef.current = false;
      showToast(`Failed to load more files: ${err.message}`, 'error');
      return false;
    } finally {
      isLoadingPageRef.current = false;
      setIsLoadingPage(false);
    }
  }, [requestDiffPage, showToast]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [summaryRes, configRes] = await Promise.all([
          fetch('/api/diff?mode=summary'),
          fetch('/api/config'),
        ]);
        if (!summaryRes.ok) throw new Error('Failed to load staged changes summary');
        if (!configRes.ok) throw new Error('Failed to load config');

        const summaryData = await summaryRes.json();
        const configData = await configRes.json();

        if (summaryData.error) {
          throw new Error(summaryData.error);
        }

        if (cancelled) return;

        const summaries = summaryData.files || [];

        setGitRoot(summaryData.gitRoot || '');
        setConfig(configData);
        setFileSummaries(summaries);
        setFileDetailsByPath({});

        if (summaries.length === 0) {
          setNextOffset(0);
          setHasMoreFiles(false);
          nextOffsetRef.current = 0;
          hasMoreFilesRef.current = false;
          return;
        }

        isLoadingPageRef.current = true;
        setIsLoadingPage(true);

        try {
          const firstPage = await requestDiffPage(0, DIFF_PAGE_SIZE);
          if (cancelled) return;

          const firstPageFiles = firstPage.files || [];
          setFileDetailsByPath(mergeFileDetails({}, firstPageFiles));

          const initialNextOffset = Number.isFinite(firstPage.nextOffset)
            ? firstPage.nextOffset
            : firstPageFiles.length;
          const initialHasMore = Boolean(firstPage.hasMore);

          setNextOffset(initialNextOffset);
          setHasMoreFiles(initialHasMore);
          nextOffsetRef.current = initialNextOffset;
          hasMoreFilesRef.current = initialHasMore;
        } finally {
          if (!cancelled) {
            isLoadingPageRef.current = false;
            setIsLoadingPage(false);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [requestDiffPage]);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => () => {
    document.body.classList.remove('is-resizing-sidebar');
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    if (resizeGuideRafRef.current) {
      cancelAnimationFrame(resizeGuideRafRef.current);
      resizeGuideRafRef.current = 0;
    }
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
    if (!config) {
      showToast('Config is still loading', 'error');
      return;
    }

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

  const ensureFileLoaded = useCallback(async (filePath) => {
    if (fileDetailsByPathRef.current[filePath]) return true;

    const summaries = fileSummariesRef.current;
    if (!summaries) return false;

    const targetIndex = summaries.findIndex((file) => getFilePath(file) === filePath);
    if (targetIndex === -1) return false;

    try {
      const data = await requestDiffPage(targetIndex, FILE_JUMP_LIMIT);
      setFileDetailsByPath((prev) => mergeFileDetails(prev, data.files || []));
      return (data.files || []).some((file) => getFilePath(file) === filePath);
    } catch (err) {
      showToast(`Failed to load file: ${err.message}`, 'error');
      return false;
    }
  }, [requestDiffPage, showToast]);

  const handleSelectFile = useCallback(async (filePath) => {
    if (!filePath) return;
    const requestId = fileSelectionRequestIdRef.current + 1;
    fileSelectionRequestIdRef.current = requestId;

    const targetId = `file-${slugify(filePath)}`;
    const scrollToTarget = () => {
      const node = document.getElementById(targetId);
      if (!node) return false;
      node.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return true;
    };

    if (scrollToTarget()) return;

    const loaded = await ensureFileLoaded(filePath);
    if (!loaded || requestId !== fileSelectionRequestIdRef.current) return;

    requestAnimationFrame(() => {
      if (requestId !== fileSelectionRequestIdRef.current) return;
      scrollToTarget();
    });
  }, [ensureFileLoaded]);

  // Sidebar resize: write CSS variable directly during drag, commit to state on release
  const handleSidebarResizeStart = useCallback((event) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = sidebarWidthRef.current;
    sidebarPreviewWidthRef.current = startWidth;

    const drawGuide = () => {
      resizeGuideRafRef.current = 0;
      if (resizeGuideRef.current) {
        resizeGuideRef.current.style.setProperty('--guide-left', `${sidebarPreviewWidthRef.current}px`);
      }
    };

    drawGuide();

    const handlePointerMove = (moveEvent) => {
      const nextWidth = clampSidebarWidth(startWidth + moveEvent.clientX - startX);
      sidebarPreviewWidthRef.current = nextWidth;
      if (!resizeGuideRafRef.current) {
        resizeGuideRafRef.current = requestAnimationFrame(drawGuide);
      }
    };

    const stopResize = () => {
      setIsResizingSidebar(false);
      document.body.classList.remove('is-resizing-sidebar');
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopResize);
      window.removeEventListener('pointercancel', stopResize);
      if (resizeGuideRafRef.current) {
        cancelAnimationFrame(resizeGuideRafRef.current);
        resizeGuideRafRef.current = 0;
      }
      const finalWidth = sidebarPreviewWidthRef.current;
      sidebarWidthRef.current = finalWidth;
      setSidebarWidth(finalWidth);
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

  const loadedFiles = useMemo(() => {
    if (!fileSummaries) return [];

    const orderedLoadedFiles = [];
    for (const summaryFile of fileSummaries) {
      const filePath = getFilePath(summaryFile);
      if (!filePath) continue;
      const loadedFile = fileDetailsByPath[filePath];
      if (loadedFile) {
        orderedLoadedFiles.push(loadedFile);
      }
    }

    return orderedLoadedFiles;
  }, [fileSummaries, fileDetailsByPath]);

  const contiguousLoadedCount = useMemo(() => {
    if (!fileSummaries) return 0;

    let count = 0;
    for (const file of fileSummaries) {
      const filePath = getFilePath(file);
      if (!filePath || !fileDetailsByPath[filePath]) break;
      count += 1;
    }
    return count;
  }, [fileSummaries, fileDetailsByPath]);

  const canAutoLoadMore = hasMoreFiles && loadedFiles.length === contiguousLoadedCount;

  useEffect(() => {
    if (!canAutoLoadMore || !loadMoreTriggerRef.current) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        loadNextPage();
      },
      { rootMargin: '500px 0px 500px 0px' }
    );

    observer.observe(loadMoreTriggerRef.current);

    return () => {
      observer.disconnect();
    };
  }, [canAutoLoadMore, loadNextPage]);

  const hasComments = allComments.length > 0;

  return (
    <>
      <Header
        theme={theme}
        onToggleTheme={toggleTheme}
        files={fileSummaries}
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
        <FileList
          files={fileSummaries}
          loadedFilesByPath={fileDetailsByPath}
          onSelectFile={handleSelectFile}
        />
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
          ) : !fileSummaries ? (
            <div id="loading">Loading staged changes...</div>
          ) : fileSummaries.length === 0 ? (
            <div id="loading">No staged changes found.</div>
          ) : loadedFiles.length === 0 && isLoadingPage ? (
            <div id="loading">Loading staged changes...</div>
          ) : (
            <>
              {committed && (
                <div className="commit-banner success">
                  Committed successfully!
                </div>
              )}
              {loadedFiles.map((file) => {
                const filePath = getFilePath(file);
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

              <div className="diff-pagination">
                <span className="diff-pagination-count">
                  Loaded {loadedFiles.length} / {fileSummaries.length} files
                </span>
                {hasMoreFiles && (
                  <button
                    className="btn btn-sm"
                    type="button"
                    onClick={loadNextPage}
                    disabled={isLoadingPage}
                  >
                    {isLoadingPage ? 'Loading...' : 'Load more files'}
                  </button>
                )}
              </div>

              <div className="diff-pagination-sentinel" ref={loadMoreTriggerRef} aria-hidden="true" />
            </>
          )}
        </main>

        <CommentPanel
          commentsByFile={commentsByFile}
          commentCount={allComments.length}
          visible={hasComments}
        />
      </div>
      <div
        ref={resizeGuideRef}
        className={`sidebar-resize-guide${isResizingSidebar ? ' active' : ''}`}
        aria-hidden="true"
      />

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
