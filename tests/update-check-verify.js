// Scenario test for the update check behind the "What's New" prompt.
// Builds a throwaway upstream repo and a clone of it, then walks the clone
// through the situations the prompt has to describe accurately.
// Run with: node tests/update-check-verify.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { checkForUpdates, getBuildInfo } from '../lib/git.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'staging-update-check-'));
const upstream = path.join(root, 'upstream');
const clone = path.join(root, 'clone');
fs.mkdirSync(upstream);

function git(cwd, ...args) {
  const result = spawnSync(
    'git',
    ['-c', 'user.name=test', '-c', 'user.email=test@example.com', ...args],
    { cwd, encoding: 'utf-8' },
  );
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed:\n${result.stderr}`);
  }
  return result.stdout.trim();
}

function write(cwd, files) {
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(cwd, name), content);
  }
}

function commit(cwd, message) {
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-q', '-m', message);
  return git(cwd, 'rev-parse', 'HEAD');
}

const pkg = (version) => `${JSON.stringify({ name: 'staging', version })}\n`;
const released = [
  '## 0.2.0 - 2026-03-21',
  '',
  '### Features',
  "- What's New modal.",
  '',
  '## 0.1.0 - 2026-03-20',
  '',
  '### Features',
  '- Initial release.',
  '',
].join('\n');
const changelog = (...sections) =>
  ['# Changelog', '', ...sections, released].join('\n');

const unreleasedRange = '## Unreleased\n\n### Features\n- Range comments.\n';
const release030 =
  '## 0.3.0 - 2026-09-06\n\n### Features\n- Range comments.\n\n### Fixes\n- Accurate update prompt.\n';
const unreleasedSmall = '## Unreleased\n\n### Fixes\n- Something small.\n';

function upstreamAt(sha) {
  git(upstream, 'reset', '-q', '--hard', sha);
}

function cloneAt(sha) {
  git(clone, 'reset', '-q', '--hard', sha);
}

const titles = (result) => result.changelogEntries.map((entry) => entry.title);
const subjects = (result) => result.commits.map((entry) => entry.subject);

try {
  git(upstream, 'init', '-q', '-b', 'main');
  write(upstream, {
    'package.json': pkg('0.2.0'),
    'CHANGELOG.md': changelog(),
  });
  const A = commit(upstream, 'release 0.2.0');
  write(upstream, { 'CHANGELOG.md': changelog(unreleasedRange) });
  const B = commit(upstream, 'feat: range comments');
  write(upstream, {
    'package.json': pkg('0.3.0'),
    'CHANGELOG.md': changelog(release030),
  });
  const C = commit(upstream, 'release 0.3.0');
  write(upstream, { 'CHANGELOG.md': changelog(unreleasedSmall, release030) });
  const D = commit(upstream, 'fix: something small');
  write(upstream, { 'lib.js': 'x\n' });
  const E = commit(upstream, 'chore: no changelog touch');

  git(root, 'clone', '-q', upstream, clone);
  cloneAt(A);

  console.log('1. same version number, new commits with unreleased notes');
  upstreamAt(B);
  let result = checkForUpdates(clone);
  assert.equal(result.status, 'update-available');
  assert.equal(result.currentVersion, '0.2.0');
  assert.equal(result.latestVersion, '0.2.0');
  assert.equal(result.currentCommit, A);
  assert.equal(result.latestCommit, B);
  assert.equal(result.commitsBehind, 1);
  assert.deepEqual(titles(result), ['Unreleased']);
  assert.deepEqual(result.changelogEntries[0].features, ['Range comments.']);
  assert.deepEqual(subjects(result), ['feat: range comments']);

  console.log('2. bumped version: only entries newer than the current one');
  upstreamAt(C);
  result = checkForUpdates(clone);
  assert.equal(result.latestVersion, '0.3.0');
  assert.equal(result.latestCommit, C);
  assert.equal(result.commitsBehind, 2);
  assert.deepEqual(
    result.changelogEntries.map((entry) => [
      entry.title,
      entry.version,
      entry.date,
    ]),
    [['0.3.0 - 2026-09-06', '0.3.0', '2026-09-06']],
  );
  assert.deepEqual(result.changelogEntries[0].fixes, [
    'Accurate update prompt.',
  ]);

  console.log('3. bullets already in the local changelog are not repeated');
  cloneAt(B);
  result = checkForUpdates(clone);
  assert.equal(result.commitsBehind, 1);
  assert.deepEqual(
    result.changelogEntries.map((entry) => [
      entry.title,
      entry.features,
      entry.fixes,
    ]),
    [['0.3.0 - 2026-09-06', [], ['Accurate update prompt.']]],
  );

  console.log('4. unreleased section above a newer release: both listed');
  cloneAt(A);
  upstreamAt(D);
  result = checkForUpdates(clone);
  assert.deepEqual(titles(result), ['Unreleased', '0.3.0 - 2026-09-06']);
  assert.equal(result.commitsBehind, 3);

  console.log('5. changelog untouched by the new commits: commit list instead');
  cloneAt(D);
  upstreamAt(E);
  result = checkForUpdates(clone);
  assert.equal(result.status, 'update-available');
  assert.equal(result.currentVersion, '0.3.0');
  assert.equal(result.latestVersion, '0.3.0');
  assert.deepEqual(result.changelogEntries, []);
  assert.deepEqual(subjects(result), ['chore: no changelog touch']);

  console.log('6. pulled but not restarted: restart-needed, not up-to-date');
  cloneAt(A);
  const running = getBuildInfo(clone);
  assert.deepEqual(running, { version: '0.2.0', commit: A });
  git(clone, 'pull', '-q', 'origin', 'main');
  result = checkForUpdates(clone, running);
  assert.equal(result.status, 'restart-needed');
  assert.equal(result.currentVersion, '0.2.0');
  assert.equal(result.latestVersion, '0.3.0');
  assert.equal(result.currentCommit, A);
  assert.equal(result.latestCommit, E);

  console.log('7. same commit as origin/main: up-to-date');
  result = checkForUpdates(clone);
  assert.equal(result.status, 'up-to-date');
  assert.equal(result.latestVersion, '0.3.0');
  assert.equal(result.currentCommit, E);

  console.log('8. local commits ahead of origin/main are not an update');
  write(clone, { 'local.txt': 'y\n' });
  commit(clone, 'local work');
  result = checkForUpdates(clone);
  assert.equal(result.status, 'up-to-date');

  console.log('9. unknown local version: still only unseen bullets');
  cloneAt(A);
  result = checkForUpdates(clone, { version: null, commit: A });
  assert.equal(result.currentVersion, null);
  assert.deepEqual(titles(result), ['Unreleased', '0.3.0 - 2026-09-06']);

  console.log('\nAll update-check scenarios passed.');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
