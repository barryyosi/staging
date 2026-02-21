import React from 'react';

export const CommitIcon = ({ size = 14, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    <circle cx="12" cy="12" r="4.5" />
    <line x1="2" y1="12" x2="7.5" y2="12" />
    <line x1="16.5" y1="12" x2="22" y2="12" />
  </svg>
);

export const CommitAndPushIcon = ({ size = 14, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    <path d="M4 4h16" />
    <path d="M12 21V8" />
    <path d="M7 13l5-5 5 5" />
  </svg>
);

export const PushIcon = ({ size = 16, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    <path d="M17.5 19c3.3 0 4.5-1.5 4.5-4s-1.5-4-3.5-4.5V10c0-4-3-7-7-7s-7 3-7 7v.5c-2 0.5-3 2-3 4.5s1.2 4 4.5 4" />
    <path d="M12 21V11m-3 3l3-3 3 3" />
  </svg>
);

export const PullRequestIcon = ({ size = 14, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    <path d="M6 21V5M3 8l3-4 3 4" />
    <path d="M6 18c6 0 10-3 10-8v-5M13 8l3-4 3 4" />
  </svg>
);

export const GitHubIcon = ({ size = 14, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    {...props}
  >
    <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.379.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.161 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
  </svg>
);

export const BitbucketIcon = ({ size = 14, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    {...props}
  >
    <path d="M2.316 3.014c-.312 0-.54.275-.487.581l2.844 16.51A.814.814 0 0 0 5.483 20.8h13.064a.81.81 0 0 0 .798-.679l2.83-16.526c.057-.306-.172-.581-.486-.581H2.316zm12.38 12.015H9.284l-1.3-8.006h8.04l-1.328 8.006z" />
  </svg>
);

export const GitLabIcon = ({ size = 14, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    className={className}
    {...props}
  >
    <path d="M12 21.054l4.437-13.633h-8.874L12 21.054V21.054z" fill="#E24329" />
    <path d="M12 21.054L7.563 7.421H2.179l9.821 13.633z" fill="#FC6D26" />
    <path d="M12 21.054l4.437-13.633h5.384L12 21.054z" fill="#FC6D26" />
    <path
      d="M2.179 7.421L.367 13.024c-.18.555-.035 1.171.385 1.583l11.248 6.447L2.179 7.421z"
      fill="#FCA326"
    />
    <path
      d="M21.821 7.421l1.812 5.603c.18.555.035 1.171-.385 1.583L12 21.054l9.821-13.633z"
      fill="#FCA326"
    />
  </svg>
);
