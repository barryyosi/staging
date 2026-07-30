import { useState, useRef, useEffect } from 'react';
import { modKey } from '../utils/platform';

export function FileCommentBubble({ comment, onEdit, onDelete }) {
  const location = `${comment.file}`;
  return (
    <div className="file-comment-row" data-comment-id={comment.id}>
      <div className="comment-bubble">
        <div className="comment-bubble-head">
          <span className="comment-loc" title={location}>
            {location}
          </span>
          <div className="comment-actions">
            <button type="button" onClick={() => onEdit(comment)}>
              Edit
            </button>
            <button
              type="button"
              className="comment-action-delete"
              onClick={() => onDelete(comment.id)}
            >
              Delete
            </button>
          </div>
        </div>
        <div className="comment-text">{comment.content}</div>
      </div>
    </div>
  );
}

export function FileCommentForm({ initialContent, onSubmit, onCancel }) {
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
    <div className="file-comment-row">
      <div className="comment-form">
        <div className="comment-form-input-wrap">
          <textarea
            ref={textareaRef}
            placeholder="Leave a file comment..."
            rows="2"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="File comment"
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
    </div>
  );
}
