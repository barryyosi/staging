import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import {
  GitBranch,
  GitCompare,
  GitPullRequestArrow,
  ChevronDown,
  ExternalLink,
} from 'lucide-react';

const PROJECT_DROPDOWN_ID = 'project-dropdown';
const WORKTREE_DROPDOWN_ID = 'worktree-dropdown';
const COMPARE_DROPDOWN_ID = 'compare-dropdown';
// Above this many branches the compare dropdown gets a filter box.
const COMPARE_FILTER_THRESHOLD = 8;

function ProjectDropdown({ id, projects, currentPath, onSelect, onClose }) {
  return (
    <div id={id} className="nav-dropdown" role="menu" aria-label="Project list">
      {projects.map((project) => (
        <button
          key={project.path}
          className={`nav-dropdown-item${project.path === currentPath ? ' active' : ''}`}
          role="menuitem"
          onClick={() => {
            onSelect(project.path);
            onClose();
          }}
          type="button"
        >
          <span className="nav-dropdown-item-name">{project.name}</span>
          {project.hasStagedChanges && <span className="nav-dropdown-dot" />}
        </button>
      ))}
    </div>
  );
}

function WorktreeDropdown({ id, worktrees, onSelect, onClose }) {
  return (
    <div
      id={id}
      className="nav-dropdown"
      role="menu"
      aria-label="Worktree list"
    >
      {worktrees.map((wt) => (
        <button
          key={wt.path}
          className={`nav-dropdown-item${wt.isCurrent ? ' active' : ''}`}
          role="menuitem"
          onClick={() => {
            onSelect(wt.path);
            onClose();
          }}
          type="button"
        >
          <span className="nav-dropdown-item-name">{wt.branch}</span>
        </button>
      ))}
    </div>
  );
}

// Branches offered as compare targets: the open request's target first,
// then the suggested base, then the rest of the local branches, then
// remote-tracking ones. The checked-out branch is left out — comparing
// against it is just the staged diff.
function orderCompareBranches(
  branches,
  currentBranch,
  defaultBase,
  pullRequest = null,
) {
  const local = (branches?.local || []).filter((b) => b !== currentBranch);
  const remote = branches?.remote || [];
  const ordered = [];
  const taken = new Set([currentBranch]);
  const push = (name, group, extra = {}) => {
    if (!name || taken.has(name)) return;
    taken.add(name);
    ordered.push({ name, group, ...extra });
  };
  if (pullRequest?.baseRef) {
    push(pullRequest.baseRef, 'request', {
      hint: `#${pullRequest.number}`,
      title: pullRequest.title,
    });
  }
  push(defaultBase, 'suggested');
  for (const name of local) push(name, 'local');
  for (const name of remote) push(name, 'remote');
  return ordered;
}

function compareGroupLabel(group, pullRequest) {
  if (group === 'request') {
    return `Open ${pullRequest?.requestNoun || 'pull request'}`;
  }
  return {
    suggested: 'Suggested',
    local: 'Local branches',
    remote: 'Remote branches',
  }[group];
}

