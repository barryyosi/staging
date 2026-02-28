import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  lazy,
  Suspense,
} from 'react';
import { MinusCircle } from 'lucide-react';
import { useTheme } from './hooks/useTheme';
import { useComments } from './hooks/useComments';
import Header from './components/Header';
import FileSidebar from './components/FileSidebar';
import DiffViewer from './components/DiffViewer';
import Toast from './components/Toast';
import { formatComments, formatCommitMessageRequest } from './utils/format';
import { slugify } from './utils/escape';

const CommitModal = lazy(() => import('./components/CommitModal'));
const ShortcutsModal = lazy(() => import('./components/ShortcutsModal'));

const SIDEBAR_MIN_WIDTH = 180;
const SIDEBAR_MAX_WIDTH = 420;
const SIDEBAR_DEFAULT_WIDTH = 240;
const SIDEBAR_STORAGE_KEY = 'staging-sidebar-width';
const DIFF_PAGE_SIZE = 40;
const FILE_JUMP_LIMIT = 1;

function clampWidth(width, min, max) {
  return Math.min(max, Math.max(min, width));
}

function clampSidebarWidth(width) {
  return clampWidth(width, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH);
}

function getFilePath(file) {
  return file.to || file.from || '';
}

function getWebUrlFromRemote(remote, branch) {
  if (!remote) return '';
  let url = remote.replace(/\.git$/, '');
  if (url.startsWith('git@')) {
    url = url.replace('git@', 'https://').replace(':', '/');
  }

  if (url.includes('gitlab')) {
    return `${url}/-/merge_requests/new?merge_request[source_branch]=${branch}`;
  } else if (url.includes('bitbucket')) {
    return `${url}/pull-requests/new?source=${branch}`;
  } else {
    // Default to github format
    return `${url}/pull/new/${branch}`;
  }
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

function retainLoadedFileDetails(detailsByPath, summaries) {
  const retained = {};
  for (const summaryFile of summaries) {
    const filePath = getFilePath(summaryFile);
    if (!filePath) continue;
    if (detailsByPath[filePath]) {
      retained[filePath] = detailsByPath[filePath];
    }
  }
  return retained;
}

function countContiguousLoadedFiles(summaries, detailsByPath) {
  let count = 0;
  for (const summaryFile of summaries) {
    const filePath = getFilePath(summaryFile);
    if (!filePath || !detailsByPath[filePath]) break;
    count += 1;
  }
  return count;
}

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const [gitRoot, setGitRoot] = useState('');
  const {
    commentsByFile,
    allComments,
    addComment,
    updateComment,
    deleteComment,
    deleteAllComments,
  } = useComments(gitRoot);

  const [fileSummaries, setFileSummaries] = useState(null);
  const [unstagedFiles, setUnstagedFiles] = useState([]);
  const [fileDetailsByPath, setFileDetailsByPath] = useState({});
  const [unstagedChunksByPath, setUnstagedChunksByPath] = useState({});
  const [config, setConfig] = useState(null);
  const [projectInfo, setProjectInfo] = useState(null);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [showCommitModal, setShowCommitModal] = useState(false);
  const [gitActionType, setGitActionType] = useState('commit');
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [committed, setCommitted] = useState(false);
  const [isLoadingPage, setIsLoadingPage] = useState(false);
  const [hasMoreFiles, setHasMoreFiles] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [isSwitchingProject, setIsSwitchingProject] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    if (typeof window === 'undefined') return SIDEBAR_DEFAULT_WIDTH;
    const raw = Number.parseInt(
      localStorage.getItem(SIDEBAR_STORAGE_KEY) || '',
      10,
    );
    return Number.isFinite(raw)
      ? clampSidebarWidth(raw)
      : SIDEBAR_DEFAULT_WIDTH;
  });
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [globalCollapsed, setGlobalCollapsed] = useState(false);
  const [collapseVersion, setCollapseVersion] = useState(0);
  const [reviewedFiles, setReviewedFiles] = useState(new Set());
  const [selectedMediums, setSelectedMediums] = useState(null);
  const [activeFilePath, setActiveFilePath] = useState(null);

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

  const requestDiffPage = useCallback(
    async (offset, limit = DIFF_PAGE_SIZE) => {
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
    },
    [],
  );

  const requestUnstagedFiles = useCallback(async () => {
    const response = await fetch('/api/unstaged-files');
    if (!response.ok) throw new Error('Failed to load unstaged files');

    const data = await response.json();
    if (data.error) throw new Error(data.error);
    return data.files || [];
  }, []);

  const requestUnstagedHunksForStagedFiles = useCallback(
    async (stagedFilePaths) => {
      if (!stagedFilePaths || stagedFilePaths.length === 0) return {};
      try {
        const params = stagedFilePaths.map(encodeURIComponent).join(',');
        const response = await fetch(`/api/unstaged-hunks?filePaths=${params}`);
        if (!response.ok) return {};
        const data = await response.json();
        const map = {};
        for (const file of data.files || []) {
          const fp = file.to || file.from || '';
          if (fp && file.chunks?.length > 0) {
            map[fp] = file.chunks;
          }
        }
        return map;
      } catch {
        return {};
      }
    },
    [],
  );

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
        const [summaryRes, configRes, unstaged] = await Promise.all([
          fetch('/api/diff?mode=summary'),
          fetch('/api/config'),
          requestUnstagedFiles(),
        ]);
        if (!summaryRes.ok)
          throw new Error('Failed to load staged changes summary');
        if (!configRes.ok) throw new Error('Failed to load config');

        const summaryData = await summaryRes.json();
        const configData = await configRes.json();

        if (summaryData.error) {
          throw new Error(summaryData.error);
        }

        if (cancelled) return;

        const summaries = summaryData.files || [];
        const stagedPaths = summaries.map((f) => getFilePath(f)).filter(Boolean);

        setGitRoot(summaryData.gitRoot || '');
        setConfig(configData);
        setFileSummaries(summaries);
        setUnstagedFiles(unstaged);
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
          const [firstPage, hunksMap] = await Promise.all([
            requestDiffPage(0, DIFF_PAGE_SIZE),
            requestUnstagedHunksForStagedFiles(stagedPaths),
          ]);
          if (cancelled) return;

          const firstPageFiles = firstPage.files || [];
          setFileDetailsByPath(mergeFileDetails({}, firstPageFiles));
          setUnstagedChunksByPath(hunksMap);

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
  }, [requestDiffPage, requestUnstagedFiles, requestUnstagedHunksForStagedFiles]);

  // Initialize selectedMediums once config is available
  useEffect(() => {
    if (!config || selectedMediums !== null) return;
    const saved = config.preferences?.sendMediums;
    setSelectedMediums(saved || config.sendMediums || ['clipboard', 'file']);
  }, [config, selectedMediums]);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(
    () => () => {
      document.body.classList.remove('is-resizing-sidebar');
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (resizeGuideRafRef.current) {
        cancelAnimationFrame(resizeGuideRafRef.current);
        resizeGuideRafRef.current = 0;
      }
    },
    [],
  );

  // Global keyboard shortcuts
  useEffect(() => {
    let ggTimer = null;
    let firstG = false;

    function handleKeyDown(e) {
      // Ignore if typing in input/textarea/contenteditable
      const target = e.target;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      // Ignore if modal/form is open
      if (
        showCommitModal ||
        showShortcutsModal ||
        activeForm ||
        editingComment
      ) {
        return;
      }

      // ? - Show shortcuts
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setShowShortcutsModal(true);
        return;
      }

      // Cmd/Ctrl+Enter - Open commit modal
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setShowCommitModal(true);
        return;
      }

      // z - Toggle collapse all
      if (e.key === 'z' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setGlobalCollapsed((prev) => !prev);
        setCollapseVersion((v) => v + 1);
        return;
      }

      // j - Next file
      if (e.key === 'j' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        scrollToAdjacentFile('next');
        return;
      }

      // k - Previous file
      if (e.key === 'k' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        scrollToAdjacentFile('prev');
        return;
      }

      // G (shift+g) - Last file
      if (
        e.key === 'G' &&
        e.shiftKey &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        e.preventDefault();
        scrollToFile('last');
        return;
      }

      // g then g - First file
      if (
        e.key === 'g' &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !e.shiftKey
      ) {
        if (firstG) {
          e.preventDefault();
          if (ggTimer) clearTimeout(ggTimer);
          firstG = false;
          scrollToFile('first');
          return;
        }
        e.preventDefault();
        firstG = true;
        ggTimer = setTimeout(() => {
          firstG = false;
        }, 1000);
        return;
      }

      // x - Toggle collapse current file
      if (e.key === 'x' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        toggleCurrentFileCollapse();
        return;
      }
    }

    function scrollToAdjacentFile(direction) {
      const files = Array.from(document.querySelectorAll('.diff-file'));
      if (files.length === 0) return;

      const headerHeight = 64;
      const scrollY = window.scrollY;

      let currentIndex = -1;
      for (let i = 0; i < files.length; i++) {
        const rect = files[i].getBoundingClientRect();
        const top = rect.top + scrollY - headerHeight;
        if (top <= scrollY + 10) {
          currentIndex = i;
        } else {
          break;
        }
      }

      let targetIndex;
      if (direction === 'next') {
        targetIndex = Math.min(currentIndex + 1, files.length - 1);
      } else {
        targetIndex = Math.max(currentIndex - 1, 0);
      }

      if (targetIndex >= 0 && targetIndex < files.length) {
        files[targetIndex].scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }
    }

    function scrollToFile(position) {
      const files = Array.from(document.querySelectorAll('.diff-file'));
      if (files.length === 0) return;

      const target = position === 'first' ? files[0] : files[files.length - 1];
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function toggleCurrentFileCollapse() {
      const files = Array.from(document.querySelectorAll('.diff-file'));
      if (files.length === 0) return;

      const headerHeight = 64;
      const scrollY = window.scrollY;
      const viewportCenter = scrollY + window.innerHeight / 2;

      let currentFile = null;
      for (const file of files) {
        const rect = file.getBoundingClientRect();
        const top = rect.top + scrollY;
        const bottom = top + rect.height;
        if (top <= viewportCenter && viewportCenter <= bottom) {
          currentFile = file;
          break;
        }
      }

      if (!currentFile) {
        for (let i = 0; i < files.length; i++) {
          const rect = files[i].getBoundingClientRect();
          const top = rect.top + scrollY - headerHeight;
          if (top <= scrollY + 10) {
            currentFile = files[i];
          } else {
            break;
          }
        }
      }

      if (currentFile) {
        const collapseBtn = currentFile.querySelector('.file-action-collapse');
        if (collapseBtn) {
          collapseBtn.click();
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (ggTimer) clearTimeout(ggTimer);
    };
  }, [showCommitModal, showShortcutsModal, activeForm, editingComment]);

  const handleAddComment = useCallback((file, line, lineType) => {
    setEditingComment(null);
    setActiveForm({ file, line, lineType });
  }, []);

  const handleAddPreviewComment = useCallback(
    (file, selectedText, textOffset, textLength) => {
      setEditingComment(null);
      setActiveForm({
        file,
        line: 0,
        lineType: 'preview',
        selectedText,
        textOffset,
        textLength,
      });
    },
    [],
  );

  const handleSubmitComment = useCallback(
    (content) => {
      if (!content.trim()) return;
      if (editingComment) {
        updateComment(editingComment.id, content);
        setEditingComment(null);
      } else if (activeForm) {
        const extra =
          activeForm.lineType === 'preview'
            ? {
                selectedText: activeForm.selectedText,
                textOffset: activeForm.textOffset,
                textLength: activeForm.textLength,
              }
            : {};
        addComment(
          activeForm.file,
          activeForm.line,
          activeForm.lineType,
          content,
          extra,
        );
      }
      setActiveForm(null);
    },
    [activeForm, editingComment, addComment, updateComment],
  );

  const handleCancelForm = useCallback(() => {
    setActiveForm(null);
    setEditingComment(null);
  }, []);

  const handleEditComment = useCallback((comment) => {
    setActiveForm({
      file: comment.file,
      line: comment.line,
      lineType: comment.lineType,
    });
    setEditingComment(comment);
  }, []);

  const handleDeleteComment = useCallback(
    (id) => {
      deleteComment(id);
    },
    [deleteComment],
  );

  const handleDismissAllComments = useCallback(() => {
    if (!confirm('Dismiss all comments?')) return;
    deleteAllComments();
  }, [deleteAllComments]);

  const handleSendComments = useCallback(
    async (mediums = ['clipboard', 'file'], options = {}) => {
      if (!config) {
        showToast('Config is still loading', 'error');
        return;
      }

      let formatted;

      if (options.approvalMessage) {
        formatted =
          '## Review: Approved\n\nLooks good, no changes needed. Approved to proceed.';
      } else if (options.customMessage) {
        formatted = `## Review Feedback\n\n${options.customMessage}`;
      } else if (options.rawFormatted) {
        formatted = options.rawFormatted;
      } else {
        if (allComments.length === 0) return;
        formatted = formatComments(allComments, gitRoot);
      }

      if (mediums.includes('clipboard')) {
        try {
          await navigator.clipboard.writeText(formatted);
        } catch {
          // Clipboard might not be available
        }
      }

      const serverMediums = mediums.filter((m) => m !== 'clipboard');

      if (serverMediums.length > 0) {
        try {
          const res = await fetch('/api/send-comments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ formatted, mediums }),
          });
          const data = await res.json();
          if (!data.success) {
            showToast(`Failed to send: ${data.error}`, 'error');
            return;
          }
        } catch (err) {
          showToast(`Failed to send: ${err.message}`, 'error');
          return;
        }
      }

      const parts = [];
      if (mediums.includes('clipboard')) parts.push('copied to clipboard');
      if (mediums.includes('file'))
        parts.push(`saved to ${config.reviewFileName}`);
      if (mediums.includes('cli')) parts.push('printed to CLI');

      const actionLabel = options.approvalMessage
        ? 'Approval'
        : options.customMessage
          ? 'Message'
          : options.rawFormatted
            ? 'Prompt'
            : 'Comments';
      if (!options.suppressToast) {
        showToast(`${actionLabel} ${parts.join(' and ')}`, 'success');
      }

      // CLI medium exits the server — close the browser tab
      if (mediums.includes('cli')) {
        setTimeout(() => window.close(), 300);
      }
    },
    [allComments, gitRoot, config, showToast],
  );

  const handleGenerateCommitViaAgent = useCallback(async () => {
    const formatted = formatCommitMessageRequest(allComments, gitRoot);
    setShowCommitModal(false);
    await handleSendComments(selectedMediums || ['clipboard', 'file'], {
      rawFormatted: formatted,
      suppressToast: true,
    });
    showToast(
      'Commit message prompt sent — paste the generated message when ready',
      'success',
    );
  }, [allComments, gitRoot, selectedMediums, handleSendComments, showToast]);

  const handleGitAction = useCallback(
    async (action) => {
      if (action === 'commit' || action === 'commit-and-push') {
        if (allComments.length > 0) {
          if (
            !confirm(
              `You have ${allComments.length} unresolved comment${allComments.length === 1 ? '' : 's'}. Commit anyway?`,
            )
          ) {
            return;
          }
        }
        setGitActionType(action);
        setShowCommitModal(true);
        return;
      }

      if (action === 'push') {
        try {
          showToast('Pushing changes...', 'info');
          const res = await fetch('/api/push', { method: 'POST' });
          const data = await res.json();
          if (data.success) {
            showToast('Changes pushed successfully!', 'success');
          } else {
            showToast(`Push failed: ${data.error}`, 'error');
          }
        } catch (err) {
          showToast(`Push failed: ${err.message}`, 'error');
        }
        return;
      }

      if (action === 'pr') {
        if (projectInfo?.remoteUrl) {
          const url = getWebUrlFromRemote(
            projectInfo.remoteUrl,
            projectInfo.branch || 'main',
          );
          window.open(url, '_blank', 'noopener,noreferrer');
        } else {
          showToast('No remote URL found', 'error');
        }
        return;
      }
    },
    [allComments.length, projectInfo, showToast],
  );

  const handleDoCommit = useCallback(
    async (message) => {
      if (!message.trim()) {
        showToast('Commit message cannot be empty', 'error');
        return;
      }
      try {
        const isPush = gitActionType === 'commit-and-push';
        const res = await fetch('/api/commit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: message.trim(), push: isPush }),
        });
        const data = await res.json();
        setShowCommitModal(false);
        if (data.success) {
          setCommitted(true);
          showToast(
            isPush ? 'Changes committed and pushed!' : 'Changes committed!',
            'success',
          );
        } else {
          showToast(`Commit failed: ${data.error}`, 'error');
        }
      } catch (err) {
        setShowCommitModal(false);
        showToast(`Commit failed: ${err.message}`, 'error');
      }
    },
    [gitActionType, showToast],
  );

  const persistPreferences = useCallback(async (prefs) => {
    try {
      const res = await fetch('/api/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prefs),
      });
      if (!res.ok) throw new Error('Failed to save preferences');
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to save preferences');
      }
      if (data.preferences) {
        setConfig((prev) =>
          prev ? { ...prev, preferences: data.preferences } : prev,
        );
      }
    } catch (err) {
      console.warn(`Failed to persist preferences: ${err.message}`);
    }
  }, []);

  const handleChangeMediums = useCallback(
    (mediums) => {
      setSelectedMediums(mediums);
      void persistPreferences({ sendMediums: mediums });
    },
    [persistPreferences],
  );

  const handleCloseCommitModal = useCallback(
    () => setShowCommitModal(false),
    [],
  );

  const handleShowShortcuts = useCallback(() => {
    setShowShortcutsModal(true);
  }, []);

  const handleCloseShortcuts = useCallback(() => {
    setShowShortcutsModal(false);
  }, []);

  const handleToggleCollapseAll = useCallback(() => {
    setGlobalCollapsed((prev) => !prev);
    setCollapseVersion((v) => v + 1);
  }, []);

  const handleFileReviewed = useCallback((filePath, isReviewed) => {
    setReviewedFiles((prev) => {
      const next = new Set(prev);
      if (isReviewed) {
        next.add(filePath);
      } else {
        next.delete(filePath);
      }
      return next;
    });
  }, []);

  const fetchProjectInfo = useCallback(async () => {
    try {
      const res = await fetch('/api/project-info');
      if (res.ok) {
        const data = await res.json();
        setProjectInfo(data);
      }
    } catch {
      // non-critical — navigator just won't render
    }
  }, []);

  useEffect(() => {
    fetchProjectInfo();
  }, [fetchProjectInfo]);

  const reloadDiffs = useCallback(async () => {
    setFileSummaries(null);
    setFileDetailsByPath({});
    setUnstagedChunksByPath({});
    setNextOffset(0);
    setHasMoreFiles(false);
    setCommitted(false);
    setReviewedFiles(new Set());
    nextOffsetRef.current = 0;
    hasMoreFilesRef.current = false;

    try {
      const [summaryRes, unstaged] = await Promise.all([
        fetch('/api/diff?mode=summary'),
        requestUnstagedFiles(),
      ]);
      if (!summaryRes.ok)
        throw new Error('Failed to load staged changes summary');
      const summaryData = await summaryRes.json();
      if (summaryData.error) throw new Error(summaryData.error);

      const summaries = summaryData.files || [];
      const stagedPaths = summaries.map((f) => getFilePath(f)).filter(Boolean);
      setGitRoot(summaryData.gitRoot || '');
      setFileSummaries(summaries);
      setUnstagedFiles(unstaged);

      if (summaries.length === 0) return;

      isLoadingPageRef.current = true;
      setIsLoadingPage(true);
      try {
        const [firstPage, hunksMap] = await Promise.all([
          requestDiffPage(0, DIFF_PAGE_SIZE),
          requestUnstagedHunksForStagedFiles(stagedPaths),
        ]);
        setFileDetailsByPath(mergeFileDetails({}, firstPage.files || []));
        setUnstagedChunksByPath(hunksMap);
        const initialNext = Number.isFinite(firstPage.nextOffset)
          ? firstPage.nextOffset
          : (firstPage.files || []).length;
        const initialMore = Boolean(firstPage.hasMore);
        setNextOffset(initialNext);
        setHasMoreFiles(initialMore);
        nextOffsetRef.current = initialNext;
        hasMoreFilesRef.current = initialMore;
      } finally {
        isLoadingPageRef.current = false;
        setIsLoadingPage(false);
      }
    } catch (err) {
      setError(err.message);
    }
  }, [requestDiffPage, requestUnstagedFiles, requestUnstagedHunksForStagedFiles]);

  const switchProject = useCallback(
    async (targetPath) => {
      setIsSwitchingProject(true);
      try {
        const res = await fetch('/api/switch-project', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: targetPath }),
        });
        const data = await res.json();
        if (data.error) {
          showToast(`Failed to switch: ${data.error}`, 'error');
          setIsSwitchingProject(false);
          return;
        }
        setProjectInfo(data);
        setError(null);
        setActiveForm(null);
        setEditingComment(null);
        setReviewedFiles(new Set());
        await reloadDiffs();
        // Delay flag reset to allow animation to complete (only on success)
        setTimeout(() => setIsSwitchingProject(false), 550);
      } catch (err) {
        showToast(`Failed to switch project: ${err.message}`, 'error');
        setIsSwitchingProject(false);
      }
    },
    [reloadDiffs, showToast],
  );

  const handleUnstageFile = useCallback(
    async (filePath) => {
      try {
        const res = await fetch('/api/file-unstage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filePath }),
        });
        const data = await res.json();
        if (data.success) {
          showToast('File unstaged', 'success');
          await reloadDiffs();
        } else {
          showToast(`Failed to unstage file: ${data.error}`, 'error');
        }
      } catch (err) {
        showToast(`Failed to unstage file: ${err.message}`, 'error');
      }
    },
    [reloadDiffs, showToast],
  );

  const handleStageFile = useCallback(
    async (filePath, fromPath = null) => {
      try {
        const res = await fetch('/api/file-stage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filePath, fromPath }),
        });
        const data = await res.json();
        if (data.success) {
          const [summaryRes, unstaged] = await Promise.all([
            fetch('/api/diff?mode=summary'),
            requestUnstagedFiles(),
          ]);
          if (!summaryRes.ok) {
            throw new Error('Failed to load staged changes summary');
          }

          const summaryData = await summaryRes.json();
          if (summaryData.error) throw new Error(summaryData.error);

          const summaries = summaryData.files || [];
          const retainedDetails = retainLoadedFileDetails(
            fileDetailsByPathRef.current,
            summaries,
          );

          setGitRoot(summaryData.gitRoot || '');
          setFileSummaries(summaries);
          setUnstagedFiles(unstaged);
          setFileDetailsByPath(retainedDetails);

          fileSummariesRef.current = summaries;
          fileDetailsByPathRef.current = retainedDetails;

          const contiguousLoadedCount = countContiguousLoadedFiles(
            summaries,
            retainedDetails,
          );
          const next = Math.min(
            summaries.length,
            Math.max(contiguousLoadedCount, nextOffsetRef.current),
          );
          const more = next < summaries.length;
          nextOffsetRef.current = next;
          hasMoreFilesRef.current = more;
          setNextOffset(next);
          setHasMoreFiles(more);

          const targetIndex = summaries.findIndex(
            (file) => getFilePath(file) === filePath,
          );
          if (targetIndex !== -1 && !retainedDetails[filePath]) {
            const targetPage = await requestDiffPage(
              targetIndex,
              FILE_JUMP_LIMIT,
            );
            const mergedDetails = mergeFileDetails(
              fileDetailsByPathRef.current,
              targetPage.files || [],
            );
            setFileDetailsByPath(mergedDetails);
            fileDetailsByPathRef.current = mergedDetails;
          }

          showToast('File staged', 'success');

          const targetId = `file-${slugify(filePath)}`;
          const scrollToTarget = () => {
            const node = document.getElementById(targetId);
            if (!node) return false;
            node.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return true;
          };
          requestAnimationFrame(() => {
            if (scrollToTarget()) return;
            requestAnimationFrame(scrollToTarget);
          });
        } else {
          showToast(`Failed to stage file: ${data.error}`, 'error');
        }
      } catch (err) {
        showToast(`Failed to stage file: ${err.message}`, 'error');
      }
    },
    [requestDiffPage, requestUnstagedFiles, showToast],
  );

  const handleRevertFile = useCallback(
    async (filePath) => {
      try {
        const res = await fetch('/api/file-revert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filePath }),
        });
        const data = await res.json();
        if (data.success) {
          showToast('File reverted', 'success');
          await reloadDiffs();
        } else {
          showToast(`Failed to revert file: ${data.error}`, 'error');
        }
      } catch (err) {
        showToast(`Failed to revert file: ${err.message}`, 'error');
      }
    },
    [reloadDiffs, showToast],
  );

  const handleUnstageHunk = useCallback(
    async (filePath, chunkIndex, oldStart) => {
      try {
        const res = await fetch('/api/hunk-unstage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filePath, chunkIndex, oldStart }),
        });
        const data = await res.json();
        if (data.success) {
          showToast('Hunk unstaged', 'success');
          await reloadDiffs();
        } else {
          showToast(`Failed to unstage hunk: ${data.error}`, 'error');
        }
      } catch (err) {
        showToast(`Failed to unstage hunk: ${err.message}`, 'error');
      }
    },
    [reloadDiffs, showToast],
  );

  const handleRevertHunk = useCallback(
    async (filePath, chunkIndex, oldStart) => {
      try {
        const res = await fetch('/api/hunk-revert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filePath, chunkIndex, oldStart }),
        });
        const data = await res.json();
        if (data.success) {
          showToast('Hunk discarded', 'success');
          await reloadDiffs();
        } else {
          showToast(`Failed to discard hunk: ${data.error}`, 'error');
        }
      } catch (err) {
        showToast(`Failed to discard hunk: ${err.message}`, 'error');
      }
    },
    [reloadDiffs, showToast],
  );

  const handleEditFile = useCallback(
    async (filePath, content) => {
      const writeRes = await fetch('/api/file-write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath, content }),
      });
      const writeData = await writeRes.json();
      if (!writeData.success) {
        showToast(`Failed to write file: ${writeData.error}`, 'error');
        throw new Error(writeData.error);
      }

      const stageRes = await fetch('/api/file-stage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath }),
      });
      const stageData = await stageRes.json();
      if (!stageData.success) {
        showToast(`Failed to stage file: ${stageData.error}`, 'error');
        throw new Error(stageData.error);
      }

      showToast('File saved and staged', 'success');
      await reloadDiffs();
    },
    [reloadDiffs, showToast],
  );

  const handleStageHunk = useCallback(
    async (filePath, chunkIndex, oldStart) => {
      try {
        const res = await fetch('/api/hunk-stage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filePath, chunkIndex, oldStart }),
        });
        const data = await res.json();
        if (data.success) {
          showToast('Hunk staged', 'success');
          await reloadDiffs();
        } else {
          showToast(`Failed to stage hunk: ${data.error}`, 'error');
        }
      } catch (err) {
        showToast(`Failed to stage hunk: ${err.message}`, 'error');
      }
    },
    [reloadDiffs, showToast],
  );

  const handleUnstageAll = useCallback(async () => {
    if (!confirm('Unstage all files? Changes will remain in the working tree.'))
      return;
    try {
      const res = await fetch('/api/unstage-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.success) {
        showToast('All files unstaged', 'success');
        await reloadDiffs();
      } else {
        showToast(`Failed to unstage all: ${data.error}`, 'error');
      }
    } catch (err) {
      showToast(`Failed to unstage all: ${err.message}`, 'error');
    }
  }, [reloadDiffs, showToast]);

  const ensureFileLoaded = useCallback(
    async (filePath) => {
      if (fileDetailsByPathRef.current[filePath]) return true;

      const summaries = fileSummariesRef.current;
      if (!summaries) return false;

      const targetIndex = summaries.findIndex(
        (file) => getFilePath(file) === filePath,
      );
      if (targetIndex === -1) return false;

      try {
        const data = await requestDiffPage(targetIndex, FILE_JUMP_LIMIT);
        setFileDetailsByPath((prev) =>
          mergeFileDetails(prev, data.files || []),
        );
        return (data.files || []).some(
          (file) => getFilePath(file) === filePath,
        );
      } catch (err) {
        showToast(`Failed to load file: ${err.message}`, 'error');
        return false;
      }
    },
    [requestDiffPage, showToast],
  );

  const handleSelectFile = useCallback(
    async (filePath) => {
      if (!filePath) return;
      setActiveFilePath(filePath);
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
    },
    [ensureFileLoaded],
  );

  // Sidebar resize: write CSS variable directly during drag, commit to state on release
  const handleSidebarResizeStart = useCallback((event) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = sidebarWidthRef.current;
    sidebarPreviewWidthRef.current = startWidth;

    const drawGuide = () => {
      resizeGuideRafRef.current = 0;
      if (resizeGuideRef.current) {
        resizeGuideRef.current.style.setProperty(
          '--guide-left',
          `${sidebarPreviewWidthRef.current}px`,
        );
      }
    };

    drawGuide();

    const handlePointerMove = (moveEvent) => {
      const nextWidth = clampSidebarWidth(
        startWidth + moveEvent.clientX - startX,
      );
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
        const unstagedChunks = unstagedChunksByPath[filePath] || [];
        orderedLoadedFiles.push(
          unstagedChunks.length > 0
            ? { ...loadedFile, unstagedChunks }
            : loadedFile,
        );
      }
    }

    return orderedLoadedFiles;
  }, [fileSummaries, fileDetailsByPath, unstagedChunksByPath]);

  // Track which file is currently visible in the viewport
  useEffect(() => {
    const diffFiles = document.querySelectorAll('.diff-file');
    if (diffFiles.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const path = entry.target.dataset.filePath;
            if (path) setActiveFilePath(path);
          }
        }
      },
      { rootMargin: '-64px 0px -60% 0px', threshold: 0 },
    );

    diffFiles.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [loadedFiles]);

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

  const canAutoLoadMore =
    hasMoreFiles && loadedFiles.length === contiguousLoadedCount;

  useEffect(() => {
    if (!canAutoLoadMore || !loadMoreTriggerRef.current) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        loadNextPage();
      },
      { rootMargin: '500px 0px 500px 0px' },
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
        reviewedFiles={reviewedFiles}
        hasComments={hasComments}
        commentCount={allComments.length}
        commentsByFile={commentsByFile}
        onDeleteComment={handleDeleteComment}
        onDismissAllComments={handleDismissAllComments}
        onSendComments={handleSendComments}
        onGitAction={handleGitAction}
        gitActionType={gitActionType}
        committed={committed}
        allCollapsed={globalCollapsed}
        onToggleCollapseAll={handleToggleCollapseAll}
        onShowShortcuts={handleShowShortcuts}
        projectInfo={projectInfo}
        onSwitchProject={switchProject}
        selectedMediums={selectedMediums || ['clipboard', 'file']}
        onChangeMediums={handleChangeMediums}
      />

      <div
        id="layout"
        ref={layoutRef}
        style={{ '--sidebar-width': `${sidebarWidth}px` }}
      >
        <FileSidebar
          files={fileSummaries}
          unstagedFiles={unstagedFiles}
          loadedFilesByPath={fileDetailsByPath}
          onSelectFile={handleSelectFile}
          onStageFile={handleStageFile}
          onUnstageFile={handleUnstageFile}
          reviewedFiles={reviewedFiles}
          commentsByFile={commentsByFile}
          activeFile={activeFilePath}
          unstagedChunksByPath={unstagedChunksByPath}
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

        <main
          id="diff-container"
          className={isSwitchingProject ? 'switching' : ''}
        >
          {error ? (
            <div id="loading">Error: {error}</div>
          ) : !fileSummaries ? (
            <div id="loading">Loading staged changes...</div>
          ) : fileSummaries.length === 0 ? (
            <div id="loading">
              {unstagedFiles.length > 0
                ? 'No staged changes found. Use "Show unstaged" in the sidebar to stage files.'
                : 'No staged changes found.'}
            </div>
          ) : loadedFiles.length === 0 && isLoadingPage ? (
            <div id="loading">Loading staged changes...</div>
          ) : (
            <>
              {committed && (
                <div className="commit-banner success">
                  Committed successfully!
                </div>
              )}
              {loadedFiles.map((file, index) => {
                const filePath = getFilePath(file);
                return (
                  <DiffViewer
                    key={filePath}
                    file={file}
                    className="entering"
                    style={{ animationDelay: `${index * 40}ms` }}
                    fileComments={commentsByFile[filePath]}
                    activeForm={activeForm}
                    editingComment={editingComment}
                    onAddComment={handleAddComment}
                    onAddPreviewComment={handleAddPreviewComment}
                    onSubmitComment={handleSubmitComment}
                    onCancelForm={handleCancelForm}
                    onEditComment={handleEditComment}
                    onDeleteComment={handleDeleteComment}
                    onUnstageFile={handleUnstageFile}
                    onRevertFile={handleRevertFile}
                    onUnstageHunk={handleUnstageHunk}
                    onRevertHunk={handleRevertHunk}
                    onStageHunk={handleStageHunk}
                    onEditFile={handleEditFile}
                    onFileReviewed={handleFileReviewed}
                    isReviewed={reviewedFiles.has(filePath)}
                    globalCollapsed={globalCollapsed}
                    collapseVersion={collapseVersion}
                  />
                );
              })}

              {loadedFiles.length > 0 && (
                <button
                  className="btn btn-secondary btn-unstage-all"
                  type="button"
                  onClick={handleUnstageAll}
                >
                  <MinusCircle size={16} strokeWidth={1.5} />
                  Unstage all
                </button>
              )}

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

              <div
                className="diff-pagination-sentinel"
                ref={loadMoreTriggerRef}
                aria-hidden="true"
              />
            </>
          )}
        </main>
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
            actionType={gitActionType}
            onCommit={handleDoCommit}
            onClose={handleCloseCommitModal}
            onGenerateViaAgent={handleGenerateCommitViaAgent}
            canGenerateViaAgent={
              Array.isArray(selectedMediums) && selectedMediums.length > 0
            }
          />
        </Suspense>
      )}

      {showShortcutsModal && (
        <Suspense fallback={null}>
          <ShortcutsModal onClose={handleCloseShortcuts} />
        </Suspense>
      )}
    </>
  );
}
