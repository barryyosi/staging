import { memo } from 'react';

function CommentBubble({ comment, onEdit, onDelete }) {
  const location = `${comment.file}:${comment.line}`;

  return (
    <tr className="comment-row" data-comment-id={comment.id}>
      <td className="comment-form-cell" colSpan="3">
        <div className="comment-bubble">
          <div className="comment-bubble-head">
            <span className="comment-loc" title={location}>{location}</span>
            <div className="comment-actions">
              <button type="button" onClick={() => onEdit(comment)}>Edit</button>
              <button type="button" className="comment-action-delete" onClick={() => onDelete(comment.id)}>Delete</button>
            </div>
          </div>
          <div className="comment-text">{comment.content}</div>
        </div>
      </td>
    </tr>
  );
}

export default memo(CommentBubble);
