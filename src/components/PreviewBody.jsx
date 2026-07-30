import {
  Fragment,
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
} from 'react';
import { Quote, MessageSquarePlus, Plus } from 'lucide-react';
import { modKey } from '../utils/platform';
import {
  anchorComments,
  resolveAnchor,
  resolveTextOffset,
} from '../utils/anchorComments';

// `value` is owned by PreviewBody so that a live reload re-anchoring the form
// to a different block (which remounts it) cannot destroy an in-progress draft.
function PreviewCommentForm({ value, isEdit, onChange, onSubmit, onCancel }) {
  const textareaRef = useRef(null);
  const canSubmit = value.trim().length > 0;

  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.focus();
      ta.selectionStart = ta.value.length;
    }
    // Focus on mount only — refocusing on every keystroke would fight the caret
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          onChange={(e) => onChange(e.target.value)}
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
              {isEdit ? 'Save' : 'Comment'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewCommentBubble({ comment, onEdit, onDelete }) {
  const quote = comment.selectedText || comment.anchorText || '';
  return (
    <div className="preview-comment-bubble" data-comment-id={comment.id}>
      <div className="comment-bubble">
        <div className="comment-bubble-head">
          <span className="comment-loc" title={quote}>
            <Quote size={12} strokeWidth={1.5} />
            {quote.length > 40 ? quote.slice(0, 40) + '...' : quote}
            {comment.srcLine != null && (
              <span className="preview-comment-line">L{comment.srcLine}</span>
            )}
            {comment.isStale && (
              <span
                className="preview-comment-stale"
                title="The content this comment was anchored to has changed"
              >
                edited
              </span>
            )}
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
  blocks,
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
  const selectionTimerRef = useRef(null);
  const [selectionAnchor, setSelectionAnchor] = useState(null);
  const [draft, setDraft] = useState('');

  const previewComments = useMemo(() => {
    if (!fileComments) return [];
    return fileComments.filter((c) => c.lineType === 'preview');
  }, [fileComments]);

  const { byBlock, unanchored } = useMemo(
    () => anchorComments(previewComments, blocks || []),
    [previewComments, blocks],
  );

  const isPreviewFormActive =
    activeForm?.file === filePath && activeForm?.lineType === 'preview';
  const isEditingPreview =
    !!editingComment && editingComment.lineType === 'preview';

  // Reset the draft whenever a different form opens. Doing it in render (the
  // same pattern DiffViewer uses for collapseVersion) keeps the textarea from
  // flashing the previous body for a frame.
  const formKey = isEditingPreview
    ? editingComment.id
    : isPreviewFormActive
      ? 'new'
      : null;
  const [prevFormKey, setPrevFormKey] = useState(formKey);
  if (formKey !== prevFormKey) {
    setPrevFormKey(formKey);
    setDraft(isEditingPreview ? editingComment.content : '');
  }

  // The pending form re-anchors exactly like a stored comment, so a live
  // reload can move it with its block instead of unmounting it and losing
  // the draft.
  const pendingBlockIndex = useMemo(() => {
    if (!isPreviewFormActive || editingComment) return null;
    const resolved = resolveAnchor(activeForm, blocks || []);
    return resolved ? resolved.blockIndex : -1;
  }, [isPreviewFormActive, editingComment, activeForm, blocks]);

  const handleMouseUp = useCallback(() => {
    // Small delay to let selection finalize
    if (selectionTimerRef.current) clearTimeout(selectionTimerRef.current);
    selectionTimerRef.current = setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !contentRef.current) {
        setSelectionAnchor(null);
        return;
      }

      const range = sel.getRangeAt(0);
      const startEl =
        range.startContainer.nodeType === Node.TEXT_NODE
          ? range.startContainer.parentElement
          : range.startContainer;
      const bodyEl = startEl?.closest?.('.preview-block-body');
      if (!bodyEl || !contentRef.current.contains(bodyEl)) {
        setSelectionAnchor(null);
        return;
      }

      const blockEl = bodyEl.parentElement;
      const blockIndex = Number(blockEl.dataset.blockIndex);
      const block = blocks?.[blockIndex];
      if (!block) {
        setSelectionAnchor(null);
        return;
      }

      // Offset within this block's plain text — not the whole document
      const preRange = document.createRange();
      preRange.selectNodeContents(bodyEl);
      preRange.setEnd(range.startContainer, range.startOffset);
      const offset = preRange.toString().length;

      // Clamp to the block: a cross-block drag truncates to the first block.
      // Length comes from the Range, not the Selection — Selection.toString()
      // returns layout-rendered text (tabs between table cells, collapsed
      // whitespace) which would not line up with textContent offsets.
      const blockText = bodyEl.textContent;
      const text = blockText.slice(offset, offset + range.toString().length);
      if (!text.trim()) {
        setSelectionAnchor(null);
        return;
      }

      const rect = range.getBoundingClientRect();
      const containerRect = containerRef.current.getBoundingClientRect();

      setSelectionAnchor({
        text,
        offset,
        length: text.length,
        blockIndex,
        srcLine: block.srcLine,
        anchorText: block.anchorText,
        top: rect.bottom - containerRect.top,
        left: rect.left - containerRect.left + rect.width / 2,
      });
    }, 10);
  }, [blocks]);

  useEffect(
    () => () => {
      if (selectionTimerRef.current) clearTimeout(selectionTimerRef.current);
    },
    [],
  );

  const handleCommentClick = useCallback(() => {
    if (!selectionAnchor) return;
    onAddPreviewComment(filePath, {
      blockIndex: selectionAnchor.blockIndex,
      srcLine: selectionAnchor.srcLine,
      anchorText: selectionAnchor.anchorText,
      selectedText: selectionAnchor.text,
      textOffset: selectionAnchor.offset,
      textLength: selectionAnchor.length,
    });
    setSelectionAnchor(null);
    window.getSelection()?.removeAllRanges();
  }, [selectionAnchor, filePath, onAddPreviewComment]);

  const handleBlockComment = useCallback(
    (block) => {
      onAddPreviewComment(filePath, {
        blockIndex: block.index,
        srcLine: block.srcLine,
        anchorText: block.anchorText,
      });
    },
    [filePath, onAddPreviewComment],
  );

  // Apply text highlights for existing comments.
  // Every DOM mutation here is confined to .preview-block-body, which React
  // owns via dangerouslySetInnerHTML and never reconciles into — unwrapping or
  // normalizing text nodes in the React-rendered bubbles alongside them would
  // corrupt reconciliation.
  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const bodies = content.querySelectorAll('.preview-block-body');
    for (const bodyEl of bodies) {
      // Remove old highlights, then normalize the text nodes left behind
      bodyEl.querySelectorAll('.preview-highlight').forEach((el) => {
        el.replaceWith(...el.childNodes);
      });
      bodyEl.normalize();
    }

    for (const [blockIndex, items] of byBlock) {
      const bodyEl = content.querySelector(
        `.preview-block[data-block-index="${blockIndex}"] > .preview-block-body`,
      );
      if (!bodyEl) continue;
      const blockText = bodyEl.textContent;
      // Apply in reverse offset order to avoid shifting
      const withOffsets = items
        .map((c) => ({ c, off: resolveTextOffset(blockText, c) }))
        .filter((x) => x.off >= 0)
        .sort((a, b) => b.off - a.off);
      for (const { c, off } of withOffsets) {
        highlightRange(bodyEl, off, c.textLength, c.id);
      }
    }
  }, [byBlock]);

  const renderBubbleOrForm = (comment) =>
    editingComment?.id === comment.id ? (
      <div key={comment.id} className="preview-comment-form-wrap">
        <PreviewCommentForm
          value={draft}
          isEdit
          onChange={setDraft}
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
    );

  const newCommentForm = (
    <div className="preview-comment-form-wrap">
      {activeForm?.selectedText && (
        <div className="preview-selected-quote">{activeForm.selectedText}</div>
      )}
      <PreviewCommentForm
        value={draft}
        onChange={setDraft}
        onSubmit={onSubmitComment}
        onCancel={onCancelForm}
      />
    </div>
  );

  const renderItemsFor = (blockIndex) => {
    const items = byBlock.get(blockIndex) || [];
    const showForm = pendingBlockIndex === blockIndex;
    if (items.length === 0 && !showForm) return null;
    return (
      <>
        {items.map(renderBubbleOrForm)}
        {showForm && newCommentForm}
      </>
    );
  };

  // A pending form whose block vanished mid-draft (-1) still has to go
  // somewhere, or the user's typing is silently discarded
  const showOrphanedForm = pendingBlockIndex === -1;

  return (
    <div
      className="preview-container"
      data-file-path={filePath}
      ref={containerRef}
    >
      <div
        className="preview-content"
        ref={contentRef}
        onMouseUp={handleMouseUp}
      >
        {(blocks || []).map((block) => (
          <Fragment key={block.index}>
            <div className="preview-block" data-block-index={block.index}>
              <button
                className="preview-block-add"
                type="button"
                title="Add comment"
                aria-label={
                  block.srcLine != null
                    ? `Comment on line ${block.srcLine}`
                    : `Comment on block ${block.index + 1}${
                        block.anchorText ? `: ${block.anchorText}` : ''
                      }`
                }
                onClick={() => handleBlockComment(block)}
              >
                <Plus size={14} strokeWidth={1.5} />
              </button>
              <div
                className="preview-block-body"
                dangerouslySetInnerHTML={{ __html: block.html }}
              />
            </div>
            {renderItemsFor(block.index)}
          </Fragment>
        ))}
      </div>

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

      {(unanchored.length > 0 || showOrphanedForm) && (
        <div className="preview-unanchored">
          <div className="preview-unanchored-label">
            Comments on content that changed
          </div>
          {unanchored.map(renderBubbleOrForm)}
          {showOrphanedForm && newCommentForm}
        </div>
      )}
    </div>
  );
}
