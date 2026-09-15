// Scenario test for comparing the index against a base branch.
// Builds a throwaway repo with a main branch and a feature branch that has
// both committed and staged work, then checks what each compare mode shows.
// Run with: node tests/base-diff-verify.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  commitChanges,
  detectDefaultBaseBranch,
  getStagedDiff,
  getStagedDiffPage,
  getStagedDiffSummary,
  listBranches,
} from '../lib/git.js';

const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'staging-base-diff-'));

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

function write(files) {
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(repo, name), content);
  }
}

function commit(message) {
  git('add', '-A');
  git('commit', '-q', '-m', message);
  return git('rev-parse', 'HEAD');
}

const paths = (summary) => summary.files.map((f) => f.to || f.from).sort();

try {
  git('init', '-q', '-b', 'main');
  write({ 'a.txt': 'a1\n', 'b.txt': 'b1\n' });
  const fork = commit('initial');

  git('checkout', '-q', '-b', 'feature');
  write({ 'a.txt': 'a1\na2\n', 'c.txt': 'c1\n' });
  commit('feature work');

  // main moves on after the fork; that change must not show up as ours.
  git('checkout', '-q', 'main');
  write({ 'b.txt': 'b1\nb2\n' });
  commit('main moves on');
  git('checkout', '-q', 'feature');

  // Staged but uncommitted work on the feature branch.
  write({ 'c.txt': 'c1\nc2\n', 'd.txt': 'd1\n' });
  git('add', '-A');

  // Plain staged mode: only what is in the index beyond HEAD.
  const staged = getStagedDiffSummary(repo, { refresh: true });
  assert.equal(staged.base, null);
  assert.equal(staged.mergeBase, null);
  assert.deepEqual(paths(staged), ['c.txt', 'd.txt']);

  // Against main: the branch's commits plus the staged work, from the fork.
  const vsMain = getStagedDiffSummary(repo, { refresh: true, base: 'main' });
  assert.equal(vsMain.base, 'main');
  assert.equal(vsMain.mergeBase, fork);
  assert.deepEqual(paths(vsMain), ['a.txt', 'c.txt', 'd.txt']);
  assert.equal(vsMain.totalAdditions, 4);
  assert.equal(vsMain.totalDeletions, 0);
  const cFile = vsMain.files.find((f) => f.to === 'c.txt');
  assert.equal(cFile.status, 'added');

  const page = getStagedDiffPage(repo, { base: 'main' });
  assert.equal(page.base, 'main');
  assert.equal(page.mergeBase, fork);
  const cPage = page.files.find((f) => f.to === 'c.txt');
  assert.deepEqual(
    cPage.chunks[0].changes.map((ch) => ch.content),
    ['c1', 'c2'],
    'committed and staged lines both appear against the base',
  );
  assert.equal(cPage.totalNewLines, 2);

  const full = getStagedDiff(repo, 3, 'main');
  assert.deepEqual(paths(full), ['a.txt', 'c.txt', 'd.txt']);

  // Comparing against the current branch degrades to the staged diff.
  const vsSelf = getStagedDiffSummary(repo, { refresh: true, base: 'feature' });
  assert.deepEqual(paths(vsSelf), ['c.txt', 'd.txt']);

  // Bad bases are rejected as such, never passed to git as options.
  for (const bad of ['nope', '--output=/tmp/x', '-h', 'a..b', 'main^{tree}']) {
    assert.throws(
      () => getStagedDiffSummary(repo, { refresh: true, base: bad }),
      (err) => err.code === 'INVALID_BASE',
      `"${bad}" should be an invalid base`,
    );
  }

  // The cache is per base, and a commit drops both entries.
  assert.deepEqual(paths(getStagedDiffSummary(repo)), ['c.txt', 'd.txt']);
  assert.deepEqual(paths(getStagedDiffSummary(repo, { base: 'main' })), [
    'a.txt',
    'c.txt',
    'd.txt',
  ]);
  commitChanges(repo, 'commit staged work');
  assert.deepEqual(paths(getStagedDiffSummary(repo)), []);
  assert.deepEqual(paths(getStagedDiffSummary(repo, { base: 'main' })), [
    'a.txt',
    'c.txt',
    'd.txt',
  ]);

  // Branch discovery.
  const branches = listBranches(repo);
  assert.deepEqual(branches.local.sort(), ['feature', 'main']);
  assert.deepEqual(branches.remote, []);
  assert.equal(detectDefaultBaseBranch(repo), 'main');

  // A remote-tracking default branch wins, preferring the local twin.
  git('update-ref', 'refs/remotes/origin/main', 'main');
  git('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');
  assert.deepEqual(listBranches(repo).remote, ['origin/main']);
  assert.equal(detectDefaultBaseBranch(repo), 'main');
  git('branch', '-q', '-m', 'main', 'trunk-old');
  assert.equal(detectDefaultBaseBranch(repo), 'origin/main');
  assert.deepEqual(
    paths(getStagedDiffSummary(repo, { refresh: true, base: 'origin/main' })),
    ['a.txt', 'c.txt', 'd.txt'],
  );

  console.log('base-diff-verify: all checks passed');
} finally {
  fs.rmSync(repo, { recursive: true, force: true });
}
