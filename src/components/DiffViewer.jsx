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
  PlusCircle,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  MessageSquarePlus,
  CheckCircle,
  Circle,
} from 'lucide-react';
import { slugify } from '../utils/escape';
import { highlightLine } from '../utils/highlight';
import { isPreviewable, renderPreviewBlocks } from '../utils/renderPreview';
import {
  computeGaps,
  buildContextChanges,
  EXPAND_STEP,
} from '../utils/gapCalc';
import CommentForm from './CommentForm';
import CommentBubble from './CommentBubble';
import { FileCommentBubble, FileCommentForm } from './FileComments';
import PreviewBody from './PreviewBody';
import { MarqueeFileName } from './FileSidebar';

function HunkHeader({ chunk, colSpan = 3 }) {
  return (
    <tr className="diff-hunk-header">
      <td className="line-action" />
      <td className="line-num" />
      <td className="line-content" colSpan={colSpan - 2}>
        {chunk.header}
      </td>
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

function UnstagedHunkActions({ filePath, chunkIndex, chunk, onStageHunk }) {
  const handleStage = (e) => {
    e.stopPropagation();
    onStageHunk(filePath, chunkIndex, chunk.oldStart);
  };

  return (
    <div className="hunk-action-pill">
      <button
        className="hunk-action-btn"
        type="button"
        title="Stage hunk"
        aria-label="Stage hunk"
        onClick={handleStage}
      >
        <PlusCircle size={14} strokeWidth={1.5} />
      </button>
    </div>
  );
}

function LineEditInput({ content, onConfirm, onCancel }) {
  const [value, setValue] = useState(content);
  const inputRef = useRef(null);

  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.focus();
      el.select();
    }
  }, []);

  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      onConfirm(value);
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  }

  return (
    <span className="line-edit-wrap">
      <input
        ref={inputRef}
        className="line-edit-input"
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        aria-label="Edit line"
      />
      <span className="line-edit-actions">
        <button
          type="button"
          className="line-edit-btn line-edit-confirm"
          onClick={() => onConfirm(value)}
          title="Approve edit (Enter)"
          aria-label="Approve edit"
        >
          <Check size={14} strokeWidth={1.8} />
        </button>
        <button
          type="button"
          className="line-edit-btn line-edit-cancel"
          onClick={onCancel}
          title="Decline edit (Esc)"
          aria-label="Decline edit"
        >
          <X size={14} strokeWidth={1.8} />
        </button>
      </span>
    </span>
  );
}

// Renders the three diff cells (action / line-num / content) for a single
// change. Shared by the unified DiffLine and the side-by-side SplitDiffRow so
// both layouts keep identical highlighting, comment, and inline-edit behavior.
function DiffLineCells({
  change,
  filePath,
  onAddComment,
  isLastChange,
  hunkActionsSlot,
  commentCount = 0,
  commentsExpanded = false,
  onToggleComments = null,
  isEditing = false,
  onConfirmEdit = null,
  onCancelEdit = null,
  displayLineNum = null,
}) {
  // Canonical line number used for comment keys / add-comment calls (context
  // keys on the new-side number, ln2). `displayLineNum` overrides only the
  // visible number, so the old (left) side of a split can show ln1.
  const lineNum = change.type === 'context' ? change.ln2 : change.ln;
  const shownLineNum = displayLineNum ?? lineNum;

  const html = useMemo(
    () => highlightLine(change.content, filePath),
    [change.content, filePath],
  );

  return (
    <>
      <td className="line-action">
        {!isEditing && (
          <button
            className="btn-comment"
            title="Add comment"
            aria-label="Add comment"
            type="button"
            onClick={() => onAddComment(filePath, lineNum, change.type)}
          >
            <Plus size={14} strokeWidth={1.5} />
          </button>
        )}
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
            <span className="line-num-value">{shownLineNum}</span>
            <span className="line-comment-indicator">{commentCount}</span>
          </button>
        ) : (
          shownLineNum
        )}
      </td>
      <td
        className={`line-content${isLastChange ? ' hunk-actions-anchor' : ''}${isEditing ? ' is-editing' : ''}`}
      >
        {isEditing ? (
          <LineEditInput
            content={change.content}
            onConfirm={onConfirmEdit}
            onCancel={onCancelEdit}
          />
        ) : (
          <>
            {html ? (
              <span
                className="line-code"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            ) : (
              <span className="line-code">{change.content}</span>
            )}
            {isLastChange && hunkActionsSlot}
          </>
        )}
      </td>
    </>
  );
}

