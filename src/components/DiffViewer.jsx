import { useState, useCallback, useMemo, memo } from 'react';
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

function DiffLine({ change, filePath, onAddComment }) {
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
      <td className="line-content">
        <span className="line-prefix">{prefix}</span>
        {change.content}
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
}) {
  const [collapsed, setCollapsed] = useState(false);
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
      </div>

      <div className={`diff-file-body ${collapsed ? 'collapsed' : ''}`}>
        {file.isBinary ? (
          <div className="binary-notice">Binary file not shown</div>
        ) : (
          <table className="diff-table">
            <tbody>
              {file.chunks.map((chunk, ci) => (
                <ChunkRows
                  key={ci}
                  chunk={chunk}
                  filePath={filePath}
                  commentMap={commentMap}
                  activeForm={activeForm}
                  editingComment={editingComment}
                  onAddComment={onAddComment}
                  onSubmitComment={onSubmitComment}
                  onCancelForm={onCancelForm}
                  onEditComment={onEditComment}
                  onDeleteComment={onDeleteComment}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function ChunkRows({
  chunk,
  filePath,
  commentMap,
  activeForm,
  editingComment,
  onAddComment,
  onSubmitComment,
  onCancelForm,
  onEditComment,
  onDeleteComment,
}) {
  const rows = [];

  rows.push(<HunkHeader key={`hunk-${chunk.header}`} chunk={chunk} />);

  for (let i = 0; i < chunk.changes.length; i++) {
    const change = chunk.changes[i];
    const lineNum = change.type === 'context' ? change.ln2 : change.ln;
    const key = `${lineNum}-${change.type}`;

    rows.push(
      <DiffLine
        key={`line-${i}`}
        change={change}
        filePath={filePath}
        onAddComment={onAddComment}
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
