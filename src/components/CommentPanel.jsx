import { useCallback, memo } from 'react';

function CommentPanel({ commentsByFile, commentCount, visible }) {
  const scrollToComment = useCallback((id) => {
    const row = document.querySelector(`.comment-row[data-comment-id="${id}"]`);
    if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  if (!visible) return null;

  return (
    <aside id="comment-panel">
      <h2>Comments (<span id="comment-count">{commentCount}</span>)</h2>
      <div id="comment-list">
        {Object.entries(commentsByFile).map(([file, fileComments]) => (
          <div key={file} className="panel-comment-group">
            <h3>{file}</h3>
            {fileComments.map(c => (
              <div
                key={c.id}
                className="panel-comment-item"
                onClick={() => scrollToComment(c.id)}
              >
                <div className="panel-line-ref">Line {c.line}</div>
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
