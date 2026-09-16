import { useState, useRef, useEffect, useCallback, memo } from 'react';
import { X, Quote, StickyNote, History } from 'lucide-react';
import { modKey } from '../utils/platform';
import { describeLines } from '../utils/format';
import { slugify } from '../utils/escape';

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

// Stale comments (see useComments) are listed apart from the live ones: their
// file changed since they were written, so the line they name may no longer
// exist and they are not sent to the agent
function splitStale(commentsByFile) {
  const pending = [];
  const stale = [];
  for (const [file, comments] of Object.entries(commentsByFile)) {
    const live = comments.filter((c) => !c.stale);
    const old = comments.filter((c) => c.stale);
    if (live.length > 0) pending.push([file, live]);
    if (old.length > 0) stale.push([file, old]);
  }
  return { pending, stale };
}

function CommentLocation({ comment }) {
  if (comment.lineType === 'file') return 'File comment';
  if (comment.lineType === 'preview') {
    // Quote only, no line number: the panel reads the store, whose srcLine
    // goes stale as soon as the document is edited above the comment. The
    // bubble and the agent payload resolve it against the current render;
    // showing the stored one here would contradict both.
    const label = comment.selectedText || comment.anchorText || '';
    return (
      <span className="panel-quote-ref">
        <Quote size={12} strokeWidth={1.5} />
        {label.length > 50 ? label.slice(0, 50) + '...' : label}
      </span>
    );
  }
  return describeLines(comment);
}

function CommentItem({ comment, onActivate, onDelete }) {
  return (
    <div
      className={`panel-comment-item${comment.stale ? ' is-stale' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => onActivate(comment)}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onActivate(comment);
      }}
    >
      <button
        className="panel-dismiss-btn"
        type="button"
        aria-label="Dismiss comment"
        title="Dismiss comment"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(comment.id);
        }}
      >
        <X size={14} strokeWidth={1.5} />
      </button>
      <div className="panel-line-ref">
        <CommentLocation comment={comment} />
      </div>
      <div className="panel-comment-text">{comment.content}</div>
    </div>
  );
}

function CommentPanel({
  id,
  commentsByFile,
  reviewItemCount,
  staleCount = 0,
  onDeleteComment,
  onDismissAll,
  onClearStale,
  onSelectComment,
  onSelectFile,
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
      if (bubble) {
        bubble.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      // Block comments without a highlight: scroll to the block itself.
      // data-block-index is only unique within one preview, so scope the query
      // to this comment's file — otherwise a file still showing its diff would
      // resolve to a different file's block at the same index.
      // Pre-existing limitation: this resolves nothing when the file is
      // collapsed or showing the diff instead of the preview.
      // Matched by property rather than an attribute selector so a path
      // containing a quote or backslash can't throw a selector SyntaxError
      const container = [
        ...document.querySelectorAll('.preview-container[data-file-path]'),
      ].find((el) => el.dataset.filePath === comment.file);
      const block = container?.querySelector(
        `.preview-block[data-block-index="${comment.blockIndex}"]`,
      );
      if (block) block.scrollIntoView({ behavior: 'smooth', block: 'center' });
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

  // A stale comment has nothing inline to land on; the file it names is the
  // closest thing, when it is still in the diff
  const handleStaleActivate = useCallback(
    (comment) => {
      if (onSelectFile) {
        onSelectFile(comment.file);
      } else {
        const node = document.getElementById(`file-${slugify(comment.file)}`);
        if (node) node.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      onSelectComment?.();
    },
    [onSelectComment, onSelectFile],
  );

  const { pending, stale } = splitStale(commentsByFile);

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
        {pending.map(([file, fileComments]) => (
          <div key={file} className="panel-comment-group">
            <h3>{file}</h3>
            {fileComments.map((c) => (
              <CommentItem
                key={c.id}
                comment={c}
                onActivate={handleCommentActivate}
                onDelete={onDeleteComment}
              />
            ))}
          </div>
        ))}
        {stale.length > 0 && (
          <section className="panel-stale-section" aria-label="Stale comments">
            <div className="panel-stale-header">
              <span className="panel-stale-title">
                <History size={12} strokeWidth={1.5} />
                Stale ({staleCount})
              </span>
              <button
                className="panel-dismiss-all-btn"
                type="button"
                onClick={onClearStale}
              >
                Clear stale
              </button>
            </div>
            <p className="panel-stale-hint">
              From an earlier review; these files changed since. Not sent to the
              agent.
            </p>
            {stale.map(([file, fileComments]) => (
              <div key={file} className="panel-comment-group">
                <h3>{file}</h3>
                {fileComments.map((c) => (
                  <CommentItem
                    key={c.id}
                    comment={c}
                    onActivate={handleStaleActivate}
                    onDelete={onDeleteComment}
                  />
                ))}
              </div>
            ))}
          </section>
        )}
      </div>
    </aside>
  );
}

export default memo(CommentPanel);
