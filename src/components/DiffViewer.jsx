import {
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
  memo,
  Fragment,
} from 'react';
import {
  RotateCcw,
  MinusCircle,
  Plus,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Quote,
  MessageSquarePlus,
  CheckCircle,
  Circle,
} from 'lucide-react';
import { slugify } from '../utils/escape';
import { highlightLine } from '../utils/highlight';
import { isPreviewable, renderPreview } from '../utils/renderPreview';
import {
  computeGaps,
  buildContextChanges,
  EXPAND_STEP,
} from '../utils/gapCalc';
import CommentForm from './CommentForm';
import CommentBubble from './CommentBubble';
import { MarqueeFileName } from './FileSidebar';

function HunkHeader({ chunk }) {
  return (
    <tr className="diff-hunk-header">
      <td className="line-action" />
      <td className="line-num" />
      <td className="line-content">{chunk.header}</td>
    </tr>
  );
}

function HunkActions({
  filePath,
  chunkIndex,
  chunk,
  onUnstageHunk,
  onRevertHunk,
}) {
  const handleRevert = (e) => {
    e.stopPropagation();
    if (!confirm('Discard this hunk? This cannot be undone.')) return;
    onRevertHunk(filePath, chunkIndex, chunk.oldStart);
  };

  const handleUnstage = (e) => {
    e.stopPropagation();
    onUnstageHunk(filePath, chunkIndex, chunk.oldStart);
  };

  return (
    <div className="hunk-action-pill">
      <button
        className="hunk-action-btn"
        type="button"
        title="Revert hunk"
        aria-label="Revert hunk"
        onClick={handleRevert}
      >
        <RotateCcw size={14} strokeWidth={1.5} />
      </button>
      <button
        className="hunk-action-btn"
        type="button"
        title="Unstage hunk"
        aria-label="Unstage hunk"
        onClick={handleUnstage}
      >
        <MinusCircle size={14} strokeWidth={1.5} />
      </button>
    </div>
  );
}

function DiffLine({
  change,
  filePath,
  onAddComment,
  isLastChange,
  hunkActionsSlot,
  commentCount = 0,
  commentsExpanded = false,
  onToggleComments = null,
}) {
  const lineNum = change.type === 'context' ? change.ln2 : change.ln;

  const html = useMemo(
    () => highlightLine(change.content, filePath),
    [change.content, filePath],
  );

  return (
    <tr className={`diff-line diff-line-${change.type}`}>
      <td className="line-action">
        <button
          className="btn-comment"
          title="Add comment"
          aria-label="Add comment"
          type="button"
          onClick={() => onAddComment(filePath, lineNum, change.type)}
        >
          <Plus size={14} strokeWidth={1.5} />
        </button>
      </td>
      <td
        className={`line-num${commentCount > 0 ? ' has-comments' : ''}`}
        data-comment-line={lineNum}
        data-comment-type={change.type}
      >
        {commentCount > 0 ? (
          <button
            className={`line-num-comment-toggle${commentsExpanded ? ' is-open' : ''}`}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleComments?.();
            }}
            aria-label={`${commentsExpanded ? 'Collapse' : 'Expand'} ${commentCount} comment${commentCount > 1 ? 's' : ''} on line ${lineNum}`}
            title={`${commentCount} comment${commentCount > 1 ? 's' : ''}`}
          >
            <span className="line-num-value">{lineNum}</span>
            <span className="line-comment-indicator">{commentCount}</span>
          </button>
        ) : (
          lineNum
        )}
      </td>
      <td
        className={`line-content${isLastChange ? ' hunk-actions-anchor' : ''}`}
      >
        {html ? (
          <span
            className="line-code"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <span className="line-code">{change.content}</span>
        )}
        {isLastChange && hunkActionsSlot}
      </td>
    </tr>
  );
}

function getGapKey(gap) {
  if (gap.afterChunkIndex === -1) return 'gap-top';
  if (gap.position === 'bottom') return 'gap-bottom';
  return `gap-after-${gap.afterChunkIndex}`;
}

