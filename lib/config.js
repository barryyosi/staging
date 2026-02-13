import fs from 'node:fs';
import path from 'node:path';

const DEFAULTS = {
  port: 0,
  agentCommand: 'code -g {file}:1',
  diffContext: 3,
  autoOpen: true,
  reviewFileName: '.staging-review.md',
};

export function loadConfig(gitRoot) {
  const configPath = path.join(gitRoot, '.stagingrc.json');
  let userConfig = {};

  if (fs.existsSync(configPath)) {
    try {
      userConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch (err) {
      console.warn(`Warning: Could not parse .stagingrc.json: ${err.message}`);
    }
  }

  if (process.env.STAGING_PORT) {
    userConfig.port = parseInt(process.env.STAGING_PORT, 10);
  }

  return { ...DEFAULTS, ...userConfig };
}
