#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { loadConfig } from '../lib/config.js';
import { startServer } from '../lib/server.js';
import { openBrowser } from '../lib/open-browser.js';

const targetPath = path.resolve(process.argv[2] || '.');

// Validate target directory
if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isDirectory()) {
  console.error(`Error: "${targetPath}" is not a valid directory.`);
  process.exit(1);
}

// Find git root
let gitRoot;
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

// Load config
const config = loadConfig(gitRoot);

// CLI send callback — prints comments to terminal stdout, then exits
const onCliSend = (text) => {
  process.stdout.write(text + '\n');
  setTimeout(() => process.exit(0), 150);
};

// Start server
const server = startServer({ gitRoot, config, onCliSend });

server.listen(config.port, '127.0.0.1', (info) => {
  const url = `http://127.0.0.1:${info.port}`;
  console.log(`Staging review at ${url}`);

  if (config.autoOpen) {
    openBrowser(url);
  }
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  process.exit(0);
});
