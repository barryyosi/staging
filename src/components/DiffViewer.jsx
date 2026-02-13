import { useState, useCallback, useMemo, useEffect, memo } from 'react';
import { slugify } from '../utils/escape';
import CommentForm from './CommentForm';
import CommentBubble from './CommentBubble';

function HunkHeader({ chunk }) {
  return (
    <tr className="diff-hunk-header">
      <td className="line-action" />
      <td className="line-num old" />
      <td className="line-num new" />
      <td className="line-content">{chunk.header}</td>
    </tr>
  );
}

function HunkActions({ filePath, chunkIndex, chunk, onUnstageHunk, onRevertHunk }) {
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
    <div className="hunk-actions">
      <button
        className="hunk-action-btn"
        type="button"
        title="Revert hunk"
        aria-label="Revert hunk"
        onClick={handleRevert}
      >
        <span className="material-symbols-rounded">undo</span>
      </button>
      <button
        className="hunk-action-btn"
        type="button"
        title="Unstage hunk"
        aria-label="Unstage hunk"
        onClick={handleUnstage}
      >
        <span className="material-symbols-rounded">remove</span>
      </button>
    </div>
  );
}

function DiffLine({ change, filePath, onAddComment, isLastChange, hunkActionsSlot }) {
  let oldNum = '';
  let newNum = '';
  let lineNum;

  if (change.type === 'context') {
    oldNum = change.ln1;
    newNum = change.ln2;
    lineNum = change.ln2;
  } else if (change.type === 'del') {
    oldNum = change.ln;
    lineNum = change.ln;
  } else if (change.type === 'add') {
    newNum = change.ln;
    lineNum = change.ln;
  }

  const prefix = change.type === 'add' ? '+' : change.type === 'del' ? '-' : ' ';

  return (
    <tr className={`diff-line diff-line-${change.type}`}>
      <td className="line-action">
        <button
          className="btn-comment material-symbols-rounded"
          title="Add comment"
          aria-label="Add comment"
          type="button"
          onClick={() => onAddComment(filePath, lineNum, change.type)}
        >
          add
        </button>
      </td>
      <td className="line-num old">{oldNum}</td>
      <td className="line-num new">{newNum}</td>
      <td className={`line-content${isLastChange ? ' hunk-actions-anchor' : ''}`}>
        <span className="line-prefix">{prefix}</span>
        {change.content}
        {isLastChange && hunkActionsSlot}
      </td>
    </tr>
  );
}

function DiffViewer({
  file,
  fileComments,
  activeForm,
  editingComment,
  onAddComment,
  onSubmitComment,
  onCancelForm,
  onEditComment,
  onDeleteComment,
  onUnstageFile,
  onRevertFile,
  onUnstageHunk,
  onRevertHunk,
  globalCollapsed,
  collapseVersion,
}) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (collapseVersion > 0) {
      setCollapsed(globalCollapsed);
    }
  }, [collapseVersion]);
  const filePath = file.to || file.from;

  // Comments for this file, indexed by line+lineType
  const commentMap = useMemo(() => {
    const map = {};
    if (!fileComments) return map;
    for (const c of fileComments) {
      const key = `${c.line}-${c.lineType}`;
      if (!map[key]) map[key] = [];
      map[key].push(c);
    }
    return map;
  }, [fileComments]);

  const toggleCollapse = useCallback(() => setCollapsed(c => !c), []);

  const handleRevertFile = useCallback((e) => {
    e.stopPropagation();
    if (!confirm(`Discard all changes in ${filePath}? This cannot be undone.`)) return;
    onRevertFile(filePath);
  }, [filePath, onRevertFile]);

  const handleUnstageFile = useCallback((e) => {
    e.stopPropagation();
    onUnstageFile(filePath);
  }, [filePath, onUnstageFile]);

  return (
    <div className="diff-file" id={`file-${slugify(filePath)}`}>
      <div
        className={`diff-file-header ${collapsed ? 'collapsed' : ''}`}
        onClick={toggleCollapse}
      >
        <span className="collapse-icon">&#9660;</span>
        <span className={`file-status ${file.status}`}>{file.status}</span>
        <span className="file-path">{filePath}</span>
        <span className="file-stats">
          {file.additions > 0 && <span className="add">+{file.additions}</span>}
          {file.deletions > 0 && <span className="del">-{file.deletions}</span>}
        </span>
        <div className="file-actions">
          <button
            className="file-action-btn"
            type="button"
            title="Revert file"
            aria-label="Revert file"
            onClick={handleRevertFile}
          >
            <span className="material-symbols-rounded">undo</span>
          </button>
          <button
            className="file-action-btn"
            type="button"
            title="Unstage file"
            aria-label="Unstage file"
            onClick={handleUnstageFile}
          >
            <span className="material-symbols-rounded">remove</span>
          </button>
        </div>
      </div>

      <div className={`diff-file-body ${collapsed ? 'collapsed' : ''}`}>
        {file.isBinary ? (
          <div className="binary-notice">Binary file not shown</div>
        ) : (
          <table className="diff-table">
            {file.chunks.map((chunk, ci) => (
              <tbody key={ci} className="hunk-tbody">
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
                />
              </tbody>
            ))}
          </table>
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
}) {
  const rows = [];

  rows.push(<HunkHeader key={`hunk-${chunk.header}`} chunk={chunk} />);

  // Find the index of the last add/del change to attach the action buttons
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
    const key = `${lineNum}-${change.type}`;
    const isLastChange = i === lastChangeIdx;

    rows.push(
      <DiffLine
        key={`line-${i}`}
        change={change}
        filePath={filePath}
        onAddComment={onAddComment}
        isLastChange={isLastChange}
        hunkActionsSlot={isLastChange ? actionsSlot : null}
      />
    );

    // Show existing comments for this line
    const lineComments = commentMap[key];
    if (lineComments) {
      for (const comment of lineComments) {
        // If editing this comment, show form instead
        if (editingComment && editingComment.id === comment.id) {
          rows.push(
            <CommentForm
              key={`edit-${comment.id}`}
              initialContent={comment.content}
              onSubmit={onSubmitComment}
              onCancel={onCancelForm}
            />
          );
        } else {
          rows.push(
            <CommentBubble
              key={`comment-${comment.id}`}
              comment={comment}
              onEdit={onEditComment}
              onDelete={onDeleteComment}
            />
          );
        }
      }
    }

    // Show new comment form after this line
    if (
      activeForm &&
      !editingComment &&
      activeForm.file === filePath &&
      String(activeForm.line) === String(lineNum) &&
      activeForm.lineType === change.type
    ) {
      rows.push(
        <CommentForm
          key="new-form"
          initialContent=""
          onSubmit={onSubmitComment}
          onCancel={onCancelForm}
        />
      );
    }
  }

  return <>{rows}</>;
}

export default memo(DiffViewer);