function ExpandRow({ gap, expandedData, onExpand }) {
  const topCount = expandedData?.topLines?.length || 0;
  const bottomCount = expandedData?.bottomLines?.length || 0;
  if (expandedData?.allLines) return null;

  const remaining = gap.lines - topCount - bottomCount;
  if (remaining <= 0) return null;

  const isLoading = expandedData?.isLoading || false;
  const showDirectional = remaining > EXPAND_STEP;

  return (
    <tbody className="expand-tbody">
      <tr className="diff-expand-row">
        <td className="line-action" />
        <td className="line-num" />
        <td className="line-content expand-content">
          <div className="expand-controls">
            {showDirectional && (
              <button
                className="expand-btn"
                type="button"
                onClick={() => onExpand(gap, 'down', EXPAND_STEP)}
                disabled={isLoading}
                title={`Expand ${EXPAND_STEP} lines down`}
              >
                <ChevronDown size={14} strokeWidth={1.5} />
                {EXPAND_STEP}
              </button>
            )}
            <button
              className="expand-btn expand-btn-all"
              type="button"
              onClick={() => onExpand(gap, 'all')}
              disabled={isLoading}
              title={`Expand all ${remaining} hidden lines`}
            >
              <ChevronsUpDown size={14} strokeWidth={1.5} />
              {isLoading ? 'Loading\u2026' : `${remaining} lines`}
            </button>
            {showDirectional && (
              <button
                className="expand-btn"
                type="button"
                onClick={() => onExpand(gap, 'up', EXPAND_STEP)}
                disabled={isLoading}
                title={`Expand ${EXPAND_STEP} lines up`}
              >
                <ChevronUp size={14} strokeWidth={1.5} />
                {EXPAND_STEP}
              </button>
            )}
          </div>
        </td>
      </tr>
    </tbody>
  );
}

// --- Preview sub-components (div-based, not table rows) ---

const isMac =
  typeof navigator !== 'undefined' &&
  navigator.platform.toUpperCase().indexOf('MAC') >= 0;
const modKey = isMac ? '\u2318' : 'Ctrl';

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

