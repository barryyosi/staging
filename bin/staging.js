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

// Check for staged changes
const stagedFiles = execSync('git diff --cached --name-only', {
  cwd: gitRoot,
  encoding: 'utf-8',
}).trim();

if (!stagedFiles) {
  console.error('No staged changes found. Stage files with `git add` first.');
  process.exit(0);
}

const fileCount = stagedFiles.split('\n').length;
console.log(`Found ${fileCount} staged file${fileCount === 1 ? '' : 's'}.`);

// Load config
const config = loadConfig(gitRoot);

// Start server
const server = startServer({ gitRoot, config });

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
