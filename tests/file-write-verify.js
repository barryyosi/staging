// Scenario test for whole-file edits from the preview: writeStagedFile
// replaces the index copy of a file and refuses to clobber unstaged work.
// Run with: node tests/file-write-verify.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  getStagedFileContent,
  getWorkingTreeFileContent,
  writeStagedFile,
} from '../lib/git.js';

const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'staging-file-write-'));

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

const write = (name, content) =>
  fs.writeFileSync(path.join(repo, name), content);

try {
  git('init', '-q', '-b', 'main');
  write('doc.md', '# Title\n\nv1\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'initial');

  write('doc.md', '# Title\n\nv2\n');
  git('add', 'doc.md');

  // Same text as the index: nothing written, nothing staged
  assert.deepEqual(writeStagedFile(repo, 'doc.md', '# Title\n\nv2\n'), {
    changed: false,
  });
  assert.equal(git('status', '--porcelain'), 'M  doc.md');

  // New text lands in the working tree and the index, byte for byte
  assert.deepEqual(writeStagedFile(repo, 'doc.md', '# Title\n\nv3\n'), {
    changed: true,
  });
  assert.equal(getStagedFileContent(repo, 'doc.md'), '# Title\n\nv3\n');
  assert.equal(getWorkingTreeFileContent(repo, 'doc.md'), '# Title\n\nv3\n');
  assert.equal(git('status', '--porcelain'), 'M  doc.md');

  // Unstaged edits in the working tree are never overwritten
  write('doc.md', '# Title\n\nv3\n\nunstaged\n');
  assert.throws(
    () => writeStagedFile(repo, 'doc.md', '# Title\n\nv4\n'),
    (err) => err.code === 'UNSTAGED_CHANGES',
  );
  assert.equal(
    getWorkingTreeFileContent(repo, 'doc.md'),
    '# Title\n\nv3\n\nunstaged\n',
  );
  assert.equal(getStagedFileContent(repo, 'doc.md'), '# Title\n\nv3\n');

  // Under autocrlf a clean checkout reads as CRLF while the index holds LF;
  // that must not count as unstaged changes
  git('config', 'core.autocrlf', 'true');
  fs.rmSync(path.join(repo, 'doc.md'));
  git('checkout', '--', 'doc.md');
  assert.equal(
    getWorkingTreeFileContent(repo, 'doc.md'),
    '# Title\r\n\r\nv3\r\n',
  );
  assert.equal(git('status', '--porcelain'), 'M  doc.md', 'clean checkout');
  assert.deepEqual(writeStagedFile(repo, 'doc.md', '# Title\n\nv4\n'), {
    changed: true,
  });
  assert.equal(getStagedFileContent(repo, 'doc.md'), '# Title\n\nv4\n');
  git('config', '--unset', 'core.autocrlf');
  write('doc.md', '# Title\n\nv4\n');

  // A file deleted from the working tree but still staged can be rewritten
  fs.rmSync(path.join(repo, 'doc.md'));
  assert.deepEqual(writeStagedFile(repo, 'doc.md', '# Title\n\nv5\n'), {
    changed: true,
  });
  assert.equal(getStagedFileContent(repo, 'doc.md'), '# Title\n\nv5\n');
  assert.equal(git('status', '--porcelain'), 'M  doc.md');

  console.log('file-write-verify: all assertions passed');
} finally {
  fs.rmSync(repo, { recursive: true, force: true });
}
