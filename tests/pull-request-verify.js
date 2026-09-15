// Scenario test for open pull/merge request detection. Puts fake platform
// CLIs on PATH so no network or credentials are involved.
// Run with: node tests/pull-request-verify.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  clearPullRequestCache,
  detectProvider,
  findOpenPullRequest,
} from '../lib/pull-requests.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'staging-pr-detect-'));
const repo = path.join(root, 'repo');
const bin = path.join(root, 'bin');
fs.mkdirSync(repo);
fs.mkdirSync(bin);

function git(...args) {
  const result = spawnSync(
    'git',
    ['-c', 'user.name=test', '-c', 'user.email=test@example.com', ...args],
    { cwd: repo, encoding: 'utf-8' },
  );
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed:\n${result.stderr}`);
  }
  return result.stdout.trim();
}

// A fake CLI that records its arguments and prints canned JSON (or fails).
function fakeCli(name, { json = null, exitCode = 0 } = {}) {
  const argsFile = path.join(root, `${name}.args`);
  const body = json === null ? '' : JSON.stringify(json);
  fs.writeFileSync(
    path.join(bin, name),
    `#!/bin/sh\nprintf '%s\\n' "$*" > "${argsFile}"\n` +
      (body ? `cat <<'JSON'\n${body}\nJSON\n` : '') +
      `exit ${exitCode}\n`,
    { mode: 0o755 },
  );
  return () => fs.readFileSync(argsFile, 'utf-8').trim();
}

const originalPath = process.env.PATH;
process.env.PATH = `${bin}${path.delimiter}${originalPath}`;

try {
  await main();
} finally {
  process.env.PATH = originalPath;
  fs.rmSync(root, { recursive: true, force: true });
}

