import {
  GitCommitVertical,
  CloudUpload,
  ArrowUpToLine,
  GitPullRequest,
  Github,
  Gitlab,
} from 'lucide-react';

export const CommitIcon = ({ size = 14, className = '', ...props }) => (
  <GitCommitVertical
    size={size}
    className={className}
    strokeWidth={1.5}
    {...props}
  />
);

export const CommitAndPushIcon = ({ size = 14, className = '', ...props }) => (
  <ArrowUpToLine
    size={size}
    className={className}
    strokeWidth={1.5}
    {...props}
  />
);

export const PushIcon = ({ size = 16, className = '', ...props }) => (
  <CloudUpload size={size} className={className} strokeWidth={1.5} {...props} />
);

export const PullRequestIcon = ({ size = 14, className = '', ...props }) => (
  <GitPullRequest
    size={size}
    className={className}
    strokeWidth={1.5}
    {...props}
  />
);

export const GitHubIcon = ({ size = 14, className = '', ...props }) => (
  <Github size={size} className={className} strokeWidth={1.5} {...props} />
);

export const GitLabIcon = ({ size = 14, className = '', ...props }) => (
  <Gitlab size={size} className={className} strokeWidth={1.5} {...props} />
);

export const BitbucketIcon = ({ size = 14, className = '', ...props }) => (
  <GitPullRequest
    size={size}
    className={className}
    strokeWidth={1.5}
    {...props}
  />
);