function PreviewBody({
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

function DiffViewer({
  file,
  className,
  style,
  fileComments,
  activeForm,
  editingComment,
  onAddComment,
  onAddPreviewComment,
  onSubmitComment,
  onCancelForm,
  onEditComment,
  onDeleteComment,
  onUnstageFile,
  onRevertFile,
  onUnstageHunk,
  onRevertHunk,
  onFileReviewed,
  isReviewed,
  globalCollapsed,
  collapseVersion,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState('diff');
  const [previewHtml, setPreviewHtml] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [expandedGaps, setExpandedGaps] = useState({});
  const expandedGapsRef = useRef(expandedGaps);
  const fileContentCache = useRef(null);
  const bodyRef = useRef(null);

  useEffect(() => {
    expandedGapsRef.current = expandedGaps;
  }, [expandedGaps]);

  // Sync global collapse signal to local state
  const [prevCollapseVersion, setPrevCollapseVersion] =
    useState(collapseVersion);
  if (collapseVersion !== prevCollapseVersion) {
    setPrevCollapseVersion(collapseVersion);
    setCollapsed(globalCollapsed);
  }

  // Clear expanded context when diff data changes (reload/unstage/revert)
  const [prevChunks, setPrevChunks] = useState(file.chunks);
  if (file.chunks !== prevChunks) {
    setPrevChunks(file.chunks);
    setExpandedGaps({});
  }

  useEffect(() => {
    fileContentCache.current = null;
  }, [file.chunks]);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const update = () => {
      body.style.setProperty('--scroll-x', `${body.scrollLeft}px`);
      body.style.setProperty('--body-width', `${body.clientWidth}px`);
      body.style.setProperty('--scroll-width', `${body.scrollWidth}px`);
    };
    body.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(body);
    update();
    return () => {
      body.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, []);

  const filePath = file.to || file.from;
  const canPreview = isPreviewable(filePath);

  const handleToggleReviewed = useCallback(
    (e) => {
      e.stopPropagation();
      const willBeReviewed = !isReviewed;
      if (onFileReviewed) onFileReviewed(filePath, willBeReviewed);
      // Auto-collapse when marking as reviewed
      if (willBeReviewed) {
        setCollapsed(true);
      }
    },
    [filePath, isReviewed, onFileReviewed],
  );

  // Fetch preview content on demand
  useEffect(() => {
    if (viewMode !== 'preview' || previewHtml !== null) return;
    let cancelled = false;

    fetch(`/api/file-content?filePath=${encodeURIComponent(filePath)}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) throw new Error(data.error);
        const html = renderPreview(data.content, filePath);
        setPreviewHtml(html);
      })
      .catch(() => {
        if (!cancelled) setPreviewHtml('<p>Failed to load preview.</p>');
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [viewMode, filePath, previewHtml]);

  // Comments for this file, indexed by line+lineType
  const commentMap = useMemo(() => {
    const map = {};
    if (!fileComments) return map;
    for (const c of fileComments) {
      if (c.lineType === 'preview') continue; // Preview comments are handled separately
      const key = `${c.line}-${c.lineType}`;
      if (!map[key]) map[key] = [];
      map[key].push(c);
    }
    return map;
  }, [fileComments]);

  const activeLineKey =
    activeForm &&
    activeForm.file === filePath &&
    activeForm.lineType !== 'preview'
      ? `${activeForm.line}-${activeForm.lineType}`
      : null;

  const editingLineKey =
    editingComment &&
    editingComment.file === filePath &&
    editingComment.lineType !== 'preview'
      ? `${editingComment.line}-${editingComment.lineType}`
      : null;

  const [expandedCommentLines, setExpandedCommentLines] = useState(
    () => new Set(),
  );
  const [visibleCommentIndexByLine, setVisibleCommentIndexByLine] = useState(
    {},
  );

  const isCommentLineExpanded = useCallback(
    (lineKey) =>
      expandedCommentLines.has(lineKey) ||
      lineKey === activeLineKey ||
      lineKey === editingLineKey,
    [expandedCommentLines, activeLineKey, editingLineKey],
  );

  const toggleCommentLine = useCallback((lineKey) => {
    setExpandedCommentLines((prev) => {
      const next = new Set(prev);
      if (next.has(lineKey)) {
        next.delete(lineKey);
      } else {
        next.add(lineKey);
      }
      return next;
    });
  }, []);

  const getVisibleCommentIndex = useCallback(
    (lineKey, lineComments) => {
      if (!lineComments || lineComments.length === 0) return 0;
      if (editingComment) {
        const editingIdx = lineComments.findIndex(
          (c) => c.id === editingComment.id,
        );
        if (editingIdx >= 0) return editingIdx;
      }
      const storedIdx = visibleCommentIndexByLine[lineKey] ?? 0;
      return Math.max(0, Math.min(storedIdx, lineComments.length - 1));
    },
    [editingComment, visibleCommentIndexByLine],
  );

  const shiftVisibleComment = useCallback(
    (lineKey, lineComments, direction) => {
      const total = lineComments?.length || 0;
      if (total <= 1) return;
      setVisibleCommentIndexByLine((prev) => {
        const current = Math.max(0, Math.min(prev[lineKey] ?? 0, total - 1));
        const next = (current + direction + total) % total;
        if (next === current) return prev;
        return { ...prev, [lineKey]: next };
      });
    },
    [],
  );

  const toggleCollapse = useCallback(() => setCollapsed((c) => !c), []);

  const handleToggleViewMode = useCallback(
    (e) => {
      e.stopPropagation();
      setViewMode((v) => {
        const next = v === 'diff' ? 'preview' : 'diff';
        if (next === 'preview' && previewHtml === null) {
          setPreviewLoading(true);
        }
        return next;
      });
    },
    [previewHtml],
  );

  const handleRevertFile = useCallback(
    (e) => {
      e.stopPropagation();
      if (
        !confirm(`Discard all changes in ${filePath}? This cannot be undone.`)
      )
        return;
      onRevertFile(filePath);
    },
    [filePath, onRevertFile],
  );

  const handleUnstageFile = useCallback(
    (e) => {
      e.stopPropagation();
      onUnstageFile(filePath);
    },
    [filePath, onUnstageFile],
  );

  // --- Expand context ---
  const gaps = useMemo(
    () => computeGaps(file.chunks, file.totalNewLines),
    [file.chunks, file.totalNewLines],
  );

  const gapsByAfterChunk = useMemo(() => {
    const map = {};
    for (const gap of gaps) map[gap.afterChunkIndex] = gap;
    return map;
  }, [gaps]);

  const fetchFileContent = useCallback(async () => {
    if (fileContentCache.current) return fileContentCache.current;
    const res = await fetch(
      `/api/file-content?filePath=${encodeURIComponent(filePath)}`,
    );
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    const lines = data.content.split('\n');
    if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
    fileContentCache.current = lines;
    return lines;
  }, [filePath]);

  const handleExpand = useCallback(
    async (gap, direction, count) => {
      const gapKey = getGapKey(gap);
      setExpandedGaps((prev) => ({
        ...prev,
        [gapKey]: {
          ...(prev[gapKey] || { topLines: [], bottomLines: [] }),
          isLoading: true,
        },
      }));

      try {
        const allFileLines = await fetchFileContent();
        const existing = expandedGapsRef.current[gapKey] || {
          topLines: [],
          bottomLines: [],
        };

        let fetchStart, fetchEnd;
        if (direction === 'all') {
          fetchStart = gap.newStart + existing.topLines.length;
          fetchEnd = gap.newEnd - existing.bottomLines.length;
        } else if (direction === 'down') {
          fetchStart = gap.newStart + existing.topLines.length;
          fetchEnd = Math.min(
            gap.newEnd - existing.bottomLines.length,
            fetchStart + count - 1,
          );
        } else {
          fetchEnd = gap.newEnd - existing.bottomLines.length;
          fetchStart = Math.max(
            gap.newStart + existing.topLines.length,
            fetchEnd - count + 1,
          );
        }

        if (fetchStart > fetchEnd) {
          setExpandedGaps((prev) => ({
            ...prev,
            [gapKey]: { ...(prev[gapKey] || {}), isLoading: false },
          }));
          return;
        }

        const rawLines = allFileLines.slice(fetchStart - 1, fetchEnd);
        const oldStartLine = gap.oldStart + (fetchStart - gap.newStart);
        const changes = buildContextChanges(rawLines, fetchStart, oldStartLine);

        setExpandedGaps((prev) => {
          const curr = prev[gapKey] || { topLines: [], bottomLines: [] };
          if (direction === 'all') {
            return {
              ...prev,
              [gapKey]: {
                allLines: [...curr.topLines, ...changes, ...curr.bottomLines],
                isLoading: false,
              },
            };
          } else if (direction === 'down') {
            return {
              ...prev,
              [gapKey]: {
                ...curr,
                topLines: [...curr.topLines, ...changes],
                isLoading: false,
              },
            };
          } else {
            return {
              ...prev,
              [gapKey]: {
                ...curr,
                bottomLines: [...changes, ...curr.bottomLines],
                isLoading: false,
              },
            };
          }
        });
      } catch {
        setExpandedGaps((prev) => ({
          ...prev,
          [gapKey]: { ...(prev[gapKey] || {}), isLoading: false },
        }));
      }
    },
    [fetchFileContent],
  );

  function renderExpandedContext(lines, key) {
    if (!lines || lines.length === 0) return null;
    return (
      <tbody key={key} className="expanded-context-tbody">
        {lines.map((change) => {
          const lineNum = change.ln2;
          const lineKey = `${lineNum}-context`;
          const lineComments = commentMap[lineKey];
          const commentCount = lineComments?.length || 0;
          const commentsExpanded = isCommentLineExpanded(lineKey);
          const visibleIdx = getVisibleCommentIndex(lineKey, lineComments);
          const visibleComment = lineComments?.[visibleIdx];
          return (
            <Fragment key={`exp-${lineNum}`}>
              <DiffLine
                change={change}
                filePath={filePath}
                onAddComment={onAddComment}
                isLastChange={false}
                hunkActionsSlot={null}
                commentCount={commentCount}
                commentsExpanded={commentsExpanded}
                onToggleComments={() => toggleCommentLine(lineKey)}
              />
              {lineComments &&
                commentsExpanded &&
                visibleComment &&
                (editingComment?.id === visibleComment.id ? (
                  <CommentForm
                    key={`edit-${visibleComment.id}`}
                    initialContent={visibleComment.content}
                    onSubmit={onSubmitComment}
                    onCancel={onCancelForm}
                    stackIndex={0}
                  />
                ) : (
                  <CommentBubble
                    key={`comment-${visibleComment.id}`}
                    comment={visibleComment}
                    onEdit={onEditComment}
                    onDelete={onDeleteComment}
                    stackIndex={0}
                    commentIndex={visibleIdx}
                    commentCount={commentCount}
                    onPrevComment={() =>
                      shiftVisibleComment(lineKey, lineComments, -1)
                    }
                    onNextComment={() =>
                      shiftVisibleComment(lineKey, lineComments, 1)
                    }
                  />
                ))}
              {activeForm &&
                !editingComment &&
                activeForm.file === filePath &&
                String(activeForm.line) === String(lineNum) &&
                activeForm.lineType === 'context' &&
                commentsExpanded && (
                  <CommentForm
                    key={`new-${lineNum}`}
                    initialContent=""
                    onSubmit={onSubmitComment}
                    onCancel={onCancelForm}
                    stackIndex={visibleComment ? 1 : 0}
                  />
                )}
            </Fragment>
          );
        })}
      </tbody>
    );
  }

  function renderGap(gap) {
    const gapKey = getGapKey(gap);
    const data = expandedGaps[gapKey];
    return (
      <Fragment key={gapKey}>
        {renderExpandedContext(data?.topLines, `${gapKey}-top`)}
        {data?.allLines ? (
          renderExpandedContext(data.allLines, `${gapKey}-all`)
        ) : (
          <ExpandRow gap={gap} expandedData={data} onExpand={handleExpand} />
        )}
        {renderExpandedContext(data?.bottomLines, `${gapKey}-bottom`)}
      </Fragment>
    );
  }

  return (
    <div
      className={`diff-file${className ? ` ${className}` : ''}`}
      style={style}
      id={`file-${slugify(filePath)}`}
      data-file-path={filePath}
    >
      <div
        className={`diff-file-header ${collapsed ? 'collapsed' : ''}`}
        onClick={toggleCollapse}
      >
        <span className={`file-status ${file.status}`}>{file.status}</span>
        <MarqueeFileName title={filePath} className="file-path">
          {filePath}
        </MarqueeFileName>
        <span className="file-stats">
          {file.additions > 0 && <span className="add">+{file.additions}</span>}
          {file.deletions > 0 && <span className="del">-{file.deletions}</span>}
        </span>
        {canPreview && (
          <button
            className="view-mode-toggle"
            type="button"
            onClick={handleToggleViewMode}
            aria-label={`Switch to ${viewMode === 'diff' ? 'preview' : 'diff'} mode`}
          >
            <span
              className={`view-mode-option${viewMode === 'diff' ? ' active' : ''}`}
            >
              Diff
            </span>
            <span
              className={`view-mode-option${viewMode === 'preview' ? ' active' : ''}`}
            >
              Preview
            </span>
            <span
              className="view-mode-thumb"
              style={{
                transform:
                  viewMode === 'preview' ? 'translateX(100%)' : 'translateX(0)',
              }}
            />
          </button>
        )}
        <div className="file-actions">
          <button
            className={`file-action-btn file-action-reviewed${isReviewed ? ' is-reviewed' : ''}`}
            type="button"
            title={isReviewed ? 'Mark as unreviewed' : 'Mark as reviewed'}
            aria-label={isReviewed ? 'Mark as unreviewed' : 'Mark as reviewed'}
            onClick={handleToggleReviewed}
          >
            {isReviewed ? (
              <CheckCircle size={18} strokeWidth={1.5} />
            ) : (
              <Circle size={18} strokeWidth={1.5} />
            )}
          </button>
          <button
            className="file-action-btn"
            type="button"
            title="Revert file"
            aria-label="Revert file"
            onClick={handleRevertFile}
          >
            <RotateCcw size={18} strokeWidth={1.5} />
          </button>
          <button
            className="file-action-btn"
            type="button"
            title="Unstage file"
            aria-label="Unstage file"
            onClick={handleUnstageFile}
          >
            <MinusCircle size={18} strokeWidth={1.5} />
          </button>
          <button
            className="file-action-btn file-action-collapse"
            type="button"
            title={collapsed ? 'Expand' : 'Collapse'}
            aria-label={collapsed ? 'Expand file' : 'Collapse file'}
          >
            <ChevronUp
              size={18}
              strokeWidth={1.5}
              style={{
                transform: collapsed ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.2s',
              }}
            />
          </button>
        </div>
      </div>

      <div
        ref={bodyRef}
        className={`diff-file-body ${collapsed ? 'collapsed' : ''}`}
      >
        {viewMode === 'diff' ? (
          file.isBinary ? (
            <div className="binary-notice">Binary file not shown</div>
          ) : (
            <table className="diff-table">
              {gapsByAfterChunk[-1] && renderGap(gapsByAfterChunk[-1])}
              {file.chunks.map((chunk, ci) => (
                <Fragment key={ci}>
                  <tbody className="hunk-tbody">
                    <ChunkRows
                      chunk={chunk}
                      chunkIndex={ci}
                      filePath={filePath}
                      commentMap={commentMap}
                      activeForm={activeForm}
                      editingComment={editingComment}
                      onAddComment={onAddComment}
                      onSubmitComment={onSubmitComment}
                      onCancelForm={onCancelForm}
                      onEditComment={onEditComment}
                      onDeleteComment={onDeleteComment}
                      onUnstageHunk={onUnstageHunk}
                      onRevertHunk={onRevertHunk}
                      isCommentLineExpanded={isCommentLineExpanded}
                      onToggleCommentLine={toggleCommentLine}
                      getVisibleCommentIndex={getVisibleCommentIndex}
                      onShiftVisibleComment={shiftVisibleComment}
                    />
                  </tbody>
                  {gapsByAfterChunk[ci] && renderGap(gapsByAfterChunk[ci])}
                </Fragment>
              ))}
            </table>
          )
        ) : previewLoading ? (
          <div className="preview-loading">Loading preview...</div>
        ) : (
          <PreviewBody
            html={previewHtml}
            filePath={filePath}
            fileComments={fileComments}
            activeForm={activeForm}
            editingComment={editingComment}
            onAddPreviewComment={onAddPreviewComment}
            onSubmitComment={onSubmitComment}
            onCancelForm={onCancelForm}
            onEditComment={onEditComment}
            onDeleteComment={onDeleteComment}
          />
        )}
      </div>
    </div>
  );
}

function ChunkRows({
  chunk,
  chunkIndex,
  filePath,
  commentMap,
  activeForm,
  editingComment,
  onAddComment,
  onSubmitComment,
  onCancelForm,
  onEditComment,
  onDeleteComment,
  onUnstageHunk,
  onRevertHunk,
  isCommentLineExpanded,
  onToggleCommentLine,
  getVisibleCommentIndex,
  onShiftVisibleComment,
}) {
  const rows = [];

  rows.push(<HunkHeader key={`hunk-${chunk.header}`} chunk={chunk} />);

  // Find the last add/del line to attach the action pill
  let lastChangeIdx = -1;
  for (let i = chunk.changes.length - 1; i >= 0; i--) {
    if (chunk.changes[i].type === 'add' || chunk.changes[i].type === 'del') {
      lastChangeIdx = i;
      break;
    }
  }

  const actionsSlot = (
    <HunkActions
      filePath={filePath}
      chunkIndex={chunkIndex}
      chunk={chunk}
      onUnstageHunk={onUnstageHunk}
      onRevertHunk={onRevertHunk}
    />
  );

  for (let i = 0; i < chunk.changes.length; i++) {
    const change = chunk.changes[i];
    const lineNum = change.type === 'context' ? change.ln2 : change.ln;
    const lineKey = `${lineNum}-${change.type}`;
    const isLastChange = i === lastChangeIdx;
    const lineComments = commentMap[lineKey];
    const commentCount = lineComments?.length || 0;
    const commentsExpanded = isCommentLineExpanded(lineKey);
    const visibleIdx = getVisibleCommentIndex(lineKey, lineComments);
    const visibleComment = lineComments?.[visibleIdx];

    rows.push(
      <DiffLine
        key={`line-${i}`}
        change={change}
        filePath={filePath}
        onAddComment={onAddComment}
        isLastChange={isLastChange}
        hunkActionsSlot={isLastChange ? actionsSlot : null}
        commentCount={commentCount}
        commentsExpanded={commentsExpanded}
        onToggleComments={() => onToggleCommentLine(lineKey)}
      />,
    );

    // Show existing comments for this line
    if (lineComments && commentsExpanded && visibleComment) {
      // If editing this comment, show form instead
      if (editingComment && editingComment.id === visibleComment.id) {
        rows.push(
          <CommentForm
            key={`edit-${visibleComment.id}`}
            initialContent={visibleComment.content}
            onSubmit={onSubmitComment}
            onCancel={onCancelForm}
            stackIndex={0}
          />,
        );
      } else {
        rows.push(
          <CommentBubble
            key={`comment-${visibleComment.id}`}
            comment={visibleComment}
            onEdit={onEditComment}
            onDelete={onDeleteComment}
            stackIndex={0}
            commentIndex={visibleIdx}
            commentCount={commentCount}
            onPrevComment={() =>
              onShiftVisibleComment(lineKey, lineComments, -1)
            }
            onNextComment={() =>
              onShiftVisibleComment(lineKey, lineComments, 1)
            }
          />,
        );
      }
    }

    // Show new comment form after this line
    if (
      activeForm &&
      !editingComment &&
      activeForm.file === filePath &&
      String(activeForm.line) === String(lineNum) &&
      activeForm.lineType === change.type &&
      commentsExpanded
    ) {
      rows.push(
        <CommentForm
          key="new-form"
          initialContent=""
          onSubmit={onSubmitComment}
          onCancel={onCancelForm}
          stackIndex={visibleComment ? 1 : 0}
        />,
      );
    }
  }

  return <>{rows}</>;
}

export default memo(DiffViewer);
