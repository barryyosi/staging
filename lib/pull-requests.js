import { spawnSync } from 'node:child_process';
import { getBranchRemote, getRemoteUrl, resolveBranchRef } from './git.js';

const CLI_TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 60_000;
const cache = new Map();

// Each provider knows which remote hosts it serves, which local CLI answers
// for that platform, and how to read one open request for a source branch
// out of that CLI's JSON. Adding a platform means adding an entry here.
const PROVIDERS = {
  github: {
    label: 'GitHub',
    requestNoun: 'pull request',
    hosts: /(^|[.@/])github\./i,
    cli: 'gh',
    args: (branch) => [
      'pr',
      'list',
      '--head',
      branch,
      '--state',
      'open',
      '--limit',
      '1',
      '--json',
      'number,title,url,baseRefName',
    ],
    parse: (json) => {
      const pr = Array.isArray(json) ? json[0] : null;
      if (!pr) return null;
      return {
        number: pr.number,
        title: pr.title,
        url: pr.url,
        targetBranch: pr.baseRefName,
      };
    },
  },
  gitlab: {
    label: 'GitLab',
    requestNoun: 'merge request',
    hosts: /(^|[.@/])gitlab\./i,
    cli: 'glab',
    args: (branch) => [
      'mr',
      'list',
      '--source-branch',
      branch,
      '--per-page',
      '1',
      '--output',
      'json',
    ],
    parse: (json) => {
      const mr = Array.isArray(json) ? json[0] : null;
      if (!mr) return null;
      return {
        number: mr.iid,
        title: mr.title,
        url: mr.web_url,
        targetBranch: mr.target_branch,
      };
    },
  },
  azure: {
    label: 'Azure DevOps',
    requestNoun: 'pull request',
    hosts: /dev\.azure\.com|visualstudio\.com/i,
    cli: 'az',
    args: (branch) => [
      'repos',
      'pr',
      'list',
      '--source-branch',
      branch,
      '--status',
      'active',
      '--top',
      '1',
      '--output',
      'json',
    ],
    parse: (json) => {
      const pr = Array.isArray(json) ? json[0] : null;
      if (!pr) return null;
      const webUrl = pr.repository?.webUrl;
      return {
        number: pr.pullRequestId,
        title: pr.title,
        url: webUrl ? `${webUrl}/pullrequest/${pr.pullRequestId}` : null,
        targetBranch: (pr.targetRefName || '').replace(/^refs\/heads\//, ''),
      };
    },
  },
};

function detectProvider(remoteUrl, forced) {
  if (forced) return PROVIDERS[forced] ? forced : null;
  if (!remoteUrl) return null;
  return (
    Object.keys(PROVIDERS).find((id) => PROVIDERS[id].hosts.test(remoteUrl)) ||
    null
  );
}

function runCli(gitRoot, cli, args) {
  const result = spawnSync(cli, args, {
    cwd: gitRoot,
    encoding: 'utf-8',
    timeout: CLI_TIMEOUT_MS,
    // The CLI must never prompt for auth from under a server.
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GH_PROMPT_DISABLED: '1', GLAB_PROMPT_DISABLED: '1' },
  });
  if (result.error || result.status !== 0 || !result.stdout) return null;
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

// The open pull/merge request whose source is `branch`, with its target
// resolved to a ref this checkout can diff against, or null when there is
// none, the platform is unknown, or its CLI is missing or signed out. The
// answer is cached briefly: the UI asks on every project switch.
function findOpenPullRequest(
  gitRoot,
  branch,
  { provider: forcedProvider = null, refresh = false } = {},
) {
  if (!branch || branch === 'HEAD') return null;
  const key = `${gitRoot}\0${branch}\0${forcedProvider || ''}`;
  const cached = cache.get(key);
  if (!refresh && cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.value;
  }

  const remote = getBranchRemote(gitRoot, branch);
  const remoteUrl = getRemoteUrl(gitRoot, remote);
  const providerId = detectProvider(remoteUrl, forcedProvider);
  let value = null;
  if (providerId) {
    const provider = PROVIDERS[providerId];
    const json = runCli(gitRoot, provider.cli, provider.args(branch));
    const request = json ? provider.parse(json) : null;
    if (request?.targetBranch) {
      value = {
        platform: providerId,
        platformLabel: provider.label,
        requestNoun: provider.requestNoun,
        number: request.number,
        title: request.title || '',
        url: request.url || null,
        targetBranch: request.targetBranch,
        // null when the target has not been fetched locally
        baseRef: resolveBranchRef(gitRoot, request.targetBranch, remote),
      };
    }
  }

  cache.set(key, { at: Date.now(), value });
  return value;
}

function clearPullRequestCache() {
  cache.clear();
}

export {
  PROVIDERS,
  detectProvider,
  findOpenPullRequest,
  clearPullRequestCache,
};
