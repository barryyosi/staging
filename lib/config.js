import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DEFAULTS = {
  port: 0,
  agentCommand: 'code -g {file}:1',
  diffContext: 3,
  autoOpen: true,
  reviewFileName: '.staging-review.md',
  sendMediums: ['clipboard', 'file'],
  // Branch to compare against on launch; null reviews the staged diff alone.
  baseBranch: null,
  // Look up an open pull/merge request for the current branch through the
  // platform CLI already installed and signed in (gh, glab, az) and default
  // the compare base to its target branch. Nothing leaves the machine
  // except through that CLI.
  detectPullRequest: true,
  // Force a platform ('github' | 'gitlab' | 'azure') instead of matching the
  // remote URL, e.g. for a self-hosted host.
  pullRequestProvider: null,
};

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (err) {
    console.warn(`Warning: Could not parse ${filePath}: ${err.message}`);
    return {};
  }
}

const PREFS_PATH = path.join(os.homedir(), '.staging-prefs.json');

export function loadConfig(gitRoot) {
  const globalConfig = readJsonFile(path.join(os.homedir(), '.stagingrc.json'));
  const projectConfig = readJsonFile(path.join(gitRoot, '.stagingrc.json'));

  const merged = { ...DEFAULTS, ...globalConfig, ...projectConfig };

  if (process.env.STAGING_PORT) {
    merged.port = parseInt(process.env.STAGING_PORT, 10);
  }

  return merged;
}

export function loadPreferences() {
  return readJsonFile(PREFS_PATH);
}

export function savePreferences(prefs) {
  const existing = readJsonFile(PREFS_PATH);
  const merged = { ...existing, ...prefs };
  fs.writeFileSync(PREFS_PATH, JSON.stringify(merged, null, 2), 'utf-8');
  return merged;
}
