import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Moon,
  Sun,
  ChevronUp,
  ChevronDown,
  FileText,
  Trash2,
} from 'lucide-react';
import { useTheme } from './hooks/useTheme';
import { useComments } from './hooks/useComments';
import PreviewBody from './components/PreviewBody';
import Toast from './components/Toast';
import { SendMediumPicker } from './components/Header';
import { renderPreview } from './utils/renderPreview';
import { formatComments } from './utils/format';

const SEND_MEDIUM_PICKER_ID = 'send-medium-picker';
const POLL_INTERVAL_MS = 1000;

export default function PreviewApp({ preview, config }) {
  const { theme, toggleTheme } = useTheme();
  const filePath = preview.file;
  const documentPath = `${preview.root}/${preview.file}`;
  const {
    commentsByFile,
    allComments,
    generalNote,
    addComment,
    updateComment,
    deleteComment,
    deleteAllComments,
  } = useComments(documentPath);

  const [html, setHtml] = useState(null);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [activeForm, setActiveForm] = useState(null);
  const [editingComment, setEditingComment] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedMediums, setSelectedMediums] = useState(
    () =>
      config?.preferences?.sendMediums ||
      config?.sendMediums || ['clipboard', 'file'],
  );
  const mtimeRef = useRef(null);
  const toastTimerRef = useRef(null);

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
    setHtml(renderPreview(data.content, filePath));
    setError(null);
  }, [filePath]);

  // Initial load
  useEffect(() => {
    loadContent().catch((err) => setError(err.message));
  }, [loadContent]);

  // Live reload: poll file mtime and re-render on change
  useEffect(() => {
    const timer = setInterval(async () => {
      if (document.hidden) return;
      try {
        const res = await fetch('/api/preview-status');
        const data = await res.json();
        if (data.error) return; // file temporarily unreadable — keep last render
        if (mtimeRef.current !== null && data.mtimeMs !== mtimeRef.current) {
          await loadContent();
        }
        mtimeRef.current = data.mtimeMs;
      } catch {
        // Server gone — ignore; the tab is stale anyway
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [loadContent]);

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
        addComment(
          activeForm.file,
          activeForm.line,
          activeForm.lineType,
          content,
          {
            selectedText: activeForm.selectedText,
            textOffset: activeForm.textOffset,
            textLength: activeForm.textLength,
          },
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

  const handleDismissAllComments = useCallback(() => {
    if (!confirm('Dismiss all review items?')) return;
    deleteAllComments();
  }, [deleteAllComments]);

  const handleToggleMedium = useCallback((id) => {
    setSelectedMediums((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id],
    );
  }, []);

  const handleSendComments = useCallback(async () => {
    if (allComments.length === 0 && !generalNote) return;
    const formatted = formatComments(allComments, documentPath, generalNote, {
      context: 'preview',
    });

    if (selectedMediums.includes('clipboard')) {
      try {
        await navigator.clipboard.writeText(formatted);
      } catch {
        // Clipboard might not be available
      }
    }

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
    if (selectedMediums.includes('clipboard'))
      parts.push('copied to clipboard');
    if (selectedMediums.includes('file'))
      parts.push(`saved to ${config?.reviewFileName || '.staging-review.md'}`);
    if (selectedMediums.includes('cli')) parts.push('printed to CLI');
    showToast(`Comments ${parts.join(' and ')}`, 'success');

    // CLI medium exits the server — close the browser tab
    if (selectedMediums.includes('cli')) {
      setTimeout(() => window.close(), 300);
    }
  }, [
    allComments,
    generalNote,
    documentPath,
    selectedMediums,
    config,
    showToast,
  ]);

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
          {reviewItemCount > 0 && (
            <button
              className="btn-collapse-all"
              onClick={handleDismissAllComments}
              aria-label="Dismiss all review items"
              title="Dismiss all review items"
              type="button"
            >
              <Trash2 size={18} strokeWidth={1.5} />
            </button>
          )}
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
                onClick={() => setPickerOpen((prev) => !prev)}
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
        {error ? (
          <div className="preview-standalone-error">
            Failed to load file: {error}
          </div>
        ) : html === null ? (
          <div className="preview-standalone-loading">Loading…</div>
        ) : (
          <PreviewBody
            html={html}
            filePath={filePath}
            fileComments={commentsByFile[filePath]}
            activeForm={activeForm}
            editingComment={editingComment}
            onAddPreviewComment={handleAddPreviewComment}
            onSubmitComment={handleSubmitComment}
            onCancelForm={handleCancelForm}
            onEditComment={handleEditComment}
            onDeleteComment={deleteComment}
          />
        )}
      </main>

      <Toast toast={toast} />
    </div>
  );
}
