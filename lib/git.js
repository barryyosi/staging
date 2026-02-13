const { execSync } = require('child_process');

function getFileStatuses(gitRoot) {
  const raw = execSync('git diff --cached --name-status', {
    cwd: gitRoot,
    encoding: 'utf-8',
  }).trim();

  const statuses = {};
  if (!raw) return statuses;

  for (const line of raw.split('\n')) {
    const parts = line.split('\t');
    const statusCode = parts[0].charAt(0);
    const filePath = parts[parts.length - 1];
    const statusMap = { A: 'added', M: 'modified', D: 'deleted', R: 'renamed', C: 'copied' };
    statuses[filePath] = statusMap[statusCode] || 'modified';
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

function getStagedDiff(gitRoot, contextLines = 3) {
  const rawDiff = execSync(`git diff --cached --unified=${contextLines} --no-color`, {
    cwd: gitRoot,
    encoding: 'utf-8',
    maxBuffer: 50 * 1024 * 1024,
  });

  const parsed = parseDiff(rawDiff);
  const statuses = getFileStatuses(gitRoot);

  // Merge statuses from --name-status into parsed files
  for (const file of parsed.files) {
    const filePath = file.to || file.from;
    if (filePath && statuses[filePath]) {
      file.status = statuses[filePath];
    }
  }

  return parsed;
}

function commitChanges(gitRoot, message) {
  const escaped = message.replace(/'/g, "'\\''");
  const output = execSync(`git commit -m '${escaped}'`, {
    cwd: gitRoot,
    encoding: 'utf-8',
  });
  return output;
}

module.exports = { getStagedDiff, parseDiff, getFileStatuses, commitChanges };
