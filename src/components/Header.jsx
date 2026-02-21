import { memo, useState, useEffect, useRef, useCallback } from 'react';
import {
  HelpCircle,
  ChevronsUpDown,
  ChevronsDownUp,
  MessageSquare,
  Moon,
  Sun,
  ChevronUp,
  ChevronDown,
  ToggleRight,
  ToggleLeft,
} from 'lucide-react';
import ProjectNavigator from './ProjectNavigator';
import ProgressRingWithStats from './ProgressRing';
import GitActionPicker from './GitActionPicker';
import CommentPanel from './CommentPanel';
import {
  CommitIcon,
  CommitAndPushIcon,
  PushIcon,
  PullRequestIcon,
  GitHubIcon,
  GitLabIcon,
  BitbucketIcon,
} from './GitIcons';

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
              {checked ? (
                <ToggleRight
                  className={`send-medium-toggle${checked ? ' is-selected' : ''}`}
                  size={20}
                  strokeWidth={2.5}
                />
              ) : (
                <ToggleLeft
                  className="send-medium-toggle"
                  size={20}
                  strokeWidth={2.5}
                />
              )}
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
  commentsByFile,
  onDeleteComment,
  onDismissAllComments,
  onSendComments,
  committed,
  allCollapsed,
  onToggleCollapseAll,
  onShowShortcuts,
  projectInfo,
  onSwitchProject,
  selectedMediums,
  onChangeMediums,
  onGitAction,
  gitActionType,
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [gitPickerOpen, setGitPickerOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const commentsWrapRef = useRef(null);
  const canSend =
    hasComments && !committed && Array.isArray(selectedMediums)
      ? selectedMediums.length > 0
      : false;
  const isCommentsOpen = hasComments && commentsOpen;

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
    setCommentsOpen(false);
    setPickerOpen((prev) => !prev);
  }, []);

  const handleClosePicker = useCallback(() => {
    setPickerOpen(false);
  }, []);

  const handleToggleGitPicker = useCallback(() => {
    setCommentsOpen(false);
    setGitPickerOpen((prev) => !prev);
  }, []);

  const handleCloseGitPicker = useCallback(() => {
    setGitPickerOpen(false);
  }, []);

  const handleToggleComments = useCallback(() => {
    if (!hasComments) return;
    setPickerOpen(false);
    setGitPickerOpen(false);
    setCommentsOpen((prev) => !prev);
  }, [hasComments]);

  useEffect(() => {
    if (!isCommentsOpen) return;

    function handlePointerDown(event) {
      if (
        commentsWrapRef.current &&
        !commentsWrapRef.current.contains(event.target)
      ) {
        setCommentsOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setCommentsOpen(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isCommentsOpen]);

  const isGitLab = projectInfo?.remoteUrl?.toLowerCase().includes('gitlab');
  const isGitHub = projectInfo?.remoteUrl?.toLowerCase().includes('github');
  const isBitbucket = projectInfo?.remoteUrl
    ?.toLowerCase()
    .includes('bitbucket');

  const getGitActionInfo = (type) => {
    switch (type) {
      case 'commit':
        return { label: 'Commit', Icon: CommitIcon };
      case 'commit-and-push':
        return { label: 'Commit & push', Icon: CommitAndPushIcon };
      case 'push':
        return { label: 'Push', Icon: PushIcon };
      case 'pr': {
        const prLabel = isGitLab ? 'Create MR' : 'Create PR';
        let PrIcon = PullRequestIcon;
        if (isGitHub) PrIcon = GitHubIcon;
        else if (isGitLab) PrIcon = GitLabIcon;
        else if (isBitbucket) PrIcon = BitbucketIcon;
        return { label: prLabel, Icon: PrIcon };
      }
      default:
        return { label: 'Commit', Icon: CommitIcon };
    }
  };

  const { label: gitLabel, Icon: GitIcon } = getGitActionInfo(gitActionType);

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
          <HelpCircle size={20} strokeWidth={2.5} />
        </button>
        <button
          className="btn-collapse-all"
          onClick={onToggleCollapseAll}
          aria-label={allCollapsed ? 'Expand all files' : 'Collapse all files'}
          title={allCollapsed ? 'Expand all files' : 'Collapse all files'}
          type="button"
        >
          {allCollapsed ? (
            <ChevronsUpDown size={20} strokeWidth={2.5} />
          ) : (
            <ChevronsDownUp size={20} strokeWidth={2.5} />
          )}
        </button>
        <button
          className="theme-toggle"
          onClick={onToggleTheme}
          aria-label="Toggle theme"
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          type="button"
        >
          {theme === 'dark' ? (
            <Moon size={20} strokeWidth={2.5} className="theme-toggle-icon" />
          ) : (
            <Sun size={20} strokeWidth={2.5} className="theme-toggle-icon" />
          )}
        </button>
        {hasComments && (
          <div className="comments-dropdown-wrap" ref={commentsWrapRef}>
            <button
              className={`btn-comments${isCommentsOpen ? ' is-open' : ''}`}
              onClick={handleToggleComments}
              aria-label={
                isCommentsOpen
                  ? 'Close comments dropdown'
                  : 'Open comments dropdown'
              }
              aria-expanded={isCommentsOpen}
              title="Comments"
              type="button"
            >
              <MessageSquare size={16} strokeWidth={2.5} />
              <span className="btn-badge">{commentCount}</span>
            </button>
            {isCommentsOpen && (
              <CommentPanel
                commentsByFile={commentsByFile}
                commentCount={commentCount}
                onDeleteComment={onDeleteComment}
                onDismissAll={onDismissAllComments}
                onSelectComment={() => setCommentsOpen(false)}
              />
            )}
          </div>
        )}
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
              {pickerOpen ? (
                <ChevronUp size={20} strokeWidth={2.5} />
              ) : (
                <ChevronDown size={20} strokeWidth={2.5} />
              )}
            </button>
            {pickerOpen && (
              <SendMediumPicker
                selectedMediums={selectedMediums}
                onToggleMedium={handleToggleMedium}
                onClose={handleClosePicker}
              />
            )}
          </div>
          <div
            className={`split-btn-wrap header-action-split${gitPickerOpen ? ' is-open' : ''}`}
          >
            <button
              className="btn btn-secondary header-action-btn split-btn-main"
              disabled={committed}
              onClick={() => onGitAction(gitActionType || 'commit')}
              type="button"
            >
              <GitIcon
                className="git-action-icon"
                style={{ marginRight: '10px' }}
              />
              {gitLabel}
            </button>
            <button
              className="btn btn-secondary header-action-btn split-btn-caret"
              onClick={handleToggleGitPicker}
              aria-label="Git actions"
              title="Git actions"
              type="button"
            >
              {gitPickerOpen ? (
                <ChevronUp size={20} strokeWidth={2.5} />
              ) : (
                <ChevronDown size={20} strokeWidth={2.5} />
              )}
            </button>
            {gitPickerOpen && (
              <GitActionPicker
                remoteUrl={projectInfo?.remoteUrl}
                onAction={onGitAction}
                onClose={handleCloseGitPicker}
                committed={committed}
              />
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

export default memo(Header);
