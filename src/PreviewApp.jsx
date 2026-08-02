import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Moon,
  Sun,
  ChevronUp,
  ChevronDown,
  FileText,
  MessageSquare,
  MessageSquarePlus,
} from 'lucide-react';
import { useTheme } from './hooks/useTheme';
import { useComments } from './hooks/useComments';
import { useDismissablePopover } from './hooks/useDismissablePopover';
import PreviewBody from './components/PreviewBody';
import CommentPanel from './components/CommentPanel';
import Toast from './components/Toast';
import { FileCommentBubble, FileCommentForm } from './components/FileComments';
import { SendMediumPicker } from './components/Header';
import { renderPreviewBlocks } from './utils/renderPreview';
import { withResolvedLines } from './utils/anchorComments';
import { copyToClipboard } from './utils/clipboard';
import { formatComments } from './utils/format';

const SEND_MEDIUM_PICKER_ID = 'send-medium-picker';
const COMMENTS_PANEL_ID = 'comments-dropdown-panel';
const POLL_INTERVAL_MS = 1000;

export default function PreviewApp({ preview, config }) {
  const { theme, toggleTheme } = useTheme();
  const filePath = preview.file;
  const documentPath = `${preview.root}/${preview.file}`;
  const {
    commentsByFile,
    allComments,
    generalNote,
    setGeneralNote,
    clearGeneralNote,
    addComment,
    updateComment,
    deleteComment,
    deleteAllComments,
  } = useComments(documentPath);

  const [blocks, setBlocks] = useState(null);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [activeForm, setActiveForm] = useState(null);
  const [editingComment, setEditingComment] = useState(null);
  const [isEditingGeneralNote, setIsEditingGeneralNote] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedMediums, setSelectedMediums] = useState(
    () =>
      config?.preferences?.sendMediums ||
      config?.sendMediums || ['clipboard', 'file'],
  );
  const stampRef = useRef(null);
  const hasRenderedRef = useRef(false);
  const toastTimerRef = useRef(null);
  const commentsWrapRef = useRef(null);
  const commentsButtonRef = useRef(null);
  const {
    isOpen: commentsOpen,
    close: closeComments,
    toggle: toggleComments,
  } = useDismissablePopover({
    wrapRef: commentsWrapRef,
    triggerRef: commentsButtonRef,
  });

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(
    () => () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    document.title = `${filePath} — staging`;
  }, [filePath]);

  const loadContent = useCallback(async () => {
    const res = await fetch(
      `/api/file-content?filePath=${encodeURIComponent(filePath)}`,
    );
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    setBlocks(renderPreviewBlocks(data.content, filePath));
    hasRenderedRef.current = true;
    setError(null);
  }, [filePath]);

  // Load + live reload in one poll loop. The first tick performs the initial
  // load (stampRef starts null, matching no stamp), and the stamp is only
  // recorded after a successful render — transient failures retry next tick
  // instead of pinning a stale render or error screen.
  useEffect(() => {
    let cancelled = false;
    // A load slower than the poll interval would otherwise let the next tick
    // overlap it, and the older response could land last and paint stale
    // content over newer content
    let inFlight = false;

    const tick = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const res = await fetch('/api/preview-status');
        const data = await res.json();
        if (cancelled) return;
        if (data.error) {
          // File unreadable: keep the last good render, but surface the
          // error if nothing has rendered yet
          if (!hasRenderedRef.current) setError(data.error);
          return;
        }
        // mtime + size: size catches writes landing within one mtime tick
        // on coarse-timestamp filesystems
        const stamp = `${data.mtimeMs}:${data.size}`;
        if (stamp === stampRef.current) return;
        await loadContent();
        if (!cancelled) stampRef.current = stamp;
      } catch (err) {
        if (!cancelled && !hasRenderedRef.current) setError(err.message);
      } finally {
        inFlight = false;
      }
    };

    tick();
    const timer = setInterval(() => {
      if (!document.hidden) tick();
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [loadContent]);

  const handleAddPreviewComment = useCallback((file, anchor) => {
    setEditingComment(null);
    setIsEditingGeneralNote(false);
    setActiveForm({
      file,
      line: anchor.srcLine ?? 0,
      lineType: 'preview',
      ...anchor,
    });
  }, []);

  const handleAddFileComment = useCallback(() => {
    setEditingComment(null);
    setIsEditingGeneralNote(false);
    setActiveForm({ file: filePath, line: 0, lineType: 'file' });
  }, [filePath]);

  const handleSubmitComment = useCallback(
    (content, anchorOverride) => {
      if (!content.trim()) return;
      if (editingComment) {
        updateComment(editingComment.id, content);
        setEditingComment(null);
      } else if (activeForm) {
        const isPreview = activeForm.lineType === 'preview';
        // anchorOverride carries the block the form was re-anchored to if the
        // document changed while it was open
        const extra = isPreview
          ? {
              blockIndex: activeForm.blockIndex,
              srcLine: activeForm.srcLine,
              anchorText: activeForm.anchorText,
              ...anchorOverride,
              selectedText: activeForm.selectedText,
              textOffset: activeForm.textOffset,
              textLength: activeForm.textLength,
            }
          : {};
        addComment(
          activeForm.file,
          isPreview ? (extra.srcLine ?? 0) : activeForm.line,
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
    setIsEditingGeneralNote(false);
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
      // Deleting the comment being edited unmounts its form; clear the
      // pointers too so no invisible form stays "open"
      if (editingComment?.id === id) {
        setEditingComment(null);
        setActiveForm(null);
      }
    },
    [deleteComment, editingComment],
  );

  const handleDismissAllComments = useCallback(() => {
    if (!confirm('Dismiss all review items?')) return;
    deleteAllComments();
    setActiveForm(null);
    setEditingComment(null);
    setIsEditingGeneralNote(false);
  }, [deleteAllComments]);

  const handleToggleEditGeneralNote = useCallback((open) => {
    if (open) {
      setActiveForm(null);
      setEditingComment(null);
    }
    setIsEditingGeneralNote(open);
  }, []);

  const handleSaveGeneralNote = useCallback(
    (text) => {
      setGeneralNote(text);
      setIsEditingGeneralNote(false);
    },
    [setGeneralNote],
  );

  const handleClearGeneralNote = useCallback(() => {
    clearGeneralNote();
    setIsEditingGeneralNote(false);
  }, [clearGeneralNote]);

  const handleToggleComments = useCallback(() => {
    setPickerOpen(false);
    toggleComments();
  }, [toggleComments]);

  const handleToggleMedium = useCallback(
    (id) => {
      const next = selectedMediums.includes(id)
        ? selectedMediums.filter((m) => m !== id)
        : [...selectedMediums, id];
      setSelectedMediums(next);
      // Persist like App does, so the choice survives the next launch
      fetch('/api/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sendMediums: next }),
      }).catch(() => {
        // Non-critical — selection still applies for this session
      });
    },
    [selectedMediums],
  );

  const handleSendComments = useCallback(async () => {
    if (allComments.length === 0 && !generalNote) return;
    // The document live-reloads under the reviewer, so a comment's stored
    // srcLine may predate edits made above it. Re-resolve against the current
    // render before handing line numbers to the agent.
    const formatted = formatComments(
      withResolvedLines(allComments, blocks, filePath),
      documentPath,
      generalNote,
      { context: 'preview' },
    );

    const copied = selectedMediums.includes('clipboard')
      ? await copyToClipboard(formatted)
      : null;

    const serverMediums = selectedMediums.filter((m) => m !== 'clipboard');
    if (serverMediums.length > 0) {
      try {
        const res = await fetch('/api/send-comments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ formatted, mediums: selectedMediums }),
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
    if (copied) parts.push('copied to clipboard');
    if (selectedMediums.includes('file'))
      parts.push(`saved to ${config?.reviewFileName || '.staging-review.md'}`);
    if (selectedMediums.includes('cli')) parts.push('printed to CLI');
    // Don't claim the clipboard worked when the browser refused it
    if (parts.length === 0) {
      showToast('Clipboard blocked by the browser', 'error');
    } else {
      showToast(
        `Comments ${parts.join(' and ')}${copied === false ? ' (clipboard blocked)' : ''}`,
        copied === false ? 'info' : 'success',
      );
    }

    // CLI medium exits the server — close the browser tab
    if (selectedMediums.includes('cli')) {
      setTimeout(() => window.close(), 300);
    }
  }, [
    allComments,
    blocks,
    filePath,
    generalNote,
    documentPath,
    selectedMediums,
    config,
    showToast,
  ]);

  const fileComments = commentsByFile[filePath];
  const fileLevelComments = (fileComments || []).filter(
    (c) => c.lineType === 'file',
  );
  const reviewItemCount = allComments.length + (generalNote ? 1 : 0);
  const canSend = reviewItemCount > 0 && selectedMediums.length > 0;

  return (
    <div className="preview-standalone">
      <header id="header">
        <div className="header-left">
          <h1 className="logo">staging</h1>
          <span className="separator" />
          <span className="preview-standalone-filename" title={documentPath}>
            <FileText size={14} strokeWidth={1.5} />
            {filePath}
          </span>
        </div>
        <div className="header-right">
          <button
            className={`file-action-btn${fileLevelComments.length > 0 ? ' has-file-comments' : ''}`}
            type="button"
            title="Add file comment"
            aria-label="Add file comment"
            onClick={handleAddFileComment}
          >
            <MessageSquarePlus size={18} strokeWidth={1.5} />
            {fileLevelComments.length > 0 && (
              <span className="file-comment-badge">
                {fileLevelComments.length}
              </span>
            )}
          </button>
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            type="button"
          >
            {theme === 'dark' ? (
              <Moon size={20} strokeWidth={1.5} className="theme-toggle-icon" />
            ) : (
              <Sun size={20} strokeWidth={1.5} className="theme-toggle-icon" />
            )}
          </button>
          <div className="comments-dropdown-wrap" ref={commentsWrapRef}>
            <button
              ref={commentsButtonRef}
              className={`btn-comments${commentsOpen ? ' is-open' : ''}`}
              onClick={handleToggleComments}
              aria-label={
                commentsOpen
                  ? 'Close comments dropdown'
                  : 'Open comments dropdown'
              }
              aria-haspopup="dialog"
              aria-expanded={commentsOpen}
              aria-controls={commentsOpen ? COMMENTS_PANEL_ID : undefined}
              title="Comments"
              type="button"
            >
              <MessageSquare size={16} strokeWidth={1.5} />
              {reviewItemCount > 0 && (
                <span className="btn-badge">{reviewItemCount}</span>
              )}
            </button>
            {commentsOpen && (
              <CommentPanel
                id={COMMENTS_PANEL_ID}
                commentsByFile={commentsByFile}
                reviewItemCount={reviewItemCount}
                onDeleteComment={handleDeleteComment}
                onDismissAll={handleDismissAllComments}
                onSelectComment={() => closeComments(true)}
                generalNote={generalNote}
                isEditingGeneralNote={isEditingGeneralNote}
                onToggleEditGeneralNote={handleToggleEditGeneralNote}
                onSaveGeneralNote={handleSaveGeneralNote}
                onClearGeneralNote={handleClearGeneralNote}
              />
            )}
          </div>
          <div className="header-actions">
            <div
              className={`split-btn-wrap header-action-split${pickerOpen ? ' is-open' : ''}`}
            >
              <button
                className={`btn btn-secondary header-action-btn split-btn-main${canSend ? ' is-ready' : ''}`}
                disabled={!canSend}
                onClick={handleSendComments}
                type="button"
              >
                Send to Agent
                {reviewItemCount > 0 && (
                  <span className="btn-badge">{reviewItemCount}</span>
                )}
              </button>
              <button
                id="send-medium-picker-trigger"
                className={`btn btn-secondary header-action-btn split-btn-caret${canSend ? ' is-ready' : ''}`}
                disabled={!canSend}
                onClick={() => {
                  closeComments(false);
                  setPickerOpen((prev) => !prev);
                }}
                aria-label="Choose send mediums"
                aria-haspopup="menu"
                aria-expanded={pickerOpen}
                aria-controls={pickerOpen ? SEND_MEDIUM_PICKER_ID : undefined}
                title="Choose send mediums"
                type="button"
              >
                {pickerOpen ? (
                  <ChevronUp size={20} strokeWidth={1.5} />
                ) : (
                  <ChevronDown size={20} strokeWidth={1.5} />
                )}
              </button>
              {pickerOpen && (
                <SendMediumPicker
                  id={SEND_MEDIUM_PICKER_ID}
                  labelledBy="send-medium-picker-trigger"
                  selectedMediums={selectedMediums}
                  onToggleMedium={handleToggleMedium}
                  onClose={() => setPickerOpen(false)}
                />
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="preview-standalone-main">
        {(fileLevelComments.length > 0 ||
          (activeForm &&
            activeForm.file === filePath &&
            activeForm.lineType === 'file') ||
          (editingComment &&
            editingComment.file === filePath &&
            editingComment.lineType === 'file')) && (
          <div className="file-comments-section">
            {fileLevelComments.map((c) => {
              const isEditing = editingComment && editingComment.id === c.id;
              if (isEditing) {
                return (
                  <FileCommentForm
                    key={`edit-${c.id}`}
                    initialContent={c.content}
                    onSubmit={handleSubmitComment}
                    onCancel={handleCancelForm}
                  />
                );
              }
              return (
                <FileCommentBubble
                  key={c.id}
                  comment={c}
                  onEdit={handleEditComment}
                  onDelete={handleDeleteComment}
                />
              );
            })}
            {activeForm &&
              activeForm.file === filePath &&
              activeForm.lineType === 'file' &&
              !editingComment && (
                <FileCommentForm
                  onSubmit={handleSubmitComment}
                  onCancel={handleCancelForm}
                />
              )}
          </div>
        )}

        {error ? (
          <div className="preview-standalone-error">
            Failed to load file: {error}
          </div>
        ) : blocks === null ? (
          <div className="preview-standalone-loading">Loading…</div>
        ) : (
          <PreviewBody
            blocks={blocks}
            filePath={filePath}
            fileComments={fileComments}
            activeForm={activeForm}
            editingComment={editingComment}
            onAddPreviewComment={handleAddPreviewComment}
            onSubmitComment={handleSubmitComment}
            onCancelForm={handleCancelForm}
            onEditComment={handleEditComment}
            onDeleteComment={handleDeleteComment}
          />
        )}
      </main>

      <Toast toast={toast} />
    </div>
  );
}