function CompareDropdown({
  id,
  branches,
  currentBranch,
  defaultBase,
  compareBase,
  pullRequest,
  onSelect,
  onClose,
}) {
  const [filter, setFilter] = useState('');
  const inputRef = useRef(null);

  const entries = useMemo(
    () =>
      orderCompareBranches(branches, currentBranch, defaultBase, pullRequest),
    [branches, currentBranch, defaultBase, pullRequest],
  );
  const showFilter = entries.length > COMPARE_FILTER_THRESHOLD;
  const visible = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return entries;
    return entries.filter((entry) => entry.name.toLowerCase().includes(query));
  }, [entries, filter]);

  useEffect(() => {
    if (showFilter) inputRef.current?.focus();
  }, [showFilter]);

  const select = (base) => {
    onSelect(base);
    onClose();
  };

  let lastGroup = null;
  return (
    <div className="nav-dropdown nav-dropdown-compare">
      {showFilter && (
        <div className="nav-dropdown-filter">
          <input
            ref={inputRef}
            type="text"
            aria-label="Filter branches"
            placeholder="Filter branches..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && visible.length === 1) {
                e.preventDefault();
                select(visible[0].name);
              }
            }}
          />
        </div>
      )}
      <div
        id={id}
        className="nav-dropdown-scroll"
        role="menu"
        aria-label="Compare against"
      >
        <button
          className={`nav-dropdown-item${compareBase ? '' : ' active'}`}
          role="menuitemradio"
          aria-checked={!compareBase}
          onClick={() => select(null)}
          type="button"
        >
          <span className="nav-dropdown-item-name">Staged changes</span>
          <span className="nav-dropdown-item-hint">HEAD</span>
        </button>
        {visible.map((entry) => {
          const heading =
            entry.group !== lastGroup
              ? compareGroupLabel(entry.group, pullRequest)
              : null;
          lastGroup = entry.group;
          const active = entry.name === compareBase;
          return (
            <div key={entry.name}>
              {heading && (
                <div className="nav-dropdown-group-label">{heading}</div>
              )}
              <button
                className={`nav-dropdown-item${active ? ' active' : ''}`}
                role="menuitemradio"
                aria-checked={active}
                onClick={() => select(entry.name)}
                type="button"
                title={entry.title || entry.name}
              >
                <span className="nav-dropdown-item-name">{entry.name}</span>
                {entry.hint && (
                  <span className="nav-dropdown-item-hint">{entry.hint}</span>
                )}
              </button>
            </div>
          );
        })}
        {pullRequest && !pullRequest.baseRef && (
          <div className="nav-dropdown-empty">
            {pullRequest.requestNoun} #{pullRequest.number} targets{' '}
            {pullRequest.targetBranch}, which is not fetched locally
          </div>
        )}
        {pullRequest?.url && (
          <a
            className="nav-dropdown-item nav-dropdown-link"
            role="menuitem"
            href={pullRequest.url}
            target="_blank"
            rel="noreferrer"
            title={pullRequest.title}
          >
            <GitPullRequestArrow size={14} strokeWidth={1.5} />
            <span className="nav-dropdown-item-name">
              Open #{pullRequest.number} on {pullRequest.platformLabel}
            </span>
            <ExternalLink size={12} strokeWidth={1.5} />
          </a>
        )}
        {visible.length === 0 && (
          <div className="nav-dropdown-empty">No matching branches</div>
        )}
      </div>
    </div>
  );
}