// Empty placeholder cells for the half of a split row that has no line (e.g.
// an addition with no paired deletion).
function EmptyCells({ isLastChange = false, hunkActionsSlot = null }) {
  return (
    <>
      <td className="line-action line-filler" />
      <td className="line-num line-filler" />
      <td
        className={`line-content line-filler${isLastChange ? ' hunk-actions-anchor' : ''}`}
      >
        {isLastChange && hunkActionsSlot}
      </td>
    </>
  );
}

function DiffLine(props) {
  const { change, isEditing = false, onStartEdit = null } = props;
  const lineNum = change.type === 'context' ? change.ln2 : change.ln;
  const canEdit =
    onStartEdit != null &&
    !isEditing &&
    (change.type === 'add' || change.type === 'context');

  return (
    <tr
      className={`diff-line diff-line-${change.type}${isEditing ? ' is-editing' : ''}`}
      onDoubleClick={
        canEdit
          ? () => onStartEdit(lineNum, change.type, change.content)
          : undefined
      }
    >
      <DiffLineCells {...props} />
    </tr>
  );
}

// One row of a side-by-side split diff: an old-side change on the left and a
// new-side change on the right. Either side may be null (rendered as filler).
function SplitDiffRow({
  left,
  right,
  filePath,
  onAddComment,
  leftCommentCount = 0,
  rightCommentCount = 0,
  leftCommentsExpanded = false,
  rightCommentsExpanded = false,
  onToggleLeftComments = null,
  onToggleRightComments = null,
  isLastChange = false,
  hunkActionsSlot = null,
  editingLineNum = null,
  onStartEditLine = null,
  onConfirmEditLine = null,
  onCancelEditLine = null,
}) {
  // Inline editing applies to the new (right) side only, matching the unified
  // view where only add/context lines are editable.
  const rightLineNum = right
    ? right.type === 'context'
      ? right.ln2
      : right.ln
    : null;
  const rightEditing =
    right != null && editingLineNum != null && editingLineNum === rightLineNum;
  const canEditRight =
    right != null &&
    onStartEditLine != null &&
    !rightEditing &&
    (right.type === 'add' || right.type === 'context');

  const leftType = left ? left.type : 'empty';
  const rightType = right ? right.type : 'empty';

  return (
    <tr
      className={`diff-line diff-split-line split-left-${leftType} split-right-${rightType}`}
      onDoubleClick={
        canEditRight
          ? () => onStartEditLine(rightLineNum, right.type, right.content)
          : undefined
      }
    >
      {left ? (
        <DiffLineCells
          change={left}
          filePath={filePath}
          onAddComment={onAddComment}
          isLastChange={false}
          hunkActionsSlot={null}
          commentCount={leftCommentCount}
          commentsExpanded={leftCommentsExpanded}
          onToggleComments={onToggleLeftComments}
          displayLineNum={left.type === 'context' ? left.ln1 : null}
        />
      ) : (
        <EmptyCells />
      )}
      {right ? (
        <DiffLineCells
          change={right}
          filePath={filePath}
          onAddComment={onAddComment}
          isLastChange={isLastChange}
          hunkActionsSlot={hunkActionsSlot}
          commentCount={rightCommentCount}
          commentsExpanded={rightCommentsExpanded}
          onToggleComments={onToggleRightComments}
          isEditing={rightEditing}
          onConfirmEdit={
            rightEditing
              ? (newContent) => onConfirmEditLine(rightLineNum, newContent)
              : null
          }
          onCancelEdit={onCancelEditLine}
        />
      ) : (
        <EmptyCells
          isLastChange={isLastChange}
          hunkActionsSlot={hunkActionsSlot}
        />
      )}
    </tr>
  );
}

function getGapKey(gap) {
  if (gap.afterChunkIndex === -1) return 'gap-top';
  if (gap.position === 'bottom') return 'gap-bottom';
  return `gap-after-${gap.afterChunkIndex}`;
}

