import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { GitBranch, ChevronDown } from 'lucide-react';

function ProjectDropdown({ projects, currentPath, onSelect, onClose }) {
  return (
    <div className="nav-dropdown">
      {projects.map((project) => (
        <button
          key={project.path}
          className={`nav-dropdown-item${project.path === currentPath ? ' active' : ''}`}
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

function WorktreeDropdown({ worktrees, onSelect, onClose }) {
  return (
    <div className="nav-dropdown">
      {worktrees.map((wt) => (
        <button
          key={wt.path}
          className={`nav-dropdown-item${wt.isCurrent ? ' active' : ''}`}
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

  const closeAll = useCallback(() => {
    setShowProjectDD(false);
    setShowWorktreeDD(false);
  }, []);

  useEffect(() => {
    if (!showProjectDD && !showWorktreeDD) return;

    function handleClick(e) {
      if (projectRef.current && projectRef.current.contains(e.target)) return;
      if (worktreeRef.current && worktreeRef.current.contains(e.target)) return;
      closeAll();
    }

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showProjectDD, showWorktreeDD, closeAll]);

  const hasMultipleProjects = projects && projects.length > 1;
  const hasMultipleWorktrees = worktrees && worktrees.length > 1;

  return (
    <nav className="project-nav">
      <h1 className="logo">staging</h1>
      <span className="nav-slash">/</span>

      <div className="nav-segment-wrap" ref={projectRef}>
        <button
          className={`nav-segment${!hasMultipleProjects ? ' nav-segment-static' : ''}`}
          onClick={() => {
            if (hasMultipleProjects) {
              setShowWorktreeDD(false);
              setShowProjectDD((v) => !v);
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
            projects={projects}
            currentPath={gitRoot}
            onSelect={onSwitchProject}
            onClose={closeAll}
          />
        )}
      </div>

      <span className="nav-slash">/</span>

      <div className="nav-segment-wrap" ref={worktreeRef}>
        <button
          className={`nav-segment${!hasMultipleWorktrees ? ' nav-segment-static' : ''}`}
          onClick={() => {
            if (hasMultipleWorktrees) {
              setShowProjectDD(false);
              setShowWorktreeDD((v) => !v);
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
            worktrees={worktrees}
            onSelect={onSwitchProject}
            onClose={closeAll}
          />
        )}
      </div>
    </nav>
  );
}

export default memo(ProjectNavigator);
