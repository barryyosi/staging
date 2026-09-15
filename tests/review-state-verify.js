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
  loadComments,
  saveComments,
  loadReviewedMarks,
  saveReviewedMarks,
  setReviewedMark,
  clearReviewedMark,
  resolveReviewedFiles,
} from '../src/utils/reviewStorage.js';

const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'staging-review-state-'));

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

// A localStorage stand-in for the storage helpers
const memory = new Map();
globalThis.localStorage = {
  getItem: (key) => (memory.has(key) ? memory.get(key) : null),
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => memory.delete(key),
};

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

  // --- Reviewed marks ---
  let marks = loadReviewedMarks('/repo');
  assert.deepEqual(marks, {});
  marks = setReviewedMark(marks, 'a.txt', byPath['a.txt']);
  marks = setReviewedMark(marks, 'c.txt', byPath['c.txt']);
  saveReviewedMarks('/repo', marks);
  const restored = loadReviewedMarks('/repo');
  assert.deepEqual(Object.keys(restored).sort(), ['a.txt', 'c.txt']);

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
  saveReviewedMarks('/repo', {});
  assert.equal(memory.has('staging-reviewed:/repo'), false, 'empty = gone');
  assert.deepEqual(loadReviewedMarks(''), {}, 'no key, nothing loaded');

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
  saveComments('/repo', { commentsByFile: comments, generalNote: 'note' });

  // Same diff: everything but the unverifiable comment is live
  let loaded = loadComments('/repo', byPath);
  assert.equal(loaded.generalNote, 'note');
  assert.equal(Boolean(loaded.commentsByFile['a.txt'][0].stale), false);
  assert.equal(Boolean(loaded.commentsByFile['c.txt'][0].stale), false);
  assert.equal(loaded.commentsByFile['c.txt'][1].stale, true);

  // a.txt changed, c.txt gone from the diff: all stale
  loaded = loadComments('/repo', { 'a.txt': 'x:y' });
  assert.equal(loaded.commentsByFile['a.txt'][0].stale, true);
  assert.equal(loaded.commentsByFile['c.txt'][0].stale, true);

  // No fingerprints to check against (preview mode): nothing is flagged
  loaded = loadComments('/repo', null);
  assert.equal('stale' in loaded.commentsByFile['a.txt'][0], false);

  // markStaleComments keeps object identity when nothing changes
  const marked = markStaleComments(loaded.commentsByFile, byPath);
  const again = markStaleComments(marked, byPath);
  assert.equal(again['a.txt'][0], marked['a.txt'][0]);

  saveComments('/repo', { commentsByFile: {}, generalNote: null });
  assert.equal(memory.has('staging-comments:/repo'), false);
  assert.deepEqual(loadComments('', byPath), {
    commentsByFile: {},
    generalNote: null,
  });

  // Corrupt storage is ignored rather than thrown
  memory.set('staging-comments:/bad', '{not json');
  assert.deepEqual(loadComments('/bad', byPath).commentsByFile, {});

  console.log('review-state-verify: all assertions passed');
} finally {
  fs.rmSync(repo, { recursive: true, force: true });
}
