import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getBranchRemote, getRemoteUrl, resolveBranchRef } from './git.js';

const execFileAsync = promisify(execFile);
// Generous: az is a Python CLI whose cold start alone takes seconds.
const CLI_TIMEOUT_MS = 15_000;
const CACHE_TTL_MS = 60_000;
const cache = new Map();
// A CLI is not on PATH under its bare name on Windows when it is a .cmd shim.
const onWindows = process.platform === 'win32';

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
      `--head=${branch}`,
      '--state=open',
      '--limit=1',
      '--json=number,title,url,baseRefName',
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
      `--source-branch=${branch}`,
      '--per-page=1',
      '--output=json',
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
    cli: onWindows ? 'az.cmd' : 'az',
    args: (branch) => [
      'repos',
      'pr',
      'list',
      `--source-branch=${branch}`,
      '--status=active',
      '--top=1',
      '--output=json',
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

// Runs off the event loop: a slow or hung CLI must never hold up the diff.
async function runCli(gitRoot, cli, args) {
  try {
    const { stdout } = await execFileAsync(cli, args, {
      cwd: gitRoot,
      encoding: 'utf-8',
      timeout: CLI_TIMEOUT_MS,
      env: {
        ...process.env,
        // Never prompt for auth from under a server, and do not let a
        // detection run turn into a CLI self-update check.
        GH_PROMPT_DISABLED: '1',
        GH_NO_UPDATE_NOTIFIER: '1',
        NO_PROMPT: '1',
        GLAB_CHECK_UPDATE: 'false',
      },
    });
    return stdout ? JSON.parse(stdout) : null;
  } catch {
    // Missing CLI, signed out (non-zero exit), timeout, or non-JSON output
    return null;
  }
}

// The open pull/merge request whose source is `branch`, with its target
// resolved to a ref this checkout can diff against, or null when there is
// none, the platform is unknown, or its CLI is missing or signed out. The
// answer is cached briefly: the UI asks on every project switch.
async function findOpenPullRequest(
  gitRoot,
  branch,
  { provider: forcedProvider = null, refresh = false } = {},
) {
  // Git allows a leading dash in a branch name; a CLI would read it as a
  // flag even in --flag=value form once it is the value of nothing.
  if (!branch || branch === 'HEAD' || branch.startsWith('-')) return null;
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
    const json = await runCli(gitRoot, provider.cli, provider.args(branch));
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
