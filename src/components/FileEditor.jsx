import { useState, useRef, useEffect, useCallback } from 'react';
import { modKey } from '../utils/platform';

// Plain-text editor for a whole file, shown in place of its preview. Saving
// hands the text to the caller; the editor stays open with the draft intact
// if that fails, so nothing typed is lost.
export default function FileEditor({
  filePath,
  initialContent,
  onSave,
  onCancel,
}) {
  const [draft, setDraft] = useState(initialContent);
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef(null);
  const dirty = draft !== initialContent;

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onSave(draft);
    } catch {
      // The caller reported the failure; keep the draft on screen
    } finally {
      setSaving(false);
    }
  }, [draft, onSave, saving]);

  const handleCancel = useCallback(() => {
    if (dirty && !confirm(`Discard your edits to ${filePath}?`)) return;
    onCancel();
  }, [dirty, filePath, onCancel]);

  function handleKeyDown(e) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      handleCancel();
    } else if (e.key === 'Tab' && !e.shiftKey) {
      // Keep Tab as an indent inside the file rather than a focus move
      e.preventDefault();
      const { selectionStart, selectionEnd } = e.target;
      setDraft(
        draft.slice(0, selectionStart) + '\t' + draft.slice(selectionEnd),
      );
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (el) el.selectionStart = el.selectionEnd = selectionStart + 1;
      });
    }
  }

  return (
    <div className="file-editor" onClick={(e) => e.stopPropagation()}>
      <textarea
        ref={textareaRef}
        className="file-editor-textarea"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        aria-label={`Edit ${filePath}`}
        disabled={saving}
      />
      <div className="file-editor-actions">
        <span className="file-editor-status">
          {saving ? 'Saving...' : dirty ? 'Unsaved changes' : 'No changes'}
        </span>
        <button
          className="btn btn-sm"
          type="button"
          onClick={handleCancel}
          disabled={saving}
        >
          Cancel
        </button>
        <span className="comment-form-hint">
          <kbd>{modKey}</kbd> + <kbd>Enter</kbd>
        </span>
        <button
          className="btn btn-sm btn-primary"
          type="button"
          onClick={handleSave}
          disabled={saving || !dirty}
        >
          Save
        </button>
      </div>
    </div>
  );
}
