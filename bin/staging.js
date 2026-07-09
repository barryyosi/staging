#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { loadConfig } from '../lib/config.js';
import { startServer } from '../lib/server.js';
import { openBrowser } from '../lib/open-browser.js';

// CLI args
const KNOWN_FLAGS = new Set(['--no-open', '-r', '--render']);
const args = process.argv.slice(2);
const unknownFlag = args.find((a) => a.startsWith('-') && !KNOWN_FLAGS.has(a));
if (unknownFlag) {
  console.error(
    `Error: unknown option "${unknownFlag}". Supported: -r, --render, --no-open.` +
      (unknownFlag.startsWith('--')
        ? ''
        : ` For a file named "${unknownFlag}", pass a path like ./${unknownFlag}.`),
  );
  process.exit(1);
}
const noOpen = args.includes('--no-open');
const renderFlag = args.includes('-r') || args.includes('--render');
const positional = args.find((a) => !a.startsWith('-'));
const targetPath = path.resolve(positional || '.');

// Keep in sync with PREVIEW_EXTS in src/utils/renderPreview.js
const PREVIEW_EXTS = new Set(['md', 'markdown', 'html', 'htm']);

const isFile = fs.existsSync(targetPath) && fs.statSync(targetPath).isFile();
const previewMode = renderFlag || isFile;

let gitRoot;
let configRoot;
let previewFile = null;

if (previewMode) {
  // Standalone file preview mode — no git repo required
  if (!isFile) {
    console.error(
      `Error: "${targetPath}" is not a file. Preview mode (-r/--render) requires a file path.`,
    );
    process.exit(1);
  }
  const ext = targetPath.split('.').pop()?.toLowerCase();
  if (!PREVIEW_EXTS.has(ext)) {
    console.error(
      `Error: cannot preview "${targetPath}" — supported extensions: .md, .markdown, .html, .htm`,
    );
    process.exit(1);
  }
  previewFile = targetPath;
  gitRoot = path.dirname(targetPath);
  console.log(`Preview mode: ${path.basename(targetPath)}`);

  // If the file lives inside a git repo, honor that project's .stagingrc.json
  // (the serving root stays the file's directory).
  try {
    configRoot = execSync('git rev-parse --show-toplevel', {
      cwd: gitRoot,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    configRoot = gitRoot;
  }
} else {
  // Validate target directory
  if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isDirectory()) {
    console.error(`Error: "${targetPath}" is not a valid directory.`);
    process.exit(1);
  }

  // Find git root
  try {
    gitRoot = execSync('git rev-parse --show-toplevel', {
      cwd: targetPath,
      encoding: 'utf-8',
    }).trim();
  } catch {
    console.error(`Error: "${targetPath}" is not inside a git repository.`);
    process.exit(1);
  }

  // Check staged files (but do not block startup when empty)
  const stagedFilesRaw = execSync('git diff --cached --name-only', {
    cwd: gitRoot,
    encoding: 'utf-8',
  });
  const stagedFiles = stagedFilesRaw
    .split('\n')
    .map((file) => file.trim())
    .filter(Boolean);
  const fileCount = stagedFiles.length;

  if (fileCount > 0) {
    console.log(`Found ${fileCount} staged file${fileCount === 1 ? '' : 's'}.`);
  } else {
    console.log('No staged files found. Opening staging for unstaged review.');
  }

  configRoot = gitRoot;
}

// Load config
const config = loadConfig(configRoot);

// CLI send callback — prints comments to terminal stdout, then exits
const onCliSend = (text) => {
  process.stdout.write(text + '\n');
  setTimeout(() => process.exit(0), 150);
};

// Start server
const server = startServer({ gitRoot, config, onCliSend, previewFile });

server.listen(config.port, '127.0.0.1', (info) => {
  const url = `http://127.0.0.1:${info.port}`;
  if (previewFile) {
    console.log(`Rendering ${path.basename(previewFile)} at ${url}`);
  } else {
    console.log(`Staging review at ${url}`);
  }

  if (config.autoOpen && !noOpen) {
    openBrowser(url);
  }
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  process.exit(0);
});
