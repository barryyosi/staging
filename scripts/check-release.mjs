#!/usr/bin/env node
// Every merge to main is a release: the update prompt ships origin/main to
// users as-is. This guard refuses a checkout whose code moved without a
// version bump and a changelog entry describing it.
//
//   node scripts/check-release.mjs                 # changelog matches package.json
//   node scripts/check-release.mjs --against REF   # ...and version > REF when code changed
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHIPPED_PREFIXES = ['src/', 'lib/', 'bin/'];
const failures = [];

function git(...args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf-8' });
  return result.status === 0 ? result.stdout : null;
}

function readVersion(rawPackageJson) {
  try {
    return JSON.parse(rawPackageJson).version || null;
  } catch {
    return null;
  }
}

function compareVersions(a, b) {
  const parse = (v) =>
    String(v)
      .split('-')[0]
      .split('.')
      .map((n) => parseInt(n, 10) || 0);
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i++) {
    if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
  }
  return 0;
}

const version = readVersion(
  fs.readFileSync(path.join(root, 'package.json'), 'utf-8'),
);
const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf-8');
const headings = [...changelog.matchAll(/^##\s+(.+)$/gm)].map((m) =>
  m[1].trim(),
);
const top = headings[0] || '';
const topVersion = top.match(/\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/)?.[0] || null;

if (!version) failures.push('package.json has no version.');
if (headings.some((h) => /^unreleased\b/i.test(h))) {
  failures.push(
    'CHANGELOG.md still has an "Unreleased" section. Move it under a dated version heading (## x.y.z - YYYY-MM-DD).',
  );
}
if (topVersion !== version) {
  failures.push(
    `CHANGELOG.md's top entry is "${top || '(none)'}" but package.json is ${version}. They must name the same version.`,
  );
}
if (!/\d{4}-\d{2}-\d{2}/.test(top)) {
  failures.push(`CHANGELOG.md's top entry "${top}" has no date.`);
}

const againstIndex = process.argv.indexOf('--against');
const against = againstIndex === -1 ? null : process.argv[againstIndex + 1];
if (against) {
  const baseVersion = readVersion(git('show', `${against}:package.json`) || '');
  const codeChanged = (git('diff', '--name-only', `${against}...HEAD`) || '')
    .split('\n')
    .some((file) => SHIPPED_PREFIXES.some((p) => file.startsWith(p)));
  if (
    baseVersion &&
    codeChanged &&
    compareVersions(version, baseVersion) <= 0
  ) {
    failures.push(
      `Code under src/, lib/ or bin/ changed since ${against} (${baseVersion}) but package.json is still ${version}. Bump the version and add a CHANGELOG entry: users receive every build on main.`,
    );
  }
}

if (failures.length > 0) {
  console.error(
    'Release check failed:\n' + failures.map((f) => `  - ${f}`).join('\n'),
  );
  process.exit(1);
}
console.log(`Release check passed: ${version} (${top}).`);
