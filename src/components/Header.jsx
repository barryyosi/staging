import { memo, useState, useEffect, useRef, useCallback } from 'react';
import ProjectNavigator from './ProjectNavigator';
import ProgressRingWithStats from './ProgressRing';

const MEDIUM_META = {
  clipboard: { label: 'Clipboard' },
  file: { label: 'File' },
  cli: { label: 'CLI Stdout' },
};

const ALL_MEDIUMS = ['clipboard', 'file', 'cli'];

function SendMediumPicker({ selectedMediums, onToggleMedium, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        onClose();
      }
    }
    document.addEventListener('pointerdown', handleClickOutside);
    return () =>
      document.removeEventListener('pointerdown', handleClickOutside);
  }, [onClose]);

  return (
    <div className="send-medium-picker" ref={ref}>
      <div className="send-medium-title">Send via</div>
      <div className="send-medium-list">
        {ALL_MEDIUMS.map((id) => {
          const meta = MEDIUM_META[id];
          const checked = selectedMediums.includes(id);
          return (
            <button
              key={id}
              type="button"
              className={`send-medium-option${checked ? ' active' : ''}`}
              aria-pressed={checked}
              aria-label={`${checked ? 'Disable' : 'Enable'} ${meta.label}`}
              onClick={() => onToggleMedium(id)}
            >
              <span className="send-medium-option-label">{meta.label}</span>
              <span
                className={`material-symbols-rounded send-medium-toggle${checked ? ' is-selected' : ''}`}
              >
                {checked ? 'toggle_on' : 'toggle_off'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

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
  selectedMediums,
  onChangeMediums,
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const canSend =
    hasComments && !committed && Array.isArray(selectedMediums)
      ? selectedMediums.length > 0
      : false;

  const handleToggleMedium = useCallback(
    (id) => {
      const next = selectedMediums.includes(id)
        ? selectedMediums.filter((m) => m !== id)
        : [...selectedMediums, id];
      onChangeMediums(next);
    },
    [selectedMediums, onChangeMediums],
  );

  const handleMainClick = useCallback(() => {
    onSendComments(selectedMediums);
  }, [onSendComments, selectedMediums]);

  const handleTogglePicker = useCallback(() => {
    setPickerOpen((prev) => !prev);
  }, []);

  const handleClosePicker = useCallback(() => {
    setPickerOpen(false);
  }, []);

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
          <div
            className={`split-btn-wrap header-action-split${pickerOpen ? ' is-open' : ''}`}
          >
            <button
              className={`btn btn-secondary header-action-btn split-btn-main${hasComments ? ' is-ready' : ''}`}
              disabled={!canSend}
              onClick={handleMainClick}
              type="button"
            >
              Send to Agent
              {hasComments && <span className="btn-badge">{commentCount}</span>}
            </button>
            <button
              className={`btn btn-secondary header-action-btn split-btn-caret${hasComments ? ' is-ready' : ''}`}
              disabled={!hasComments || committed}
              onClick={handleTogglePicker}
              aria-label="Choose send mediums"
              title="Choose send mediums"
              type="button"
            >
              <span className="material-symbols-rounded">
                {pickerOpen ? 'expand_less' : 'expand_more'}
              </span>
            </button>
            {pickerOpen && (
              <SendMediumPicker
                selectedMediums={selectedMediums}
                onToggleMedium={handleToggleMedium}
                onClose={handleClosePicker}
              />
            )}
          </div>
          <button
            className="btn btn-secondary header-action-btn header-action-commit"
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
