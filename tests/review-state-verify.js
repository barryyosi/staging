// Scenario test for review state that survives a reopen: the per-file diff
// fingerprint the summary carries, and the storage helpers that decide which
// reviewed marks and comments come back from it.
// Run with: node tests/review-state-verify.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { getStagedDiffSummary } from '../lib/git.js';
import {
  markStaleComments,
  setReviewedMark,
  clearReviewedMark,
  resolveReviewedFiles,
} from '../src/utils/reviewStorage.js';

const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'staging-review-state-'));
// The on-disk store reads its directory at import time
const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'staging-state-dir-'));
process.env.STAGING_STATE_DIR = stateDir;
const { loadReviewState, saveReviewState } =
  await import('../lib/review-state.js');

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

const summary = () => getStagedDiffSummary(repo, { refresh: true });
const fingerprints = (s) =>
  Object.fromEntries(s.files.map((f) => [f.to || f.from, f.fingerprint]));

try {
  // --- Fingerprints from git ---
  git('init', '-q', '-b', 'main');
  write({ 'a.txt': 'a1\n', 'b.txt': 'b1\n' });
  git('add', '-A');
  git('commit', '-q', '-m', 'initial');

  write({ 'a.txt': 'a1\na2\n', 'c.txt': 'c1\n' });
  git('rm', '-q', 'b.txt');
  git('add', '-A');
  const first = summary();
  const byPath = fingerprints(first);
  assert.deepEqual(Object.keys(byPath).sort(), ['a.txt', 'b.txt', 'c.txt']);
  for (const fingerprint of Object.values(byPath)) {
    assert.match(fingerprint, /^[0-9a-f]{40}:[0-9a-f]{40}$/);
  }
  assert.equal(
    first.files.find((f) => f.from === 'b.txt').status,
    'deleted',
    'status still comes through the raw record',
  );
  assert.equal(first.files.find((f) => f.to === 'c.txt').status, 'added');
  assert.equal(first.totalAdditions, 2);
  assert.equal(first.totalDeletions, 1);

  // Re-reading the same index gives the same fingerprints...
  assert.deepEqual(fingerprints(summary()), byPath);

  // ...restaging a file with different content changes only that one...
  write({ 'a.txt': 'a1\na2\na3\n' });
  git('add', 'a.txt');
  const second = fingerprints(summary());
  assert.notEqual(second['a.txt'], byPath['a.txt']);
  assert.equal(second['c.txt'], byPath['c.txt']);

  // ...and restaging the original content restores it.
  write({ 'a.txt': 'a1\na2\n' });
  git('add', 'a.txt');
  assert.deepEqual(fingerprints(summary()), byPath);

  // A rename of a committed file records both blobs under the new path.
  git('commit', '-q', '-m', 'staged work');
  write({ 'd.txt': 'd1\n' });
  git('add', 'd.txt');
  git('commit', '-q', '-m', 'add d');
  git('mv', 'd.txt', 'renamed.txt');
  const renamed = summary().files.find((f) => f.to === 'renamed.txt');
  assert.equal(renamed.status, 'renamed');
  assert.equal(renamed.from, 'd.txt');
  const [oldBlob, newBlob] = renamed.fingerprint.split(':');
  assert.equal(oldBlob, newBlob, 'a pure rename keeps the blob');
  assert.equal(oldBlob, git('rev-parse', 'HEAD:d.txt'));

  // --- Reviewed marks (on disk, per project) ---
  assert.deepEqual(loadReviewState('/repo'), {
    comments: null,
    reviewed: null,
  });
  let marks = {};
  marks = setReviewedMark(marks, 'a.txt', byPath['a.txt']);
  marks = setReviewedMark(marks, 'c.txt', byPath['c.txt']);
  saveReviewState('/repo', 'reviewed', marks);
  const restored = loadReviewState('/repo').reviewed;
  assert.deepEqual(Object.keys(restored).sort(), ['a.txt', 'c.txt']);
  assert.equal(fs.readdirSync(stateDir).length, 1, 'one file per project');

  // Unchanged files come back reviewed, a changed one does not, and a file
  // that left the diff is simply not counted.
  assert.deepEqual([...resolveReviewedFiles(restored, byPath)].sort(), [
    'a.txt',
    'c.txt',
  ]);
  assert.deepEqual(
    [...resolveReviewedFiles(restored, { ...byPath, 'a.txt': 'x:y' })],
    ['c.txt'],
  );
  assert.deepEqual([...resolveReviewedFiles(restored, {})], []);

  marks = clearReviewedMark(restored, 'a.txt');
  assert.deepEqual(Object.keys(marks), ['c.txt']);
  saveReviewState('/repo', 'reviewed', {});
  assert.equal(fs.readdirSync(stateDir).length, 0, 'empty review = no file');
  assert.deepEqual(loadReviewState(''), { comments: null, reviewed: null });

  // --- Comments ---
  const comments = {
    'a.txt': [
      {
        id: '1',
        file: 'a.txt',
        line: 2,
        content: 'x',
        fingerprint: byPath['a.txt'],
      },
    ],
    'c.txt': [
      {
        id: '2',
        file: 'c.txt',
        line: 1,
        content: 'y',
        fingerprint: byPath['c.txt'],
      },
      { id: '3', file: 'c.txt', line: 1, content: 'z', fingerprint: null },
    ],
  };
  saveReviewState('/repo', 'comments', {
    commentsByFile: comments,
    generalNote: 'note',
  });

  // Loading returns the comments as stored; judging is a separate step
  const loaded = loadReviewState('/repo').comments;
  assert.equal(loaded.generalNote, 'note');
  assert.deepEqual(loaded.commentsByFile, comments);
  // Sections are independent: writing one keeps the other
  saveReviewState('/repo', 'reviewed', {
    'a.txt': { fingerprint: 'f', at: 1 },
  });
  assert.deepEqual(loadReviewState('/repo').comments, loaded);
  assert.deepEqual(loadReviewState('/repo').reviewed, {
    'a.txt': { fingerprint: 'f', at: 1 },
  });

  // Same diff: everything but the unverifiable comment is live
  let judged = markStaleComments(loaded.commentsByFile, byPath);
  assert.equal(Boolean(judged['a.txt'][0].stale), false);
  assert.equal(Boolean(judged['c.txt'][0].stale), false);
  assert.equal(judged['c.txt'][1].stale, true);

  // a.txt changed, c.txt gone from the diff: all stale
  const allStale = markStaleComments(judged, { 'a.txt': 'x:y' });
  assert.equal(allStale['a.txt'][0].stale, true);
  assert.equal(allStale['c.txt'][0].stale, true);

  // Judged again against a diff where the files match (a compare base that
  // covers them): the flags clear. This is the `--pr` reopen, where the
  // staged diff answers first and the request's base later.
  const revived = markStaleComments(allStale, byPath);
  assert.equal(revived['a.txt'][0].stale, false);
  assert.equal(revived['c.txt'][0].stale, false);
  assert.equal(revived['c.txt'][1].stale, true, 'still unverifiable');

  // No fingerprints to check against (preview mode): untouched
  assert.equal(markStaleComments(allStale, null), allStale);

  // The very same map comes back when nothing moved, so a no-op judge never
  // triggers a save; a real change yields a new map
  assert.equal(markStaleComments(judged, byPath), judged);
  assert.notEqual(markStaleComments(judged, {}), judged);

  // A comment written this session is never flagged by a re-judge (the
  // staged view answering before `--pr` switches the base): it follows the
  // file's current fingerprint instead. Older comments are judged as usual.
  const sessionStart = 1_000_000;
  const mixed = {
    'a.txt': [
      { id: 'old', file: 'a.txt', timestamp: 1, fingerprint: 'head:idx' },
      {
        id: 'new',
        file: 'a.txt',
        timestamp: sessionStart,
        fingerprint: 'head:idx',
      },
    ],
  };
  const rejudged = markStaleComments(
    mixed,
    { 'a.txt': 'base:idx' },
    sessionStart,
  );
  assert.equal(rejudged['a.txt'][0].stale, true);
  assert.equal(rejudged['a.txt'][1].stale, false);
  assert.equal(rejudged['a.txt'][1].fingerprint, 'base:idx');
  // ...and keeps its old fingerprint when the file left the diff
  const gone = markStaleComments(mixed, {}, sessionStart);
  assert.equal(Boolean(gone['a.txt'][1].stale), false);
  assert.equal(gone['a.txt'][1].fingerprint, 'head:idx');
  assert.equal(gone['a.txt'][0].stale, true);

  console.log('review-state-verify: all assertions passed');
} finally {
  fs.rmSync(repo, { recursive: true, force: true });
  fs.rmSync(stateDir, { recursive: true, force: true });
}