function ExpandRow({ gap, expandedData, onExpand, colSpan = 3 }) {
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
        <td className="line-content expand-content" colSpan={colSpan - 2}>
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
  onStageHunk,
  onEditLine,
  onFileReviewed,
  isReviewed,
  globalCollapsed,
  collapseVersion,
  diffLayout = 'unified',
}) {
  const isSplit = diffLayout === 'split';
  const RowsComponent = isSplit ? SplitChunkRows : ChunkRows;
  const [collapsed, setCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState('diff');
  const [previewBlocks, setPreviewBlocks] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [editingLine, setEditingLine] = useState(null); // { lineNum, lineType, content }
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

  // Clear expanded context and any active line edit when diff data changes
  const [prevChunks, setPrevChunks] = useState(file.chunks);
  if (file.chunks !== prevChunks) {
    setPrevChunks(file.chunks);
    setExpandedGaps({});
    if (editingLine !== null) setEditingLine(null);
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
    if (viewMode !== 'preview' || previewBlocks !== null) return;
    let cancelled = false;

    fetch(`/api/file-content?filePath=${encodeURIComponent(filePath)}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) throw new Error(data.error);
        setPreviewBlocks(renderPreviewBlocks(data.content, filePath));
      })
      .catch(() => {
        if (!cancelled)
          setPreviewBlocks([
            {
              index: 0,
              type: 'html',
              html: '<p>Failed to load preview.</p>',
              srcLine: null,
              anchorText: '',
            },
          ]);
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [viewMode, filePath, previewBlocks]);

  // Comments for this file, indexed by line+lineType
  const commentMap = useMemo(() => {
    const map = {};
    if (!fileComments) return map;
    for (const c of fileComments) {
      if (c.lineType === 'preview' || c.lineType === 'file') continue;
      const key = `${c.line}-${c.lineType}`;
      if (!map[key]) map[key] = [];
      map[key].push(c);
    }
    return map;
  }, [fileComments]);

  const fileLevelComments = useMemo(() => {
    if (!fileComments) return [];
    return fileComments.filter((c) => c.lineType === 'file');
  }, [fileComments]);

  const activeLineKey =
    activeForm &&
    activeForm.file === filePath &&
    activeForm.lineType !== 'preview' &&
    activeForm.lineType !== 'file'
      ? `${activeForm.line}-${activeForm.lineType}`
      : null;

  const editingLineKey =
    editingComment &&
    editingComment.file === filePath &&
    editingComment.lineType !== 'preview' &&
    editingComment.lineType !== 'file'
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

  useEffect(() => {
    if (expandedCommentLines.size === 0) return;
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        setExpandedCommentLines(new Set());
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [expandedCommentLines]);

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
        if (next === 'preview' && previewBlocks === null) {
          setPreviewLoading(true);
        }
        return next;
      });
    },
    [previewBlocks],
  );

  const handleStartEditLine = useCallback((lineNum, lineType, content) => {
    setEditingLine({ lineNum, lineType, content });
  }, []);

  const handleConfirmEditLine = useCallback(
    async (lineNum, newContent) => {
      try {
        await onEditLine(filePath, lineNum, newContent);
        setEditingLine(null);
      } catch {
        // keep editing active on error so the user can retry
      }
    },
    [filePath, onEditLine],
  );

  const handleCancelEditLine = useCallback(() => {
    setEditingLine(null);
  }, []);

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
    const colSpan = isSplit ? 6 : 3;
    return (
      <tbody key={key} className="expanded-context-tbody">
        {lines.map((change) => {
          const lineNum = change.ln2;
          const lineKey = `${lineNum}-context`;
          const commentCount = commentMap[lineKey]?.length || 0;
          const commentsExpanded = isCommentLineExpanded(lineKey);
          const commentRows = lineCommentRows({
            lineKey,
            lineNum,
            lineType: 'context',
            colSpan,
            keyPrefix: `exp${lineNum}-`,
            commentMap,
            activeForm,
            editingComment,
            filePath,
            onSubmitComment,
            onCancelForm,
            onEditComment,
            onDeleteComment,
            isCommentLineExpanded,
            getVisibleCommentIndex,
            onShiftVisibleComment: shiftVisibleComment,
          });
          return (
            <Fragment key={`exp-${lineNum}`}>
              {isSplit ? (
                <SplitDiffRow
                  left={change}
                  right={change}
                  filePath={filePath}
                  onAddComment={onAddComment}
                  leftCommentCount={0}
                  rightCommentCount={commentCount}
                  rightCommentsExpanded={commentsExpanded}
                  onToggleRightComments={() => toggleCommentLine(lineKey)}
                />
              ) : (
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
              )}
              {commentRows}
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
          <ExpandRow
            gap={gap}
            expandedData={data}
            onExpand={handleExpand}
            colSpan={isSplit ? 6 : 3}
          />
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
            className={`file-action-btn${fileLevelComments.length > 0 ? ' has-file-comments' : ''}`}
            type="button"
            title="Add file comment"
            aria-label="Add file comment"
            onClick={(e) => {
              e.stopPropagation();
              onAddComment(filePath, 0, 'file');
            }}
          >
            <MessageSquarePlus size={18} strokeWidth={1.5} />
            {fileLevelComments.length > 0 && (
              <span className="file-comment-badge">
                {fileLevelComments.length}
              </span>
            )}
          </button>
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

      {(fileLevelComments.length > 0 ||
        (activeForm &&
          activeForm.file === filePath &&
          activeForm.lineType === 'file') ||
        (editingComment &&
          editingComment.file === filePath &&
          editingComment.lineType === 'file')) && (
        <div className="file-comments-section">
          {fileLevelComments.map((c) => {
            const isEditing = editingComment && editingComment.id === c.id;
            if (isEditing) {
              return (
                <FileCommentForm
                  key={`edit-${c.id}`}
                  initialContent={c.content}
                  onSubmit={onSubmitComment}
                  onCancel={onCancelForm}
                />
              );
            }
            return (
              <FileCommentBubble
                key={c.id}
                comment={c}
                onEdit={onEditComment}
                onDelete={onDeleteComment}
              />
            );
          })}
          {activeForm &&
            activeForm.file === filePath &&
            activeForm.lineType === 'file' &&
            !editingComment && (
              <FileCommentForm
                onSubmit={onSubmitComment}
                onCancel={onCancelForm}
              />
            )}
        </div>
      )}

      <div
        ref={bodyRef}
        className={`diff-file-body ${collapsed ? 'collapsed' : ''}`}
      >
        {viewMode === 'diff' ? (
          file.isBinary ? (
            <div className="binary-notice">Binary file not shown</div>
          ) : (
            <table
              className={`diff-table${isSplit ? ' diff-table-split' : ''}`}
            >
              {gapsByAfterChunk[-1] && renderGap(gapsByAfterChunk[-1])}
              {file.chunks.map((chunk, ci) => (
                <Fragment key={ci}>
                  <tbody className="hunk-tbody">
                    <RowsComponent
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
                      editingLine={editingLine}
                      onStartEditLine={handleStartEditLine}
                      onConfirmEditLine={handleConfirmEditLine}
                      onCancelEditLine={handleCancelEditLine}
                      isCommentLineExpanded={isCommentLineExpanded}
                      onToggleCommentLine={toggleCommentLine}
                      getVisibleCommentIndex={getVisibleCommentIndex}
                      onShiftVisibleComment={shiftVisibleComment}
                    />
                  </tbody>
                  {gapsByAfterChunk[ci] && renderGap(gapsByAfterChunk[ci])}
                </Fragment>
              ))}
              {file.unstagedChunks?.length > 0 && (
                <>
                  <tbody className="unstaged-section-header">
                    <tr>
                      <td className="line-action" />
                      <td className="line-num" />
                      <td className="line-content" colSpan={isSplit ? 4 : 1}>
                        UNSTAGED CHANGES
                      </td>
                    </tr>
                  </tbody>
                  {file.unstagedChunks.map((chunk, ci) => (
                    <tbody
                      key={`unstaged-${ci}`}
                      className="hunk-tbody unstaged-hunk-tbody"
                    >
                      <RowsComponent
                        chunk={chunk}
                        chunkIndex={ci}
                        filePath={filePath}
                        commentMap={{}}
                        activeForm={null}
                        editingComment={null}
                        onAddComment={() => {}}
                        onSubmitComment={() => {}}
                        onCancelForm={() => {}}
                        onEditComment={() => {}}
                        onDeleteComment={() => {}}
                        onUnstageHunk={null}
                        onRevertHunk={null}
                        onStageHunk={onStageHunk}
                        isUnstaged={true}
                        isCommentLineExpanded={() => false}
                        onToggleCommentLine={() => {}}
                        getVisibleCommentIndex={() => 0}
                        onShiftVisibleComment={() => {}}
                      />
                    </tbody>
                  ))}
                </>
              )}
            </table>
          )
        ) : previewLoading ? (
          <div className="preview-loading">Loading preview...</div>
        ) : (
          <PreviewBody
            blocks={previewBlocks}
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

// Builds the full-width comment bubble / form rows shown beneath a diff line.
// Shared by both the unified and split layouts; `colSpan` covers the table
// width (3 unified, 6 split) and `keyPrefix` keeps React keys unique when a
// split row renders comments for both its sides.
function lineCommentRows({
  lineKey,
  lineNum,
  lineType,
  colSpan = 3,
  keyPrefix = '',
  commentMap,
  activeForm,
  editingComment,
  filePath,
  onSubmitComment,
  onCancelForm,
  onEditComment,
  onDeleteComment,
  isCommentLineExpanded,
  getVisibleCommentIndex,
  onShiftVisibleComment,
}) {
  const rows = [];
  if (!isCommentLineExpanded(lineKey)) return rows;

  const lineComments = commentMap[lineKey];
  const commentCount = lineComments?.length || 0;
  const visibleIdx = getVisibleCommentIndex(lineKey, lineComments);
  const visibleComment = lineComments?.[visibleIdx];

  if (lineComments && visibleComment) {
    if (editingComment && editingComment.id === visibleComment.id) {
      rows.push(
        <CommentForm
          key={`${keyPrefix}edit-${visibleComment.id}`}
          colSpan={colSpan}
          initialContent={visibleComment.content}
          onSubmit={onSubmitComment}
          onCancel={onCancelForm}
          stackIndex={0}
        />,
      );
    } else {
      rows.push(
        <CommentBubble
          key={`${keyPrefix}comment-${visibleComment.id}`}
          colSpan={colSpan}
          comment={visibleComment}
          onEdit={onEditComment}
          onDelete={onDeleteComment}
          stackIndex={0}
          commentIndex={visibleIdx}
          commentCount={commentCount}
          onPrevComment={() => onShiftVisibleComment(lineKey, lineComments, -1)}
          onNextComment={() => onShiftVisibleComment(lineKey, lineComments, 1)}
        />,
      );
    }
  }

  if (
    activeForm &&
    !editingComment &&
    activeForm.file === filePath &&
    String(activeForm.line) === String(lineNum) &&
    activeForm.lineType === lineType
  ) {
    rows.push(
      <CommentForm
        key={`${keyPrefix}new-${lineKey}`}
        colSpan={colSpan}
        initialContent=""
        onSubmit={onSubmitComment}
        onCancel={onCancelForm}
        stackIndex={visibleComment ? 1 : 0}
      />,
    );
  }

  return rows;
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
  onStageHunk,
  isUnstaged = false,
  editingLine = null,
  onStartEditLine = null,
  onConfirmEditLine = null,
  onCancelEditLine = null,
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

  const actionsSlot = isUnstaged ? (
    <UnstagedHunkActions
      filePath={filePath}
      chunkIndex={chunkIndex}
      chunk={chunk}
      onStageHunk={onStageHunk}
    />
  ) : (
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

    const isEditingThisLine = editingLine?.lineNum === lineNum;
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
        isEditing={isEditingThisLine}
        onStartEdit={onStartEditLine}
        onConfirmEdit={
          isEditingThisLine
            ? (newContent) => onConfirmEditLine(lineNum, newContent)
            : null
        }
        onCancelEdit={onCancelEditLine}
      />,
    );

    rows.push(
      ...lineCommentRows({
        lineKey,
        lineNum,
        lineType: change.type,
        commentMap,
        activeForm,
        editingComment,
        filePath,
        onSubmitComment,
        onCancelForm,
        onEditComment,
        onDeleteComment,
        isCommentLineExpanded,
        getVisibleCommentIndex,
        onShiftVisibleComment,
      }),
    );
  }

  return <>{rows}</>;
}

// Side-by-side equivalent of ChunkRows: pairs deletions (left) with additions
// (right) and aligns context lines on both sides.
function SplitChunkRows({
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
  onStageHunk,
  isUnstaged = false,
  editingLine = null,
  onStartEditLine = null,
  onConfirmEditLine = null,
  onCancelEditLine = null,
  isCommentLineExpanded,
  onToggleCommentLine,
  getVisibleCommentIndex,
  onShiftVisibleComment,
}) {
  const rows = [];
  const SPLIT_COLSPAN = 6;

  rows.push(
    <HunkHeader
      key={`hunk-${chunk.header}`}
      chunk={chunk}
      colSpan={SPLIT_COLSPAN}
    />,
  );

  const actionsSlot = isUnstaged ? (
    <UnstagedHunkActions
      filePath={filePath}
      chunkIndex={chunkIndex}
      chunk={chunk}
      onStageHunk={onStageHunk}
    />
  ) : (
    <HunkActions
      filePath={filePath}
      chunkIndex={chunkIndex}
      chunk={chunk}
      onUnstageHunk={onUnstageHunk}
      onRevertHunk={onRevertHunk}
    />
  );

  // Build aligned [left, right] pairs. Consecutive del/add runs are buffered
  // and paired positionally; context lines flush the buffer and align on both
  // sides. The last add/del change anchors the hunk action pill.
  const pairs = [];
  let dels = [];
  let adds = [];
  const flush = () => {
    const n = Math.max(dels.length, adds.length);
    for (let k = 0; k < n; k++) {
      pairs.push({ left: dels[k] || null, right: adds[k] || null });
    }
    dels = [];
    adds = [];
  };
  let lastChangeIndex = -1;
  for (const change of chunk.changes) {
    if (change.type === 'del') {
      dels.push(change);
    } else if (change.type === 'add') {
      adds.push(change);
    } else {
      flush();
      pairs.push({ left: change, right: change });
    }
  }
  flush();
  for (let i = pairs.length - 1; i >= 0; i--) {
    const r = pairs[i].right;
    const l = pairs[i].left;
    if (
      (r && (r.type === 'add' || r.type === 'del')) ||
      (l && l.type === 'del')
    ) {
      lastChangeIndex = i;
      break;
    }
  }

  pairs.forEach((pair, i) => {
    const { left, right } = pair;
    const leftLineNum = left
      ? left.type === 'context'
        ? left.ln2
        : left.ln
      : null;
    const leftKey = left ? `${leftLineNum}-${left.type}` : null;
    const rightLineNum = right
      ? right.type === 'context'
        ? right.ln2
        : right.ln
      : null;
    const rightKey = right ? `${rightLineNum}-${right.type}` : null;
    const isLastChange = i === lastChangeIndex;

    // Context lines share one comment key (the new-side ln2): show the comment
    // affordance on the right cell only, avoiding a duplicate indicator.
    const leftIsContext = left && left.type === 'context';

    rows.push(
      <SplitDiffRow
        key={`split-${i}`}
        left={left}
        right={right}
        filePath={filePath}
        onAddComment={onAddComment}
        leftCommentCount={
          leftKey && !leftIsContext ? commentMap[leftKey]?.length || 0 : 0
        }
        rightCommentCount={rightKey ? commentMap[rightKey]?.length || 0 : 0}
        leftCommentsExpanded={
          leftKey && !leftIsContext ? isCommentLineExpanded(leftKey) : false
        }
        rightCommentsExpanded={
          rightKey ? isCommentLineExpanded(rightKey) : false
        }
        onToggleLeftComments={
          leftKey ? () => onToggleCommentLine(leftKey) : null
        }
        onToggleRightComments={
          rightKey ? () => onToggleCommentLine(rightKey) : null
        }
        isLastChange={isLastChange}
        hunkActionsSlot={isLastChange ? actionsSlot : null}
        editingLineNum={editingLine?.lineNum ?? null}
        onStartEditLine={onStartEditLine}
        onConfirmEditLine={onConfirmEditLine}
        onCancelEditLine={onCancelEditLine}
      />,
    );

    // Comment rows for the left (deletion) side, then the right side. Context
    // lines only key on the right side.
    if (leftKey && !leftIsContext && left.type === 'del') {
      rows.push(
        ...lineCommentRows({
          lineKey: leftKey,
          lineNum: leftLineNum,
          lineType: left.type,
          colSpan: SPLIT_COLSPAN,
          keyPrefix: `l${i}-`,
          commentMap,
          activeForm,
          editingComment,
          filePath,
          onSubmitComment,
          onCancelForm,
          onEditComment,
          onDeleteComment,
          isCommentLineExpanded,
          getVisibleCommentIndex,
          onShiftVisibleComment,
        }),
      );
    }
    if (rightKey) {
      rows.push(
        ...lineCommentRows({
          lineKey: rightKey,
          lineNum: rightLineNum,
          lineType: right.type,
          colSpan: SPLIT_COLSPAN,
          keyPrefix: `r${i}-`,
          commentMap,
          activeForm,
          editingComment,
          filePath,
          onSubmitComment,
          onCancelForm,
          onEditComment,
          onDeleteComment,
          isCommentLineExpanded,
          getVisibleCommentIndex,
          onShiftVisibleComment,
        }),
      );
    }
  });

  return <>{rows}</>;
}

export default memo(DiffViewer);
