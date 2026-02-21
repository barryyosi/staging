import { memo } from 'react';

function CommentBubble({
  comment,
  onEdit,
  onDelete,
  stackIndex = 0,
  commentIndex = 0,
  commentCount = 1,
  onPrevComment = null,
  onNextComment = null,
}) {
  const location = `${comment.file}:${comment.line}`;
  const showPager = commentCount > 1;

  return (
    <tr
      className="comment-row"
      data-comment-id={comment.id}
      style={{ '--comment-stack-index': stackIndex }}
    >
      <td className="comment-form-cell" colSpan="3">
        <div className="comment-bubble">
          <div className="comment-bubble-head">
            <span className="comment-loc" title={location}>
              {location}
            </span>
            <div className="comment-actions">
              {showPager && (
                <div className="comment-pager" aria-label="Comment navigation">
                  <button
                    type="button"
                    className="comment-pager-btn"
                    onClick={onPrevComment}
                    aria-label="Show previous comment"
                    title="Previous comment"
                  >
                    Prev
                  </button>
                  <span className="comment-pager-index">
                    {commentIndex + 1}/{commentCount}
                  </span>
                  <button
                    type="button"
                    className="comment-pager-btn"
                    onClick={onNextComment}
                    aria-label="Show next comment"
                    title="Next comment"
                  >
                    Next
                  </button>
                </div>
              )}
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
      </td>
    </tr>
  );
}

export default memo(CommentBubble);
