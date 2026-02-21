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

const SEND_MEDIUM_PICKER_ID = 'send-medium-picker';
const GIT_ACTION_PICKER_ID = 'git-action-picker';
const COMMENTS_PANEL_ID = 'comments-dropdown-panel';

function SendMediumPicker({
  id,
  labelledBy,
  selectedMediums,
  onToggleMedium,
  onClose,
}) {
  const ref = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        onClose();
      }
    }

    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('pointerdown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const titleId = `${id}-title`;

  return (
    <div
      id={id}
      className="send-medium-picker"
      ref={ref}
      role="menu"
      aria-labelledby={labelledBy || titleId}
    >
      <div className="send-medium-title" id={titleId}>
        Send via
      </div>
      <div className="send-medium-list">
        {ALL_MEDIUMS.map((mediumId) => {
          const meta = MEDIUM_META[mediumId];
          const checked = selectedMediums.includes(mediumId);
          return (
            <button
              key={mediumId}
              type="button"
              className={`send-medium-option${checked ? ' active' : ''}`}
              role="menuitemcheckbox"
              aria-checked={checked}
              aria-label={`${checked ? 'Disable' : 'Enable'} ${meta.label}`}
              onClick={() => onToggleMedium(mediumId)}
            >
              <span className="send-medium-option-label">{meta.label}</span>
              {checked ? (
                <ToggleRight
                  className={`send-medium-toggle${checked ? ' is-selected' : ''}`}
                  size={20}
                  strokeWidth={1.5}
                />
              ) : (
                <ToggleLeft
                  className="send-medium-toggle"
                  size={20}
                  strokeWidth={1.5}
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
  const commentsButtonRef = useRef(null);
  const sendPickerToggleRef = useRef(null);
  const gitPickerToggleRef = useRef(null);
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

  const closePicker = useCallback((restoreFocus = true) => {
    setPickerOpen(false);
    if (restoreFocus) {
      requestAnimationFrame(() => sendPickerToggleRef.current?.focus());
    }
  }, []);

  const closeGitPicker = useCallback((restoreFocus = true) => {
    setGitPickerOpen(false);
    if (restoreFocus) {
      requestAnimationFrame(() => gitPickerToggleRef.current?.focus());
    }
  }, []);

  const closeComments = useCallback((restoreFocus = true) => {
    setCommentsOpen(false);
    if (restoreFocus) {
      requestAnimationFrame(() => commentsButtonRef.current?.focus());
    }
  }, []);

  const handleTogglePicker = useCallback(() => {
    setCommentsOpen(false);
    setGitPickerOpen(false);
    setPickerOpen((prev) => !prev);
  }, []);

  const handleToggleGitPicker = useCallback(() => {
    setCommentsOpen(false);
    setPickerOpen(false);
    setGitPickerOpen((prev) => !prev);
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
        closeComments(true);
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        closeComments(true);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeComments, isCommentsOpen]);

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
          <HelpCircle size={20} strokeWidth={1.5} />
        </button>
        <button
          className="btn-collapse-all"
          onClick={onToggleCollapseAll}
          aria-label={allCollapsed ? 'Expand all files' : 'Collapse all files'}
          title={allCollapsed ? 'Expand all files' : 'Collapse all files'}
          type="button"
        >
          {allCollapsed ? (
            <ChevronsUpDown size={20} strokeWidth={1.5} />
          ) : (
            <ChevronsDownUp size={20} strokeWidth={1.5} />
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
            <Moon size={20} strokeWidth={1.5} className="theme-toggle-icon" />
          ) : (
            <Sun size={20} strokeWidth={1.5} className="theme-toggle-icon" />
          )}
        </button>
        {hasComments && (
          <div className="comments-dropdown-wrap" ref={commentsWrapRef}>
            <button
              ref={commentsButtonRef}
              className={`btn-comments${isCommentsOpen ? ' is-open' : ''}`}
              onClick={handleToggleComments}
              aria-label={
                isCommentsOpen
                  ? 'Close comments dropdown'
                  : 'Open comments dropdown'
              }
              aria-haspopup="dialog"
              aria-expanded={isCommentsOpen}
              aria-controls={isCommentsOpen ? COMMENTS_PANEL_ID : undefined}
              title="Comments"
              type="button"
            >
              <MessageSquare size={16} strokeWidth={1.5} />
              <span className="btn-badge">{commentCount}</span>
            </button>
            {isCommentsOpen && (
              <CommentPanel
                id={COMMENTS_PANEL_ID}
                commentsByFile={commentsByFile}
                commentCount={commentCount}
                onDeleteComment={onDeleteComment}
                onDismissAll={onDismissAllComments}
                onSelectComment={() => closeComments(true)}
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
              ref={sendPickerToggleRef}
              id="send-medium-picker-trigger"
              className={`btn btn-secondary header-action-btn split-btn-caret${hasComments ? ' is-ready' : ''}`}
              disabled={!hasComments || committed}
              onClick={handleTogglePicker}
              aria-label="Choose send mediums"
              aria-haspopup="menu"
              aria-expanded={pickerOpen}
              aria-controls={pickerOpen ? SEND_MEDIUM_PICKER_ID : undefined}
              title="Choose send mediums"
              type="button"
            >
              {pickerOpen ? (
                <ChevronUp size={20} strokeWidth={1.5} />
              ) : (
                <ChevronDown size={20} strokeWidth={1.5} />
              )}
            </button>
            {pickerOpen && (
              <SendMediumPicker
                id={SEND_MEDIUM_PICKER_ID}
                labelledBy="send-medium-picker-trigger"
                selectedMediums={selectedMediums}
                onToggleMedium={handleToggleMedium}
                onClose={() => closePicker(true)}
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
              ref={gitPickerToggleRef}
              id="git-action-picker-trigger"
              className="btn btn-secondary header-action-btn split-btn-caret"
              onClick={handleToggleGitPicker}
              aria-label="Git actions"
              aria-haspopup="menu"
              aria-expanded={gitPickerOpen}
              aria-controls={gitPickerOpen ? GIT_ACTION_PICKER_ID : undefined}
              title="Git actions"
              type="button"
            >
              {gitPickerOpen ? (
                <ChevronUp size={20} strokeWidth={1.5} />
              ) : (
                <ChevronDown size={20} strokeWidth={1.5} />
              )}
            </button>
            {gitPickerOpen && (
              <GitActionPicker
                id={GIT_ACTION_PICKER_ID}
                labelledBy="git-action-picker-trigger"
                remoteUrl={projectInfo?.remoteUrl}
                onAction={onGitAction}
                onClose={() => closeGitPicker(true)}
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
