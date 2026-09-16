#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawnSync } from 'node:child_process';
import { loadConfig } from '../lib/config.js';
import { startServer } from '../lib/server.js';
import { openBrowser } from '../lib/open-browser.js';

// CLI args
const KNOWN_FLAGS = new Set(['--no-open', '-r', '--render', '--base', '--pr']);
const args = process.argv.slice(2);
const flags = new Set();
const positionals = [];
let baseBranch;
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (!arg.startsWith('-')) {
    positionals.push(arg);
    continue;
  }
  if (arg === '--base' || arg.startsWith('--base=')) {
    baseBranch = arg === '--base' ? args[++i] : arg.slice('--base='.length);
    if (!baseBranch || baseBranch.startsWith('-')) {
      console.error('Error: --base requires a branch name, e.g. --base main.');
      process.exit(1);
    }
    continue;
  }
  if (!KNOWN_FLAGS.has(arg)) {
    console.error(
      `Error: unknown option "${arg}". Supported: -r, --render, --base <branch>, --pr, --no-open.` +
        (arg.startsWith('--')
          ? ''
          : ` For a file named "${arg}", pass a path like ./${arg}.`),
    );
    process.exit(1);
  }
  flags.add(arg);
}
const noOpen = flags.has('--no-open');
const renderFlag = flags.has('-r') || flags.has('--render');
const prFlag = flags.has('--pr');
const positional = positionals[0];
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

  configRoot = gitRoot;
}

// Load config
const config = loadConfig(configRoot);

if (baseBranch) {
  if (previewMode) {
    console.error('Error: --base does not apply to preview mode.');
    process.exit(1);
  }
  const check = spawnSync(
    'git',
    ['rev-parse', '--verify', '--quiet', `${baseBranch}^{commit}`],
    { cwd: gitRoot, encoding: 'utf-8' },
  );
  if (check.status !== 0) {
    console.error(`Error: base branch "${baseBranch}" not found.`);
    process.exit(1);
  }
  config.baseBranch = baseBranch;
}
if (prFlag) {
  if (previewMode) {
    console.error('Error: --pr does not apply to preview mode.');
    process.exit(1);
  }
  if (baseBranch) {
    console.error('Error: --pr and --base cannot be combined.');
    process.exit(1);
  }
  if (!config.detectPullRequest) {
    console.error(
      'Error: --pr needs pull request detection, which detectPullRequest turns off in config.',
    );
    process.exit(1);
  }
  config.basePullRequest = true;
}
if (config.baseBranch) {
  // A base from .stagingrc.json is checked by the UI, which falls back to
  // the staged diff with a toast if it does not resolve
  console.log(`Comparing against ${config.baseBranch}.`);
} else if (!previewMode) {
  if (config.basePullRequest && config.detectPullRequest) {
    console.log(
      'Comparing against the open pull request target once it is found.',
    );
  }
  // Count staged files (but do not block startup when empty)
  const fileCount = execSync('git diff --cached --name-only', {
    cwd: gitRoot,
    encoding: 'utf-8',
  })
    .split('\n')
    .filter((file) => file.trim()).length;
  if (fileCount > 0) {
    console.log(`Found ${fileCount} staged file${fileCount === 1 ? '' : 's'}.`);
  } else {
    console.log('No staged files found. Opening staging for unstaged review.');
  }
}

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
