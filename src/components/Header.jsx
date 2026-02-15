import { memo } from 'react';
import ProjectNavigator from './ProjectNavigator';
import ProgressRingWithStats from './ProgressRing';

function Header({
  theme,
  onToggleTheme,
  files,
  reviewedFiles,
  hasComments,
  commentCount,
  onSendComments,
  onCommit,
  committed,
  allCollapsed,
  onToggleCollapseAll,
  onShowShortcuts,
  projectInfo,
  onSwitchProject,
}) {

  return (
    <header id="header">
      <div className="header-left">
        {projectInfo ? (
          <ProjectNavigator
            projectName={projectInfo.projectName}
            branch={projectInfo.branch}
            projects={projectInfo.projects}
            worktrees={projectInfo.worktrees}
            gitRoot={projectInfo.gitRoot}
            onSwitchProject={onSwitchProject}
          />
        ) : (
          <h1 className="logo">staging</h1>
        )}
        <span className="separator" />
        <ProgressRingWithStats files={files} reviewedFiles={reviewedFiles} />
      </div>
      <div className="header-right">
        <button
          className="btn-shortcuts"
          onClick={onShowShortcuts}
          aria-label="Show keyboard shortcuts"
          title="Keyboard shortcuts (?)"
          type="button"
        >
          <span className="material-symbols-rounded">help_outline</span>
        </button>
        <button
          className="btn-collapse-all"
          onClick={onToggleCollapseAll}
          aria-label={allCollapsed ? 'Expand all files' : 'Collapse all files'}
          title={allCollapsed ? 'Expand all files' : 'Collapse all files'}
          type="button"
        >
          <span className="material-symbols-rounded">
            {allCollapsed ? 'unfold_more' : 'unfold_less'}
          </span>
        </button>
        <button
          className="theme-toggle"
          onClick={onToggleTheme}
          aria-label="Toggle theme"
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          type="button"
        >
          <span className="material-symbols-rounded theme-toggle-icon">
            {theme === 'dark' ? 'dark_mode' : 'light_mode'}
          </span>
        </button>
        <div className="header-actions">
          <button
            className={`btn btn-secondary${hasComments ? ' btn-active' : ''}`}
            disabled={!hasComments || committed}
            onClick={onSendComments}
          >
            Send to Agent
            {hasComments && <span className="btn-badge">{commentCount}</span>}
          </button>
          <button
            className="btn btn-primary"
            disabled={committed}
            onClick={onCommit}
          >
            Approve &amp; Commit
          </button>
        </div>
      </div>
    </header>
  );
}

export default memo(Header);
