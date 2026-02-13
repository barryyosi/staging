import { useCallback, memo } from 'react';
import { slugify } from '../utils/escape';

function FileList({ files }) {
  const scrollTo = useCallback((id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  if (!files) return (
    <nav id="file-list">
      <h2>Files</h2>
    </nav>
  );

  return (
    <nav id="file-list">
      <h2>Files</h2>
      <ul id="file-list-items">
        {files.map(file => {
          const filePath = file.to || file.from;
          const targetId = `file-${slugify(filePath)}`;
          return (
            <li
              key={filePath}
              className="file-list-item"
              onClick={() => scrollTo(targetId)}
            >
              <span className={`status-dot ${file.status}`} />
              <span className="file-name">{filePath}</span>
              <span className="stats">
                {file.additions > 0 && <span className="add">+{file.additions}</span>}
                {file.deletions > 0 && <span className="del">-{file.deletions}</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export default memo(FileList);
