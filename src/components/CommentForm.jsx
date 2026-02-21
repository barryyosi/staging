import { useState, useRef, useEffect } from 'react';

const isMac =
  typeof navigator !== 'undefined' &&
  navigator.platform.toUpperCase().indexOf('MAC') >= 0;
const modKey = isMac ? '\u2318' : 'Ctrl';

export default function CommentForm({
  initialContent,
  onSubmit,
  onCancel,
  stackIndex = 0,
}) {
  const [value, setValue] = useState(initialContent || '');
  const textareaRef = useRef(null);
  const canSubmit = value.trim().length > 0;

  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.focus();
      if (initialContent) {
        ta.selectionStart = ta.value.length;
      }
    }
  }, [initialContent]);

  function handleKeyDown(e) {
    if (canSubmit && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      onSubmit(value);
    }
    if (e.key === 'Escape') {
      onCancel();
    }
  }

  return (
    <tr
      className="comment-form-row"
      style={{ '--comment-stack-index': stackIndex }}
    >
      <td className="comment-form-cell" colSpan="3">
        <div className="comment-form">
          <div className="comment-form-input-wrap">
            <textarea
              ref={textareaRef}
              placeholder="Leave a comment..."
              rows="2"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              aria-label="Comment"
            />
            <div className="comment-form-actions">
              <button className="btn btn-sm" onClick={onCancel} type="button">
                Cancel
              </button>
              <div className="comment-form-submit-wrap">
                <span className="comment-form-hint">
                  <kbd>{modKey}</kbd> + <kbd>Enter</kbd>
                </span>
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() => onSubmit(value)}
                  disabled={!canSubmit}
                  type="button"
                >
                  {initialContent ? 'Save' : 'Comment'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}
