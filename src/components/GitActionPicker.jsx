import { useRef, useEffect } from 'react';
import {
  CommitIcon,
  CommitAndPushIcon,
  PushIcon,
  PullRequestIcon,
  GitHubIcon,
  GitLabIcon,
  BitbucketIcon,
} from './GitIcons';

export default function GitActionPicker({
  remoteUrl,
  onAction,
  onClose,
  committed,
}) {
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

  const isGitLab = remoteUrl && remoteUrl.toLowerCase().includes('gitlab');
  const isGitHub = remoteUrl && remoteUrl.toLowerCase().includes('github');
  const isBitbucket =
    remoteUrl && remoteUrl.toLowerCase().includes('bitbucket');
  const prLabel = isGitLab ? 'Create MR' : 'Create PR';

  let PrIcon = PullRequestIcon;
  if (isGitHub) PrIcon = GitHubIcon;
  else if (isGitLab) PrIcon = GitLabIcon;
  else if (isBitbucket) PrIcon = BitbucketIcon;

  const handleAction = (id) => {
    onAction(id);
    onClose();
  };

  return (
    <div
      className="send-medium-picker"
      ref={ref}
      style={{ right: 0, left: 'auto', minWidth: '160px' }}
    >
      <div className="send-medium-title">Git actions</div>
      <div className="send-medium-list">
        <button
          type="button"
          className="git-action-option"
          disabled={committed}
          onClick={() => handleAction('commit')}
        >
          <CommitIcon className="git-action-icon" />
          <span>Commit</span>
        </button>
        <button
          type="button"
          className="git-action-option"
          disabled={committed}
          onClick={() => handleAction('commit-and-push')}
        >
          <CommitAndPushIcon className="git-action-icon" />
          <span>Commit & push</span>
        </button>
        <button
          type="button"
          className="git-action-option"
          onClick={() => handleAction('push')}
        >
          <PushIcon className="git-action-icon" />
          <span>Push</span>
        </button>
        <button
          type="button"
          className="git-action-option"
          onClick={() => handleAction('pr')}
        >
          <PrIcon className="git-action-icon" />
          <span>{prLabel}</span>
        </button>
      </div>
    </div>
  );
}