function ProjectNavigator({
  projectName,
  branch,
  projects,
  worktrees,
  gitRoot,
  onSwitchProject,
  branches,
  defaultBase,
  compareBase,
  onChangeCompareBase,
  pullRequest,
}) {
  const [showProjectDD, setShowProjectDD] = useState(false);
  const [showWorktreeDD, setShowWorktreeDD] = useState(false);
  const [showCompareDD, setShowCompareDD] = useState(false);
  const projectRef = useRef(null);
  const worktreeRef = useRef(null);
  const compareRef = useRef(null);
  const projectButtonRef = useRef(null);
  const worktreeButtonRef = useRef(null);
  const compareButtonRef = useRef(null);
  const lastOpenedDropdownRef = useRef(null);

  const closeAll = useCallback((restoreFocus = false) => {
    setShowProjectDD(false);
    setShowWorktreeDD(false);
    setShowCompareDD(false);

    if (restoreFocus) {
      const dropdown = lastOpenedDropdownRef.current;
      requestAnimationFrame(() => {
        if (dropdown === 'project') {
          projectButtonRef.current?.focus();
        } else if (dropdown === 'worktree') {
          worktreeButtonRef.current?.focus();
        } else if (dropdown === 'compare') {
          compareButtonRef.current?.focus();
        }
      });
    }
  }, []);

  useEffect(() => {
    if (!showProjectDD && !showWorktreeDD && !showCompareDD) return;

    function handleClick(e) {
      if (projectRef.current && projectRef.current.contains(e.target)) return;
      if (worktreeRef.current && worktreeRef.current.contains(e.target)) return;
      if (compareRef.current && compareRef.current.contains(e.target)) return;
      closeAll(true);
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        closeAll(true);
      }
    }

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showProjectDD, showWorktreeDD, showCompareDD, closeAll]);

  const hasMultipleProjects = projects && projects.length > 1;
  const hasMultipleWorktrees = worktrees && worktrees.length > 1;
  // Nothing to compare against in a single-branch repo, unless a base is
  // already active and needs a way back to the staged view
  const canCompare =
    Boolean(onChangeCompareBase) &&
    (Boolean(compareBase) ||
      orderCompareBranches(branches, branch, defaultBase, pullRequest).length >
        0);
  const comparingRequest = Boolean(
    compareBase && pullRequest && pullRequest.baseRef === compareBase,
  );

  return (
    <nav className="project-nav">
      <h1 className="logo">staging</h1>
      <span className="nav-slash">/</span>

      <div className="nav-segment-wrap" ref={projectRef}>
        <button
          ref={projectButtonRef}
          className={`nav-segment${!hasMultipleProjects ? ' nav-segment-static' : ''}`}
          aria-haspopup={hasMultipleProjects ? 'menu' : undefined}
          aria-expanded={hasMultipleProjects ? showProjectDD : undefined}
          aria-controls={showProjectDD ? PROJECT_DROPDOWN_ID : undefined}
          onClick={() => {
            if (hasMultipleProjects) {
              setShowWorktreeDD(false);
              setShowCompareDD(false);
              setShowProjectDD((v) => {
                const next = !v;
                if (next) lastOpenedDropdownRef.current = 'project';
                return next;
              });
            }
          }}
          type="button"
        >
          <span className="nav-segment-label" title={projectName}>
            {projectName}
          </span>
          {hasMultipleProjects && (
            <ChevronDown size={14} strokeWidth={1.5} className="nav-caret" />
          )}
        </button>
        {showProjectDD && hasMultipleProjects && (
          <ProjectDropdown
            id={PROJECT_DROPDOWN_ID}
            projects={projects}
            currentPath={gitRoot}
            onSelect={onSwitchProject}
            onClose={() => closeAll(true)}
          />
        )}
      </div>

      <span className="nav-slash">/</span>

      <div className="nav-segment-wrap" ref={worktreeRef}>
        <button
          ref={worktreeButtonRef}
          className={`nav-segment${!hasMultipleWorktrees ? ' nav-segment-static' : ''}`}
          aria-haspopup={hasMultipleWorktrees ? 'menu' : undefined}
          aria-expanded={hasMultipleWorktrees ? showWorktreeDD : undefined}
          aria-controls={showWorktreeDD ? WORKTREE_DROPDOWN_ID : undefined}
          onClick={() => {
            if (hasMultipleWorktrees) {
              setShowProjectDD(false);
              setShowCompareDD(false);
              setShowWorktreeDD((v) => {
                const next = !v;
                if (next) lastOpenedDropdownRef.current = 'worktree';
                return next;
              });
            }
          }}
          type="button"
        >
          <GitBranch size={14} strokeWidth={1.5} className="nav-segment-icon" />
          <span className="nav-segment-label" title={branch}>
            {branch}
          </span>
          {hasMultipleWorktrees && (
            <ChevronDown size={14} strokeWidth={1.5} className="nav-caret" />
          )}
        </button>
        {showWorktreeDD && hasMultipleWorktrees && (
          <WorktreeDropdown
            id={WORKTREE_DROPDOWN_ID}
            worktrees={worktrees}
            onSelect={onSwitchProject}
            onClose={() => closeAll(true)}
          />
        )}
      </div>

      {canCompare && (
        <div className="nav-segment-wrap" ref={compareRef}>
          <button
            ref={compareButtonRef}
            className={`nav-segment nav-segment-compare${compareBase ? ' is-comparing' : ''}`}
            aria-haspopup="menu"
            aria-expanded={showCompareDD}
            aria-controls={showCompareDD ? COMPARE_DROPDOWN_ID : undefined}
            title={
              comparingRequest
                ? `Reviewing ${pullRequest.requestNoun} #${pullRequest.number}${pullRequest.title ? `: ${pullRequest.title}` : ''} against ${compareBase}`
                : compareBase
                  ? `Showing changes against ${compareBase}`
                  : 'Showing staged changes. Compare against a base branch'
            }
            onClick={() => {
              setShowProjectDD(false);
              setShowWorktreeDD(false);
              setShowCompareDD((v) => {
                const next = !v;
                if (next) lastOpenedDropdownRef.current = 'compare';
                return next;
              });
            }}
            type="button"
          >
            <GitCompare
              size={14}
              strokeWidth={1.5}
              className="nav-segment-icon"
            />
            <span className="nav-segment-label">
              {compareBase ? `vs ${compareBase}` : 'staged'}
            </span>
            {comparingRequest && (
              <span className="nav-segment-badge">#{pullRequest.number}</span>
            )}
            <ChevronDown size={14} strokeWidth={1.5} className="nav-caret" />
          </button>
          {showCompareDD && (
            <CompareDropdown
              id={COMPARE_DROPDOWN_ID}
              branches={branches}
              currentBranch={branch}
              defaultBase={defaultBase}
              compareBase={compareBase}
              pullRequest={pullRequest}
              onSelect={onChangeCompareBase}
              onClose={() => closeAll(true)}
            />
          )}
        </div>
      )}
    </nav>
  );
}

export default memo(ProjectNavigator);
