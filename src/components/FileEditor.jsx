import { useState, useRef, useEffect } from 'react';

const isMac =
  typeof navigator !== 'undefined' &&
  navigator.platform.toUpperCase().indexOf('MAC') >= 0;
const modKey = isMac ? '\u2318' : 'Ctrl';

export default function FileEditor({ filePath, onSave, onCancel, isSaving }) {
  const [content, setContent] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/file-content-working-tree?filePath=${encodeURIComponent(filePath)}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) throw new Error(data.error);
        setContent(data.content);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [filePath]);

  useEffect(() => {
    if (content !== null && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [content]);

  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !isSaving) {
      e.preventDefault();
      onSave(content);
    }
  }

  if (loadError) {
    return (
      <div className="file-editor">
        <div className="file-editor-error">Failed to load file: {loadError}</div>
        <div className="file-editor-toolbar">
          <button className="btn btn-sm" type="button" onClick={onCancel}>
            Close
          </button>
        </div>
      </div>
    );
  }

  if (content === null) {
    return (
      <div className="file-editor">
        <div className="file-editor-loading">Loading file…</div>
      </div>
    );
  }

  return (
    <div className="file-editor">
      <textarea
        ref={textareaRef}
        className="file-editor-textarea"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        disabled={isSaving}
        aria-label={`Edit ${filePath}`}
      />
      <div className="file-editor-toolbar">
        <span className="file-editor-hint">
          <kbd>{modKey}</kbd> + <kbd>Enter</kbd> to save &nbsp;·&nbsp; <kbd>Esc</kbd> to cancel
        </span>
        <div className="file-editor-actions">
          <button
            className="btn btn-sm"
            type="button"
            onClick={onCancel}
            disabled={isSaving}
          >
            Cancel
          </button>
          <button
            className="btn btn-sm btn-primary"
            type="button"
            onClick={() => onSave(content)}
            disabled={isSaving}
          >
            {isSaving ? 'Saving…' : 'Save & Stage'}
          </button>
        </div>
      </div>
    </div>
  );
}