async function main() {
  git('init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(repo, 'a.txt'), 'a\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'initial');
  git('checkout', '-q', '-b', 'feature');
  git('remote', 'add', 'origin', 'git@github.com:acme/widgets.git');

  // Provider detection by remote host, or forced.
  assert.equal(detectProvider('git@github.com:acme/widgets.git'), 'github');
  assert.equal(detectProvider('https://github.com/acme/widgets'), 'github');
  assert.equal(detectProvider('https://gitlab.com/acme/widgets.git'), 'gitlab');
  assert.equal(
    detectProvider('https://gitlab.acme.internal/acme/widgets.git'),
    'gitlab',
  );
  assert.equal(
    detectProvider('https://dev.azure.com/acme/_git/widgets'),
    'azure',
  );
  assert.equal(detectProvider('https://bitbucket.org/acme/widgets.git'), null);
  assert.equal(
    detectProvider('https://code.acme.internal/x.git', 'github'),
    'github',
  );
  assert.equal(detectProvider('anything', 'bogus'), null);

  // No CLI on PATH: quietly nothing.
  assert.equal(await findOpenPullRequest(repo, 'feature'), null);

  // GitHub: gh answers with an open PR whose target has been fetched.
  const ghArgs = fakeCli('gh', {
    json: [
      {
        number: 12,
        title: 'Add widgets',
        url: 'https://github.com/acme/widgets/pull/12',
        baseRefName: 'main',
      },
    ],
  });
  git('update-ref', 'refs/remotes/origin/main', 'main');
  clearPullRequestCache();
  let pr = await findOpenPullRequest(repo, 'feature');
  assert.deepEqual(pr, {
    platform: 'github',
    platformLabel: 'GitHub',
    requestNoun: 'pull request',
    number: 12,
    title: 'Add widgets',
    url: 'https://github.com/acme/widgets/pull/12',
    targetBranch: 'main',
    baseRef: 'origin/main',
  });
  assert.match(ghArgs(), /^pr list --head=feature --state=open/);

  // The remote-tracking target wins over the local twin; without it the
  // local branch is used; with neither, baseRef is null but the PR is kept.
  git('update-ref', '-d', 'refs/remotes/origin/main');
  clearPullRequestCache();
  assert.equal((await findOpenPullRequest(repo, 'feature')).baseRef, 'main');
  git('branch', '-q', '-m', 'main', 'trunk');
  clearPullRequestCache();
  pr = await findOpenPullRequest(repo, 'feature');
  assert.equal(pr.targetBranch, 'main');
  assert.equal(pr.baseRef, null);
  git('branch', '-q', '-m', 'trunk', 'main');

  // Two callers asking at once share one CLI run.
  const countFile = path.join(root, 'gh.count');
  fs.writeFileSync(
    path.join(bin, 'gh'),
    `#!/bin/sh\necho x >> "${countFile}"\necho '[{"number":12,"title":"t","url":"u","baseRefName":"main"}]'\n`,
    { mode: 0o755 },
  );
  clearPullRequestCache();
  const [first, second] = await Promise.all([
    findOpenPullRequest(repo, 'feature'),
    findOpenPullRequest(repo, 'feature'),
  ]);
  assert.equal(first.number, 12);
  assert.equal(second.number, 12);
  assert.equal(
    fs.readFileSync(countFile, 'utf-8').trim().split('\n').length,
    1,
  );
  fakeCli('gh', {
    json: [
      {
        number: 12,
        title: 'Add widgets',
        url: 'https://github.com/acme/widgets/pull/12',
        baseRefName: 'main',
      },
    ],
  });

  // Cached for a while: a changed CLI answer is not seen until refresh.
  fakeCli('gh', { json: [] });
  assert.equal((await findOpenPullRequest(repo, 'feature')).number, 12);
  assert.equal(
    await findOpenPullRequest(repo, 'feature', { refresh: true }),
    null,
  );

  // A failing or signed-out CLI, or garbage output, means no request.
  fakeCli('gh', { exitCode: 4 });
  clearPullRequestCache();
  assert.equal(await findOpenPullRequest(repo, 'feature'), null);
  fs.writeFileSync(path.join(bin, 'gh'), '#!/bin/sh\necho not-json\n', {
    mode: 0o755,
  });
  clearPullRequestCache();
  assert.equal(await findOpenPullRequest(repo, 'feature'), null);

  // GitLab through glab, on the remote the branch actually tracks.
  git('remote', 'add', 'upstream', 'https://gitlab.com/acme/widgets.git');
  git('config', 'branch.feature.remote', 'upstream');
  git('update-ref', 'refs/remotes/upstream/develop', 'main');
  const glabArgs = fakeCli('glab', {
    json: [
      {
        iid: 7,
        title: 'Widgets MR',
        web_url: 'https://gitlab.com/acme/widgets/-/merge_requests/7',
        target_branch: 'develop',
      },
    ],
  });
  clearPullRequestCache();
  pr = await findOpenPullRequest(repo, 'feature');
  assert.equal(pr.platform, 'gitlab');
  assert.equal(pr.requestNoun, 'merge request');
  assert.equal(pr.number, 7);
  assert.equal(pr.baseRef, 'upstream/develop');
  assert.match(glabArgs(), /^mr list --source-branch=feature/);

  // Azure DevOps through az, target ref unwrapped and URL composed.
  git('config', '--unset', 'branch.feature.remote');
  git(
    'remote',
    'set-url',
    'origin',
    'https://dev.azure.com/acme/proj/_git/widgets',
  );
  fakeCli('az', {
    json: [
      {
        pullRequestId: 33,
        title: 'Azure PR',
        targetRefName: 'refs/heads/main',
        repository: { webUrl: 'https://dev.azure.com/acme/proj/_git/widgets' },
      },
    ],
  });
  clearPullRequestCache();
  pr = await findOpenPullRequest(repo, 'feature');
  assert.equal(pr.platform, 'azure');
  assert.equal(pr.targetBranch, 'main');
  assert.equal(
    pr.url,
    'https://dev.azure.com/acme/proj/_git/widgets/pullrequest/33',
  );
  assert.equal(pr.baseRef, 'main');

  // Detached HEAD, dash-led branch names, and unknown hosts ask nothing.
  assert.equal(await findOpenPullRequest(repo, 'HEAD'), null);
  const azArgs = fakeCli('az', { json: [] });
  fs.rmSync(path.join(root, 'az.args'), { force: true });
  clearPullRequestCache();
  assert.equal(await findOpenPullRequest(repo, '--web'), null);
  assert.throws(azArgs, /ENOENT/, 'the CLI must not have been invoked');
  git('remote', 'set-url', 'origin', 'https://bitbucket.org/acme/widgets.git');
  clearPullRequestCache();
  assert.equal(await findOpenPullRequest(repo, 'feature'), null);

  console.log('pull-request-verify: all checks passed');
}
