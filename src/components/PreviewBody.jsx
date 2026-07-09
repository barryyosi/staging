import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Quote, MessageSquarePlus } from 'lucide-react';

const isMac =
  typeof navigator !== 'undefined' &&
  navigator.platform.toUpperCase().indexOf('MAC') >= 0;
const modKey = isMac ? '⌘' : 'Ctrl';

function PreviewCommentForm({ initialContent, onSubmit, onCancel }) {
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
  );
}

function PreviewCommentBubble({ comment, onEdit, onDelete }) {
  return (
    <div className="preview-comment-bubble" data-comment-id={comment.id}>
      <div className="comment-bubble">
        <div className="comment-bubble-head">
          <span className="comment-loc" title={comment.selectedText}>
            <Quote size={12} strokeWidth={1.5} />
            {comment.selectedText?.length > 40
              ? comment.selectedText.slice(0, 40) + '...'
              : comment.selectedText}
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

// Walk text nodes and wrap a character range in <mark>
function highlightRange(container, offset, length, commentId) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let charCount = 0;
  let startNode = null;
  let startOffset = 0;
  let endNode = null;
  let endOffset = 0;

  while (walker.nextNode()) {
    const node = walker.currentNode;
    const nodeLen = node.textContent.length;

    if (!startNode && charCount + nodeLen > offset) {
      startNode = node;
      startOffset = offset - charCount;
    }

    if (startNode && charCount + nodeLen >= offset + length) {
      endNode = node;
      endOffset = offset + length - charCount;
      break;
    }

    charCount += nodeLen;
  }

  if (!startNode || !endNode) return;

  try {
    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);

    const mark = document.createElement('mark');
    mark.className = 'preview-highlight';
    mark.dataset.commentId = commentId;
    range.surroundContents(mark);
  } catch {
    // surroundContents can fail if range crosses element boundaries
    // Fallback: just skip this highlight
  }
}

export default function PreviewBody({
  html,
  filePath,
  fileComments,
  activeForm,
  editingComment,
  onAddPreviewComment,
  onSubmitComment,
  onCancelForm,
  onEditComment,
  onDeleteComment,
}) {
  const containerRef = useRef(null);
  const contentRef = useRef(null);
  const [selectionAnchor, setSelectionAnchor] = useState(null);

  const previewComments = useMemo(() => {
    if (!fileComments) return [];
    return fileComments.filter((c) => c.lineType === 'preview');
  }, [fileComments]);

  const handleMouseUp = useCallback(() => {
    // Small delay to let selection finalize
    setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !contentRef.current) {
        setSelectionAnchor(null);
        return;
      }

      if (
        !contentRef.current.contains(sel.anchorNode) ||
        !contentRef.current.contains(sel.focusNode)
      ) {
        setSelectionAnchor(null);
        return;
      }

      const text = sel.toString().trim();
      if (!text) {
        setSelectionAnchor(null);
        return;
      }

      const range = sel.getRangeAt(0);
      const preRange = document.createRange();
      preRange.selectNodeContents(contentRef.current);
      preRange.setEnd(range.startContainer, range.startOffset);
      const offset = preRange.toString().length;

      const rect = range.getBoundingClientRect();
      const containerRect = containerRef.current.getBoundingClientRect();

      setSelectionAnchor({
        text,
        offset,
        length: text.length,
        top: rect.bottom - containerRect.top,
        left: rect.left - containerRect.left + rect.width / 2,
      });
    }, 10);
  }, []);

  const handleCommentClick = useCallback(() => {
    if (!selectionAnchor) return;
    onAddPreviewComment(
      filePath,
      selectionAnchor.text,
      selectionAnchor.offset,
      selectionAnchor.length,
    );
    setSelectionAnchor(null);
    window.getSelection()?.removeAllRanges();
  }, [selectionAnchor, filePath, onAddPreviewComment]);

  // Apply text highlights for existing comments
  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    // Remove old highlights
    content.querySelectorAll('.preview-highlight').forEach((el) => {
      el.replaceWith(...el.childNodes);
    });
    // Normalize text nodes after unwrapping
    content.normalize();

    // Apply highlights in reverse offset order to avoid shifting
    const sorted = [...previewComments]
      .filter((c) => c.textOffset != null && c.textLength != null)
      .sort((a, b) => b.textOffset - a.textOffset);

    for (const comment of sorted) {
      highlightRange(
        content,
        comment.textOffset,
        comment.textLength,
        comment.id,
      );
    }
  }, [previewComments, html]);

  const isPreviewFormActive =
    activeForm?.file === filePath && activeForm?.lineType === 'preview';

  return (
    <div className="preview-container" ref={containerRef}>
      <div
        className="preview-content"
        ref={contentRef}
        onMouseUp={handleMouseUp}
        dangerouslySetInnerHTML={{ __html: html }}
      />

      {selectionAnchor && !isPreviewFormActive && (
        <button
          className="preview-comment-btn"
          style={{ top: selectionAnchor.top + 4, left: selectionAnchor.left }}
          onClick={handleCommentClick}
          type="button"
          title="Add comment"
          aria-label="Add comment on selection"
        >
          <MessageSquarePlus size={16} strokeWidth={1.5} />
        </button>
      )}

      {isPreviewFormActive && !editingComment && (
        <div className="preview-comment-form-wrap">
          <div className="preview-selected-quote">
            {activeForm.selectedText}
          </div>
          <PreviewCommentForm
            initialContent=""
            onSubmit={onSubmitComment}
            onCancel={onCancelForm}
          />
        </div>
      )}

      {previewComments.map((comment) =>
        editingComment?.id === comment.id ? (
          <div key={comment.id} className="preview-comment-form-wrap">
            <PreviewCommentForm
              initialContent={comment.content}
              onSubmit={onSubmitComment}
              onCancel={onCancelForm}
            />
          </div>
        ) : (
          <PreviewCommentBubble
            key={comment.id}
            comment={comment}
            onEdit={onEditComment}
            onDelete={onDeleteComment}
          />
        ),
      )}
    </div>
  );
}
