import { useCallback, memo } from 'react';
import { X, Quote } from 'lucide-react';

function CommentPanel({
  commentsByFile,
  commentCount,
  onDeleteComment,
  onDismissAll,
  onSelectComment,
}) {
  const scrollToComment = useCallback((comment) => {
    if (comment.lineType === 'preview') {
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
      if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  return (
    <aside className="comments-dropdown" role="dialog" aria-label="Comments">
      <div className="panel-header">
        <h2>
          Comments (<span className="comment-count">{commentCount}</span>)
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
        {Object.entries(commentsByFile).map(([file, fileComments]) => (
          <div key={file} className="panel-comment-group">
            <h3>{file}</h3>
            {fileComments.map((c) => (
              <div
                key={c.id}
                className="panel-comment-item"
                onClick={() => {
                  scrollToComment(c);
                  onSelectComment?.();
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
                  <X size={14} strokeWidth={2.5} />
                </button>
                <div className="panel-line-ref">
                  {c.lineType === 'preview' ? (
                    <span className="panel-quote-ref">
                      <Quote size={12} strokeWidth={2.5} />
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
