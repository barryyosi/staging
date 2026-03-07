import { useState, useRef, useEffect, useCallback, memo } from 'react';
import { X, Quote, StickyNote } from 'lucide-react';

const isMac =
  typeof navigator !== 'undefined' &&
  navigator.platform.toUpperCase().indexOf('MAC') >= 0;
const modKey = isMac ? '\u2318' : 'Ctrl';

function GeneralNoteSection({
  generalNote,
  isEditing,
  onToggleEdit,
  onSave,
  onClear,
}) {
  const [draft, setDraft] = useState(generalNote || '');
  const textareaRef = useRef(null);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      if (generalNote) {
        textareaRef.current.selectionStart = textareaRef.current.value.length;
      }
    }
  }, [isEditing, generalNote]);

  function handleKeyDown(e) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && draft.trim()) {
      e.preventDefault();
      onSave(draft);
    }
    if (e.key === 'Escape') {
      e.stopPropagation();
      onToggleEdit(false);
    }
  }

  if (isEditing) {
    return (
      <div className="general-note-section">
        <div className="general-note-label">
          <StickyNote size={12} strokeWidth={1.5} />
          General note
        </div>
        <div className="general-note-input-wrap">
          <textarea
            ref={textareaRef}
            className="general-note-textarea"
            placeholder="Write a general review note..."
            rows="3"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="General review note"
          />
          <div className="general-note-actions">
            <button
              className="btn btn-sm"
              onClick={() => onToggleEdit(false)}
              type="button"
            >
              Cancel
            </button>
            <div className="general-note-submit-wrap">
              <span className="comment-form-hint">
                <kbd>{modKey}</kbd> + <kbd>Enter</kbd>
              </span>
              <button
                className="btn btn-sm btn-primary"
                onClick={() => onSave(draft)}
                disabled={!draft.trim()}
                type="button"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (generalNote) {
    return (
      <div className="general-note-section">
        <div className="general-note-label">
          <StickyNote size={12} strokeWidth={1.5} />
          General note
        </div>
        <div
          className="general-note-card panel-comment-item"
          role="button"
          tabIndex={0}
          onClick={() => onToggleEdit(true)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            onToggleEdit(true);
          }}
        >
          <button
            className="panel-dismiss-btn"
            type="button"
            aria-label="Dismiss general note"
            title="Dismiss general note"
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
          >
            <X size={14} strokeWidth={1.5} />
          </button>
          <div className="panel-comment-text">{generalNote}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="general-note-section">
      <button
        className="general-note-empty"
        onClick={() => onToggleEdit(true)}
        type="button"
      >
        <StickyNote size={14} strokeWidth={1.5} />
        Add review note
      </button>
    </div>
  );
}

function CommentPanel({
  id,
  commentsByFile,
  reviewItemCount,
  onDeleteComment,
  onDismissAll,
  onSelectComment,
  generalNote,
  isEditingGeneralNote,
  onToggleEditGeneralNote,
  onSaveGeneralNote,
  onClearGeneralNote,
}) {
  const scrollToComment = useCallback((comment) => {
    if (comment.lineType === 'file') {
      const el = document.querySelector(
        `.file-comment-row[data-comment-id="${comment.id}"]`,
      );
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    } else if (comment.lineType === 'preview') {
      const mark = document.querySelector(
        `mark.preview-highlight[data-comment-id="${comment.id}"]`,
      );
      if (mark) {
        mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      // Fallback: try the bubble
      const bubble = document.querySelector(
        `.preview-comment-bubble[data-comment-id="${comment.id}"]`,
      );
      if (bubble)
        bubble.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      const row = document.querySelector(
        `.comment-row[data-comment-id="${comment.id}"]`,
      );
      if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      const toggle = document.querySelector(
        `.line-num[data-comment-line="${comment.line}"][data-comment-type="${comment.lineType}"] .line-num-comment-toggle`,
      );
      if (toggle instanceof HTMLButtonElement) {
        toggle.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (!toggle.classList.contains('is-open')) toggle.click();
      }
    }
  }, []);

  const handleCommentActivate = useCallback(
    (comment) => {
      scrollToComment(comment);
      onSelectComment?.();
    },
    [onSelectComment, scrollToComment],
  );

  return (
    <aside
      id={id}
      className="comments-dropdown"
      role="dialog"
      aria-label="Comments"
    >
      <div className="panel-header">
        <h2>
          Comments (<span className="comment-count">{reviewItemCount}</span>)
        </h2>
        <button
          className="panel-dismiss-all-btn"
          type="button"
          onClick={onDismissAll}
        >
          Dismiss all
        </button>
      </div>
      <div className="comment-list">
        <GeneralNoteSection
          key={`gn-${isEditingGeneralNote ? 'edit' : 'view'}`}
          generalNote={generalNote}
          isEditing={isEditingGeneralNote}
          onToggleEdit={onToggleEditGeneralNote}
          onSave={onSaveGeneralNote}
          onClear={onClearGeneralNote}
        />
        {Object.entries(commentsByFile).map(([file, fileComments]) => (
          <div key={file} className="panel-comment-group">
            <h3>{file}</h3>
            {fileComments.map((c) => (
              <div
                key={c.id}
                className="panel-comment-item"
                role="button"
                tabIndex={0}
                onClick={() => handleCommentActivate(c)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  handleCommentActivate(c);
                }}
              >
                <button
                  className="panel-dismiss-btn"
                  type="button"
                  aria-label="Dismiss comment"
                  title="Dismiss comment"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteComment(c.id);
                  }}
                >
                  <X size={14} strokeWidth={1.5} />
                </button>
                <div className="panel-line-ref">
                  {c.lineType === 'file' ? (
                    'File comment'
                  ) : c.lineType === 'preview' ? (
                    <span className="panel-quote-ref">
                      <Quote size={12} strokeWidth={1.5} />
                      {c.selectedText?.length > 50
                        ? c.selectedText.slice(0, 50) + '...'
                        : c.selectedText}
                    </span>
                  ) : (
                    `Line ${c.line}`
                  )}
                </div>
                <div className="panel-comment-text">{c.content}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </aside>
  );
}

export default memo(CommentPanel);
