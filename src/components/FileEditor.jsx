import { useState, useRef, useEffect, useCallback } from 'react';
import { modKey } from '../utils/platform';

// Unsaved drafts live in sessionStorage for the life of the tab, so the
// editor being unmounted underneath the user (a diff reload, a view toggle)
// does not lose what they typed: the next open of the same file restores it
function readDraft(key) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeDraft(key, text) {
  try {
    sessionStorage.setItem(key, text);
  } catch {
    // Storage unavailable: the draft only lives in the component
  }
}

function clearDraft(key) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Nothing to clear
  }
}

// Plain-text editor for a whole file, shown in place of its preview. Saving
// hands the text to the caller; the editor stays open with the draft intact
// if that fails, so nothing typed is lost.
export default function FileEditor({
  filePath,
  initialContent,
  onSave,
  onCancel,
}) {
  const draftKey = `staging-draft:${filePath}`;
  const [draft, setDraft] = useState(() => {
    const stored = readDraft(draftKey);
    return stored !== null && stored !== initialContent
      ? stored
      : initialContent;
  });
  const [restored] = useState(() => draft !== initialContent);
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef(null);
  const dirty = draft !== initialContent;

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    if (dirty) writeDraft(draftKey, draft);
    else clearDraft(draftKey);
  }, [draft, dirty, draftKey]);

  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onSave(draft);
      clearDraft(draftKey);
    } catch {
      // The caller reported the failure; keep the draft on screen
    } finally {
      setSaving(false);
    }
  }, [draft, draftKey, onSave, saving]);

  const handleCancel = useCallback(() => {
    if (dirty && !confirm(`Discard your edits to ${filePath}?`)) return;
    clearDraft(draftKey);
    onCancel();
  }, [dirty, draftKey, filePath, onCancel]);

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
          {saving
            ? 'Saving...'
            : dirty
              ? restored
                ? 'Restored unsaved draft'
                : 'Unsaved changes'
              : 'No changes'}
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
