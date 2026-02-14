import { memo, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { buildFileTree, filterTree } from '../utils/fileTree';
import { fuzzyFilterFiles, highlightMatch } from '../utils/fuzzySearch';

const VIEW_STORAGE_KEY = 'staging-file-view';

function getFilePath(file) {
  return file.to || file.from;
}

function FlatFileList({ files, loadedFilesByPath, onSelectFile, searchQuery }) {
  const filteredResults = useMemo(() => {
    return fuzzyFilterFiles(files, searchQuery);
  }, [files, searchQuery]);

  return (
    <ul id="file-list-items">
      {filteredResults.map(({ file, result }) => {
        const filePath = getFilePath(file);
        const isLoaded = Boolean(loadedFilesByPath[filePath]);
        const highlighted = highlightMatch(result);

        return (
          <li
            key={filePath}
            className={`file-list-item${isLoaded ? '' : ' pending'}`}
            onClick={() => onSelectFile?.(filePath)}
          >
            <span className={`status-dot ${file.status}`} />
            <span className="file-name">
              {highlighted
                ? highlighted.map((seg, i) => (
                    <mark key={i} className={seg.highlight ? 'match' : ''}>
                      {seg.text}
                    </mark>
                  ))
                : filePath}
            </span>
            <span className="stats">
              {file.additions > 0 && (
                <span className="add">+{file.additions}</span>
              )}
              {file.deletions > 0 && (
                <span className="del">-{file.deletions}</span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function FileTreeNode({
  node,
  depth,
  loadedFilesByPath,
  onSelectFile,
  forceExpanded,
  expandedMap,
}) {
  const [expanded, setExpanded] = useState(() => {
    if (expandedMap.has(node.path)) return expandedMap.get(node.path);
    return true;
  });

  const isExpanded = forceExpanded || expanded;

  if (node.isFile) {
    const isStaged = node.isStaged;
    const filePath = node.path;
    const isLoaded = isStaged && Boolean(loadedFilesByPath[filePath]);
    const highlighted = highlightMatch(node.fuzzyResult);

    return (
      <li
        className={`file-tree-file${isStaged ? '' : ' unstaged'}${isLoaded ? '' : ' pending'}`}
        style={{ paddingLeft: `${depth * 16 + 12}px` }}
        onClick={isStaged ? () => onSelectFile?.(filePath) : undefined}
      >
        {isStaged && node.file && (
          <span className={`status-dot ${node.file.status}`} />
        )}
        <span className="file-name">
          {highlighted
            ? highlighted.map((seg, i) => (
                <mark key={i} className={seg.highlight ? 'match' : ''}>
                  {seg.text}
                </mark>
              ))
            : node.name}
        </span>
        {isStaged && node.file && (
          <span className="stats">
            {node.file.additions > 0 && (
              <span className="add">+{node.file.additions}</span>
            )}
            {node.file.deletions > 0 && (
              <span className="del">-{node.file.deletions}</span>
            )}
          </span>
        )}
      </li>
    );
  }

  return (
    <li className="file-tree-dir">
      <div
        className="file-tree-dir-label"
        style={{ paddingLeft: `${depth * 16 + 12}px` }}
        onClick={() => {
          setExpanded((prev) => {
            const next = !prev;
            expandedMap.set(node.path, next);
            return next;
          });
        }}
      >
        <span className={`tree-caret${isExpanded ? ' expanded' : ''}`}>
          &#9654;
        </span>
        <span className="dir-name">{node.name}</span>
      </div>
      {isExpanded && (
        <ul className="file-tree-children">
          {node.children.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              loadedFilesByPath={loadedFilesByPath}
              onSelectFile={onSelectFile}
              forceExpanded={forceExpanded}
              expandedMap={expandedMap}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function FileTreeView({
  files,
  loadedFilesByPath,
  onSelectFile,
  searchQuery,
  showAllFiles,
  trackedFiles,
  expandedMap,
}) {
  const tree = useMemo(() => {
    const base = buildFileTree(files, showAllFiles ? trackedFiles : null);
    return filterTree(base, searchQuery);
  }, [files, showAllFiles, trackedFiles, searchQuery]);

  const isSearching = Boolean(searchQuery);

  return (
    <ul id="file-list-items" className="file-tree-root">
      {tree.map((node) => (
        <FileTreeNode
          key={node.path}
          node={node}
          depth={0}
          loadedFilesByPath={loadedFilesByPath}
          onSelectFile={onSelectFile}
          forceExpanded={isSearching}
          expandedMap={expandedMap}
        />
      ))}
    </ul>
  );
}

function FileSidebar({ files, loadedFilesByPath = {}, onSelectFile }) {
  const [viewMode, setViewMode] = useState(() => {
    if (typeof window === 'undefined') return 'flat';
    return localStorage.getItem(VIEW_STORAGE_KEY) || 'flat';
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [showAllFiles, setShowAllFiles] = useState(false);
  const [trackedFiles, setTrackedFiles] = useState(null);
  const trackedFilesFetched = useRef(false);
  const [expandedMap] = useState(() => new Map());

  useEffect(() => {
    localStorage.setItem(VIEW_STORAGE_KEY, viewMode);
  }, [viewMode]);

  // Fetch tracked files when "show all" is toggled on for the first time
  useEffect(() => {
    if (!showAllFiles || trackedFilesFetched.current) return;
    trackedFilesFetched.current = true;

    fetch('/api/tracked-files')
      .then((res) => res.json())
      .then((data) => {
        if (data.files) setTrackedFiles(data.files);
      })
      .catch(() => {
        // non-critical
      });
  }, [showAllFiles]);

  const handleSearchChange = useCallback((e) => {
    setSearchQuery(e.target.value);
  }, []);

  if (!files) {
    return (
      <nav id="file-list">
        <div className="file-sidebar-header">
          <h2>Files</h2>
        </div>
      </nav>
    );
  }

  const isTree = viewMode === 'tree';

  return (
    <nav id="file-list">
      <div className="file-sidebar-header">
        <h2>Files</h2>
        <button
          className="file-view-toggle"
          type="button"
          role="switch"
          aria-checked={isTree}
          aria-label="Toggle tree view"
          onClick={() => setViewMode(isTree ? 'flat' : 'tree')}
        >
          <span
            className={`file-view-toggle-option${!isTree ? ' active' : ''}`}
          >
            <span className="material-symbols-rounded">list</span>
          </span>
          <span className={`file-view-toggle-option${isTree ? ' active' : ''}`}>
            <span className="material-symbols-rounded">account_tree</span>
          </span>
          <span
            className="file-view-toggle-thumb"
            style={{ transform: isTree ? 'translateX(30px)' : 'translateX(0)' }}
          />
        </button>
      </div>

      <div className="file-sidebar-search">
        <input
          type="text"
          placeholder="Search files..."
          value={searchQuery}
          onChange={handleSearchChange}
        />
      </div>

      {isTree && (
        <button
          className={`file-sidebar-toggle${showAllFiles ? ' on' : ''}`}
          type="button"
          role="switch"
          aria-checked={showAllFiles}
          onClick={() => setShowAllFiles((v) => !v)}
        >
          <span className="toggle-track">
            <span className="toggle-thumb" />
          </span>
          <span className="toggle-label">Show all files</span>
        </button>
      )}

      {!isTree ? (
        <FlatFileList
          files={files}
          loadedFilesByPath={loadedFilesByPath}
          onSelectFile={onSelectFile}
          searchQuery={searchQuery}
        />
      ) : (
        <FileTreeView
          files={files}
          loadedFilesByPath={loadedFilesByPath}
          onSelectFile={onSelectFile}
          searchQuery={searchQuery}
          showAllFiles={showAllFiles}
          trackedFiles={trackedFiles}
          expandedMap={expandedMap}
        />
      )}
    </nav>
  );
}

export default memo(FileSidebar);
