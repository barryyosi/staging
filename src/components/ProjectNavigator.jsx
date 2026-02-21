import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { GitBranch, ChevronDown } from 'lucide-react';

const PROJECT_DROPDOWN_ID = 'project-dropdown';
const WORKTREE_DROPDOWN_ID = 'worktree-dropdown';

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

function ProjectNavigator({
  projectName,
  branch,
  projects,
  worktrees,
  gitRoot,
  onSwitchProject,
}) {
  const [showProjectDD, setShowProjectDD] = useState(false);
  const [showWorktreeDD, setShowWorktreeDD] = useState(false);
  const projectRef = useRef(null);
  const worktreeRef = useRef(null);
  const projectButtonRef = useRef(null);
  const worktreeButtonRef = useRef(null);
  const lastOpenedDropdownRef = useRef(null);

  const closeAll = useCallback((restoreFocus = false) => {
    setShowProjectDD(false);
    setShowWorktreeDD(false);

    if (restoreFocus) {
      const dropdown = lastOpenedDropdownRef.current;
      requestAnimationFrame(() => {
        if (dropdown === 'project') {
          projectButtonRef.current?.focus();
        } else if (dropdown === 'worktree') {
          worktreeButtonRef.current?.focus();
        }
      });
    }
  }, []);

  useEffect(() => {
    if (!showProjectDD && !showWorktreeDD) return;

    function handleClick(e) {
      if (projectRef.current && projectRef.current.contains(e.target)) return;
      if (worktreeRef.current && worktreeRef.current.contains(e.target)) return;
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
  }, [showProjectDD, showWorktreeDD, closeAll]);

  const hasMultipleProjects = projects && projects.length > 1;
  const hasMultipleWorktrees = worktrees && worktrees.length > 1;

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
    </nav>
  );
}

export default memo(ProjectNavigator);
