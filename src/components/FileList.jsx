import { memo } from 'react';

function FileList({ files, loadedFilesByPath = {}, onSelectFile }) {
  const loadedCount = files ? files.reduce((count, file) => {
    const filePath = file.to || file.from;
    return loadedFilesByPath[filePath] ? count + 1 : count;
  }, 0) : 0;

  if (!files) return (
    <nav id="file-list">
      <h2>Files</h2>
    </nav>
  );

  return (
    <nav id="file-list">
      <h2>Files</h2>
      <p className="file-list-meta">
        Loaded {loadedCount} / {files.length}
      </p>
      <ul id="file-list-items">
        {files.map(file => {
          const filePath = file.to || file.from;
          const isLoaded = Boolean(loadedFilesByPath[filePath]);
          return (
            <li
              key={filePath}
              className={`file-list-item${isLoaded ? '' : ' pending'}`}
              onClick={() => onSelectFile?.(filePath)}
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
