import { execSync, execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const STATUS_MAP = { A: 'added', M: 'modified', D: 'deleted', R: 'renamed', C: 'copied' };
const GIT_BUFFER_SIZE = 50 * 1024 * 1024;
const DEFAULT_PAGE_SIZE = 40;
const MAX_PAGE_SIZE = 250;
const summaryCache = new Map();

function toInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getDiffFileKey(file) {
  return file.to || file.from || '';
}

function runGit(gitRoot, args) {
  return execFileSync('git', args, {
    cwd: gitRoot,
    encoding: 'utf-8',
    maxBuffer: GIT_BUFFER_SIZE,
  });
}

function getStagedFileEntries(gitRoot) {
  const raw = runGit(gitRoot, ['diff', '--cached', '--name-status', '-z']);
  if (!raw) return [];

  const tokens = raw.split('\0').filter(Boolean);
  const files = [];

  for (let i = 0; i < tokens.length;) {
    const statusToken = tokens[i++];
    if (!statusToken) continue;

    const statusCode = statusToken.charAt(0);
    let from = null;
    let to = null;

    if (statusCode === 'R' || statusCode === 'C') {
      from = tokens[i++] || null;
      to = tokens[i++] || null;
    } else {
      const path = tokens[i++] || null;
      from = path;
      to = path;
      if (statusCode === 'A') from = null;
      if (statusCode === 'D') to = null;
    }

    files.push({
      from,
      to,
      status: STATUS_MAP[statusCode] || 'modified',
      additions: 0,
      deletions: 0,
    });
  }

  return files;
}

function getFileStats(gitRoot) {
  const raw = runGit(gitRoot, ['diff', '--cached', '--numstat', '-z']);
  if (!raw) return {};

  const tokens = raw.split('\0');
  const stats = {};

  for (let i = 0; i < tokens.length;) {
    const entry = tokens[i++];
    if (!entry) continue;

    const [addRaw, delRaw, pathRaw = ''] = entry.split('\t');
    const additions = toInt(addRaw, 0);
    const deletions = toInt(delRaw, 0);
    let filePath = pathRaw;

    // For rename/copy records, git emits "add<TAB>del<TAB>" followed by old/new paths.
    if (!filePath) {
      const from = tokens[i++] || '';
      const to = tokens[i++] || '';
      filePath = to || from;
    }

    if (!filePath) continue;
    stats[filePath] = { additions, deletions };
  }

  return stats;
}

function getFileStatuses(gitRoot) {
  const statuses = {};
  const files = getStagedFileEntries(gitRoot);
  for (const file of files) {
    const filePath = getDiffFileKey(file);
    if (!filePath) continue;
    statuses[filePath] = file.status;
  }
  return statuses;
}

function parseDiff(rawDiff) {
  const files = [];
  let currentFile = null;
  let currentChunk = null;
  let oldLineNum = 0;
  let newLineNum = 0;

  const lines = rawDiff.split('\n');

  for (const line of lines) {
    // File header — also extract paths as fallback
    if (line.startsWith('diff --git ')) {
      // Parse "diff --git a/path b/path"
      const gitMatch = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
      currentFile = {
        from: gitMatch ? gitMatch[1] : null,
        to: gitMatch ? gitMatch[2] : null,
        status: 'modified',
        additions: 0,
        deletions: 0,
        isBinary: false,
        chunks: [],
      };
      files.push(currentFile);
      currentChunk = null;
      continue;
    }

    if (!currentFile) continue;

    // Binary file
    if (line.startsWith('Binary files ')) {
      currentFile.isBinary = true;
      continue;
    }

    // Rename from/to
    if (line.startsWith('rename from ')) {
      currentFile.from = line.slice(12);
      currentFile.status = 'renamed';
      continue;
    }
    if (line.startsWith('rename to ')) {
      currentFile.to = line.slice(10);
      continue;
    }

    // Old file path
    if (line.startsWith('--- ')) {
      const p = line.slice(4);
      currentFile.from = p === '/dev/null' ? null : p.replace(/^a\//, '');
      if (p === '/dev/null') currentFile.status = 'added';
      continue;
    }

    // New file path
    if (line.startsWith('+++ ')) {
      const p = line.slice(4);
      currentFile.to = p === '/dev/null' ? null : p.replace(/^b\//, '');
      if (p === '/dev/null') currentFile.status = 'deleted';
      continue;
    }

    // Hunk header
    const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/);
    if (hunkMatch) {
      oldLineNum = parseInt(hunkMatch[1], 10);
      newLineNum = parseInt(hunkMatch[3], 10);
      currentChunk = {
        header: line,
        oldStart: oldLineNum,
        oldLines: parseInt(hunkMatch[2] || '1', 10),
        newStart: newLineNum,
        newLines: parseInt(hunkMatch[4] || '1', 10),
        context: hunkMatch[5].trim(),
        changes: [],
      };
      currentFile.chunks.push(currentChunk);
      continue;
    }

    // Skip non-chunk lines (index, mode, similarity, etc.)
    if (!currentChunk) continue;

    // Context line
    if (line.startsWith(' ')) {
      currentChunk.changes.push({
        type: 'context',
        ln1: oldLineNum,
        ln2: newLineNum,
        content: line.slice(1),
      });
      oldLineNum++;
      newLineNum++;
      continue;
    }

    // Deletion
    if (line.startsWith('-')) {
      currentChunk.changes.push({
        type: 'del',
        ln: oldLineNum,
        content: line.slice(1),
      });
      oldLineNum++;
      currentFile.deletions++;
      continue;
    }

    // Addition
    if (line.startsWith('+')) {
      currentChunk.changes.push({
        type: 'add',
        ln: newLineNum,
        content: line.slice(1),
      });
      newLineNum++;
      currentFile.additions++;
      continue;
    }

    // "No newline at end of file" marker — skip
    if (line.startsWith('\\')) {
      continue;
    }
  }

  return { files };
}

function mergeSummaryIntoParsedFiles(parsedFiles, summaryFiles) {
  const parsedByPath = new Map();
  for (const parsedFile of parsedFiles) {
    const filePath = getDiffFileKey(parsedFile);
    if (!filePath) continue;
    parsedByPath.set(filePath, parsedFile);
  }

  return summaryFiles.map((summaryFile) => {
    const filePath = getDiffFileKey(summaryFile);
    const parsedFile = filePath ? parsedByPath.get(filePath) : null;

    if (!parsedFile) {
      return {
        ...summaryFile,
        isBinary: false,
        chunks: [],
      };
    }

    return {
      ...parsedFile,
      status: summaryFile.status,
      additions: summaryFile.additions,
      deletions: summaryFile.deletions,
    };
  });
}

function buildStagedDiffSummary(gitRoot) {
  const files = getStagedFileEntries(gitRoot);
  const statsByPath = getFileStats(gitRoot);

  let totalAdditions = 0;
  let totalDeletions = 0;

  for (const file of files) {
    const filePath = getDiffFileKey(file);
    const stats = filePath ? statsByPath[filePath] : null;
    file.additions = stats ? stats.additions : 0;
    file.deletions = stats ? stats.deletions : 0;
    totalAdditions += file.additions;
    totalDeletions += file.deletions;
  }

  return {
    files,
    totalFiles: files.length,
    totalAdditions,
    totalDeletions,
  };
}

function getStagedDiffSummary(gitRoot, { refresh = false } = {}) {
  if (!refresh) {
    const cachedSummary = summaryCache.get(gitRoot);
    if (cachedSummary) return cachedSummary;
  }

  const summary = buildStagedDiffSummary(gitRoot);
  summaryCache.set(gitRoot, summary);
  return summary;
}

function getStagedDiffPage(gitRoot, { contextLines = 3, offset = 0, limit = DEFAULT_PAGE_SIZE } = {}) {
  const summary = getStagedDiffSummary(gitRoot);
  const safeOffset = Math.max(0, toInt(offset, 0));
  const safeLimit = Math.max(1, Math.min(MAX_PAGE_SIZE, toInt(limit, DEFAULT_PAGE_SIZE)));
  const summaryFiles = summary.files.slice(safeOffset, safeOffset + safeLimit);

  let parsedFiles = [];
  const pagePaths = summaryFiles.map(getDiffFileKey).filter(Boolean);
  if (pagePaths.length > 0) {
    const rawDiff = runGit(gitRoot, [
      'diff',
      '--cached',
      `--unified=${contextLines}`,
      '--no-color',
      '--',
      ...pagePaths,
    ]);
    parsedFiles = parseDiff(rawDiff).files;
  }

  const files = mergeSummaryIntoParsedFiles(parsedFiles, summaryFiles);
  const nextOffset = safeOffset + summaryFiles.length;

  return {
    files,
    totalFiles: summary.totalFiles,
    totalAdditions: summary.totalAdditions,
    totalDeletions: summary.totalDeletions,
    offset: safeOffset,
    limit: safeLimit,
    nextOffset,
    hasMore: nextOffset < summary.totalFiles,
  };
}

function getStagedDiff(gitRoot, contextLines = 3) {
  const summary = getStagedDiffSummary(gitRoot);
  if (summary.files.length === 0) return { files: [] };

  const rawDiff = runGit(gitRoot, [
    'diff',
    '--cached',
    `--unified=${contextLines}`,
    '--no-color',
  ]);
  const parsed = parseDiff(rawDiff);

  return {
    files: mergeSummaryIntoParsedFiles(parsed.files, summary.files),
  };
}

function commitChanges(gitRoot, message) {
  const escaped = message.replace(/'/g, "'\\''");
  const output = execSync(`git commit -m '${escaped}'`, {
    cwd: gitRoot,
    encoding: 'utf-8',
  });
  summaryCache.delete(gitRoot);
  return output;
}

function clearSummaryCache() {
  summaryCache.clear();
}

function getCurrentBranch(gitRoot) {
  return runGit(gitRoot, ['rev-parse', '--abbrev-ref', 'HEAD']).trim();
}

function discoverSiblingProjects(gitRoot) {
  const parentDir = path.dirname(gitRoot);
  let entries;
  try {
    entries = fs.readdirSync(parentDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const projects = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const entryPath = path.join(parentDir, entry.name);
    const gitDir = path.join(entryPath, '.git');
    if (!fs.existsSync(gitDir)) continue;

    // Verify it's a valid git repo (has at least one commit)
    try {
      execFileSync('git', ['rev-parse', '--verify', 'HEAD'], {
        cwd: entryPath,
        stdio: 'ignore',
      });
    } catch {
      continue;
    }

    let hasStagedChanges = false;
    try {
      execFileSync('git', ['diff', '--cached', '--quiet'], {
        cwd: entryPath,
        encoding: 'utf-8',
      });
    } catch {
      hasStagedChanges = true;
    }

    projects.push({ name: entry.name, path: entryPath, hasStagedChanges });
  }

  return projects;
}

function listWorktrees(gitRoot) {
  let raw;
  try {
    raw = runGit(gitRoot, ['worktree', 'list', '--porcelain']);
  } catch {
    return [];
  }

  const worktrees = [];
  let current = {};

  for (const line of raw.split('\n')) {
    if (line.startsWith('worktree ')) {
      current = { path: line.slice(9) };
    } else if (line.startsWith('branch refs/heads/')) {
      current.branch = line.slice(18);
    } else if (line === '') {
      if (current.path) {
        current.isCurrent = path.resolve(current.path) === path.resolve(gitRoot);
        current.branch = current.branch || 'HEAD (detached)';
        worktrees.push(current);
      }
      current = {};
    }
  }

  if (current.path) {
    current.isCurrent = path.resolve(current.path) === path.resolve(gitRoot);
    current.branch = current.branch || 'HEAD (detached)';
    worktrees.push(current);
  }

  return worktrees;
}

function getTrackedFiles(gitRoot) {
  const raw = runGit(gitRoot, ['ls-files', '-z']);
  if (!raw) return [];
  return raw.split('\0').filter(Boolean);
}

function buildHunkPatch(gitRoot, filePath, chunkIndex, expectedOldStart) {
  const rawDiff = runGit(gitRoot, ['diff', '--cached', '--no-color', '--', filePath]);
  const parsed = parseDiff(rawDiff);

  const file = parsed.files.find((f) => (f.to || f.from) === filePath);
  if (!file) throw new Error(`File "${filePath}" not found in staged diff`);
  if (chunkIndex < 0 || chunkIndex >= file.chunks.length) {
    throw new Error(`Chunk index ${chunkIndex} out of range (file has ${file.chunks.length} chunks)`);
  }

  const chunk = file.chunks[chunkIndex];
  if (chunk.oldStart !== expectedOldStart) {
    throw new Error(
      `Stale diff: expected oldStart=${expectedOldStart} but got ${chunk.oldStart}. Please refresh.`
    );
  }

  const fromPath = file.from ? `a/${file.from}` : '/dev/null';
  const toPath = file.to ? `b/${file.to}` : '/dev/null';

  const lines = [
    `--- ${fromPath}`,
    `+++ ${toPath}`,
    chunk.header,
  ];

  for (const change of chunk.changes) {
    if (change.type === 'add') lines.push(`+${change.content}`);
    else if (change.type === 'del') lines.push(`-${change.content}`);
    else lines.push(` ${change.content}`);
  }

  lines.push('');
  return lines.join('\n');
}

function unstageHunk(gitRoot, filePath, chunkIndex, oldStart) {
  const patch = buildHunkPatch(gitRoot, filePath, chunkIndex, oldStart);
  const result = spawnSync('git', ['apply', '--cached', '--reverse'], {
    cwd: gitRoot,
    input: patch,
    encoding: 'utf-8',
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || 'Failed to unstage hunk');
  }

  summaryCache.delete(gitRoot);
}

function revertHunk(gitRoot, filePath, chunkIndex, oldStart) {
  const patch = buildHunkPatch(gitRoot, filePath, chunkIndex, oldStart);

  // First unstage from index
  const unstageResult = spawnSync('git', ['apply', '--cached', '--reverse'], {
    cwd: gitRoot,
    input: patch,
    encoding: 'utf-8',
  });
  if (unstageResult.status !== 0) {
    throw new Error(unstageResult.stderr || 'Failed to unstage hunk');
  }

  // Then discard from working tree
  const revertResult = spawnSync('git', ['apply', '--reverse'], {
    cwd: gitRoot,
    input: patch,
    encoding: 'utf-8',
  });
  if (revertResult.status !== 0) {
    throw new Error(revertResult.stderr || 'Failed to revert hunk from working tree');
  }

  summaryCache.delete(gitRoot);
}

function unstageFile(gitRoot, filePath) {
  const result = spawnSync('git', ['reset', 'HEAD', '--', filePath], {
    cwd: gitRoot,
    encoding: 'utf-8',
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || 'Failed to unstage file');
  }
  summaryCache.delete(gitRoot);
}

function revertFile(gitRoot, filePath) {
  // First unstage
  unstageFile(gitRoot, filePath);
  // Then discard working tree changes
  const result = spawnSync('git', ['checkout', 'HEAD', '--', filePath], {
    cwd: gitRoot,
    encoding: 'utf-8',
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || 'Failed to revert file');
  }
}

export {
  getStagedDiff,
  getStagedDiffPage,
  getStagedDiffSummary,
  parseDiff,
  getFileStatuses,
  commitChanges,
  clearSummaryCache,
  getCurrentBranch,
  discoverSiblingProjects,
  listWorktrees,
  getTrackedFiles,
  unstageHunk,
  revertHunk,
  unstageFile,
  revertFile,
};
