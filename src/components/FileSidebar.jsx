import { memo, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Plus, List, FolderTree, ChevronRight } from 'lucide-react';
import { buildFileTree, filterTree } from '../utils/fileTree';
import { fuzzyFilterFiles, highlightMatch } from '../utils/fuzzySearch';

const VIEW_STORAGE_KEY = 'staging-file-view';
const SHOW_UNSTAGED_STORAGE_KEY = 'staging-show-unstaged';

function getFilePath(file) {
  return file.to || file.from;
}

function isActivationKey(event) {
  return event.key === 'Enter' || event.key === ' ';
}

function StageFileButton({ filePath, fromPath, onStageFile }) {
  return (
    <button
      className="file-stage-btn"
      type="button"
      aria-label={`Stage ${filePath}`}
      title="Stage file"
      onClick={(event) => {
        event.stopPropagation();
        onStageFile?.(filePath, fromPath);
      }}
    >
      <Plus size={14} strokeWidth={1.5} />
    </button>
  );
}

function FlatFileList({
  files,
  loadedFilesByPath,
  onSelectFile,
  searchQuery,
  onStageFile,
}) {
  const filteredResults = useMemo(() => {
    return fuzzyFilterFiles(files, searchQuery);
  }, [files, searchQuery]);

  return (
    <ul id="file-list-items">
      {filteredResults.map(({ file, result }) => {
        const filePath = getFilePath(file);
        const isUnstaged = Boolean(file.isUnstaged);
        const isLoaded = !isUnstaged && Boolean(loadedFilesByPath[filePath]);
        const isPending = !isUnstaged && !isLoaded;
        const highlighted = highlightMatch(result);

        return (
          <li
            key={filePath}
            className={`file-list-item${isPending ? ' pending' : ''}${isUnstaged ? ' unstaged' : ''}`}
            onClick={isUnstaged ? undefined : () => onSelectFile?.(filePath)}
            role={isUnstaged ? undefined : 'button'}
            tabIndex={isUnstaged ? undefined : 0}
            onKeyDown={
              isUnstaged
                ? undefined
                : (event) => {
                    if (!isActivationKey(event)) return;
                    event.preventDefault();
                    onSelectFile?.(filePath);
                  }
            }
          >
            <span className={`status-dot ${file.status}`} />
            <span className="file-name" title={filePath}>
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
            {isUnstaged && (
              <StageFileButton
                filePath={filePath}
                fromPath={file.from || null}
                onStageFile={onStageFile}
              />
            )}
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
  onStageFile,
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
    const isUnstaged = !isStaged && node.isUnstaged;
    const fileMeta = isStaged ? node.file : node.unstagedFile;
    const isTrackedOnly = !isStaged && !isUnstaged;
    const filePath = node.path;
    const isLoaded = isStaged && Boolean(loadedFilesByPath[filePath]);
    const isPending = isStaged && !isLoaded;
    const highlighted = highlightMatch(node.fuzzyResult);

    return (
      <li
        className={`file-tree-file${isPending ? ' pending' : ''}${isUnstaged ? ' unstaged' : ''}${isTrackedOnly ? ' tracked-only' : ''}`}
        style={{ paddingLeft: `${depth * 16 + 12}px` }}
        onClick={isStaged ? () => onSelectFile?.(filePath) : undefined}
        role={isStaged ? 'button' : undefined}
        tabIndex={isStaged ? 0 : undefined}
        onKeyDown={
          isStaged
            ? (event) => {
                if (!isActivationKey(event)) return;
                event.preventDefault();
                onSelectFile?.(filePath);
              }
            : undefined
        }
      >
        {fileMeta && <span className={`status-dot ${fileMeta.status}`} />}
        <span className="file-name" title={filePath}>
          {highlighted
            ? highlighted.map((seg, i) => (
                <mark key={i} className={seg.highlight ? 'match' : ''}>
                  {seg.text}
                </mark>
              ))
            : node.name}
        </span>
        {fileMeta && (
          <span className="stats">
            {fileMeta.additions > 0 && (
              <span className="add">+{fileMeta.additions}</span>
            )}
            {fileMeta.deletions > 0 && (
              <span className="del">-{fileMeta.deletions}</span>
            )}
          </span>
        )}
        {isUnstaged && (
          <StageFileButton
            filePath={filePath}
            fromPath={fileMeta?.from || null}
            onStageFile={onStageFile}
          />
        )}
      </li>
    );
  }

  return (
    <li className="file-tree-dir">
      <button
        className="file-tree-dir-label"
        type="button"
        aria-expanded={isExpanded}
        style={{ paddingLeft: `${depth * 16 + 12}px` }}
        onClick={() => {
          setExpanded((prev) => {
            const next = !prev;
            expandedMap.set(node.path, next);
            return next;
          });
        }}
      >
        <ChevronRight
          className={`tree-caret${isExpanded ? ' expanded' : ''}`}
          size={14}
          strokeWidth={1.5}
        />
        <span className="dir-name">{node.name}</span>
      </button>
      {isExpanded && (
        <ul className="file-tree-children">
          {node.children.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              loadedFilesByPath={loadedFilesByPath}
              onSelectFile={onSelectFile}
              onStageFile={onStageFile}
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
  unstagedFiles,
  showUnstaged,
  onStageFile,
  expandedMap,
}) {
  const tree = useMemo(() => {
    const base = buildFileTree(
      files,
      showAllFiles ? trackedFiles : null,
      showUnstaged ? unstagedFiles : null,
    );
    return filterTree(base, searchQuery);
  }, [
    files,
    showAllFiles,
    trackedFiles,
    showUnstaged,
    unstagedFiles,
    searchQuery,
  ]);

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
          onStageFile={onStageFile}
          forceExpanded={isSearching}
          expandedMap={expandedMap}
        />
      ))}
    </ul>
  );
}

function FileSidebar({
  files,
  unstagedFiles = [],
  loadedFilesByPath = {},
  onSelectFile,
  onStageFile,
}) {
  const [viewMode, setViewMode] = useState(() => {
    if (typeof window === 'undefined') return 'flat';
    return localStorage.getItem(VIEW_STORAGE_KEY) || 'flat';
  });
  const [showUnstaged, setShowUnstaged] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(SHOW_UNSTAGED_STORAGE_KEY) === 'true';
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [showAllFiles, setShowAllFiles] = useState(false);
  const [trackedFiles, setTrackedFiles] = useState(null);
  const trackedFilesFetched = useRef(false);
  const [expandedMap] = useState(() => new Map());

  useEffect(() => {
    localStorage.setItem(VIEW_STORAGE_KEY, viewMode);
  }, [viewMode]);

  useEffect(() => {
    localStorage.setItem(SHOW_UNSTAGED_STORAGE_KEY, String(showUnstaged));
  }, [showUnstaged]);

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

  const unstagedOnlyCount = useMemo(() => {
    if (!Array.isArray(files) || !Array.isArray(unstagedFiles)) return 0;
    const stagedPaths = new Set(files.map(getFilePath).filter(Boolean));

    let count = 0;
    for (const file of unstagedFiles) {
      const filePath = getFilePath(file);
      if (!filePath || stagedPaths.has(filePath)) continue;
      count += 1;
    }

    return count;
  }, [files, unstagedFiles]);

  const flatFiles = useMemo(() => {
    if (!Array.isArray(files)) return files;
    if (!showUnstaged || unstagedFiles.length === 0) return files;

    const mergedFiles = [...files];
    const stagedPaths = new Set(files.map(getFilePath).filter(Boolean));

    for (const file of unstagedFiles) {
      const filePath = getFilePath(file);
      if (!filePath || stagedPaths.has(filePath)) continue;
      mergedFiles.push({ ...file, isUnstaged: true });
    }

    return mergedFiles;
  }, [files, showUnstaged, unstagedFiles]);

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
        <div className="file-sidebar-header-controls">
          <div
            className="file-sidebar-filters"
            role="group"
            aria-label="File filters"
          >
            <button
              className={`file-sidebar-filter${showUnstaged ? ' on' : ''}`}
              type="button"
              aria-pressed={showUnstaged}
              onClick={() => setShowUnstaged((v) => !v)}
            >
              <span className="file-sidebar-filter-label">Unstaged</span>
              <span className="file-sidebar-filter-count">
                {unstagedOnlyCount}
              </span>
            </button>

            {isTree && (
              <button
                className={`file-sidebar-filter${showAllFiles ? ' on' : ''}`}
                type="button"
                aria-pressed={showAllFiles}
                onClick={() => setShowAllFiles((v) => !v)}
              >
                <span className="file-sidebar-filter-label">All files</span>
              </button>
            )}
          </div>

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
              <List size={14} strokeWidth={1.5} />
            </span>
            <span
              className={`file-view-toggle-option${isTree ? ' active' : ''}`}
            >
              <FolderTree size={14} strokeWidth={1.5} />
            </span>
            <span
              className="file-view-toggle-thumb"
              style={{
                transform: isTree ? 'translateX(24px)' : 'translateX(0)',
              }}
            />
          </button>
        </div>
      </div>

      <div className="file-sidebar-search">
        <input
          type="text"
          aria-label="Search files"
          placeholder="Search files..."
          value={searchQuery}
          onChange={handleSearchChange}
        />
      </div>

      {!isTree ? (
        <FlatFileList
          files={flatFiles}
          loadedFilesByPath={loadedFilesByPath}
          onSelectFile={onSelectFile}
          searchQuery={searchQuery}
          onStageFile={onStageFile}
        />
      ) : (
        <FileTreeView
          files={files}
          loadedFilesByPath={loadedFilesByPath}
          onSelectFile={onSelectFile}
          searchQuery={searchQuery}
          showAllFiles={showAllFiles}
          trackedFiles={trackedFiles}
          unstagedFiles={unstagedFiles}
          showUnstaged={showUnstaged}
          onStageFile={onStageFile}
          expandedMap={expandedMap}
        />
      )}
    </nav>
  );
}

export default memo(FileSidebar);
