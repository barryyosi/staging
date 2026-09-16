import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';

// Review state that survives a relaunch: comments, the general note and the
// files marked reviewed, one JSON file per project under the user's home
// directory (the default server port is random, so browser storage, scoped
// per origin, would not survive). Keyed by the git root, or the document
// path in preview mode. Two sections, each owned by one frontend store:
//   comments: { commentsByFile: { [path]: Comment[] }, generalNote }
//   reviewed: { [path]: { fingerprint, at } }

const STATE_DIR =
  process.env.STAGING_STATE_DIR || path.join(os.homedir(), '.staging-reviews');
const SECTIONS = ['comments', 'reviewed'];

function stateFile(key) {
  const hash = createHash('sha1').update(key).digest('hex');
  return path.join(STATE_DIR, `${hash}.json`);
}

const isPlainObject = (value) =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

// Only arrays of comment objects survive, so a hand-edited or corrupt file
// cannot crash the UI's render
function sanitizeComments(section) {
  if (!isPlainObject(section)) return null;
  const commentsByFile = {};
  if (isPlainObject(section.commentsByFile)) {
    for (const [file, comments] of Object.entries(section.commentsByFile)) {
      if (!Array.isArray(comments)) continue;
      const kept = comments.filter(isPlainObject);
      if (kept.length > 0) commentsByFile[file] = kept;
    }
  }
  const generalNote =
    typeof section.generalNote === 'string' ? section.generalNote : null;
  if (Object.keys(commentsByFile).length === 0 && !generalNote) return null;
  return { commentsByFile, generalNote };
}

function sanitizeReviewed(section) {
  if (!isPlainObject(section)) return null;
  const marks = {};
  for (const [file, mark] of Object.entries(section)) {
    if (isPlainObject(mark) && typeof mark.fingerprint === 'string') {
      marks[file] = mark;
    }
  }
  return Object.keys(marks).length > 0 ? marks : null;
}

const sanitize = {
  comments: sanitizeComments,
  reviewed: sanitizeReviewed,
};

function readState(key) {
  let parsed = null;
  try {
    parsed = JSON.parse(fs.readFileSync(stateFile(key), 'utf-8'));
  } catch {
    // Missing or unreadable: an empty review
  }
  const state = {};
  for (const section of SECTIONS) {
    state[section] = sanitize[section](parsed?.[section]);
  }
  return state;
}

export function loadReviewState(key) {
  if (!key) return { comments: null, reviewed: null };
  return readState(key);
}

// Replaces one section and writes the file; a review with nothing left in
// either section is deleted rather than kept as an empty file
export function saveReviewState(key, section, value) {
  if (!key) return;
  if (!SECTIONS.includes(section)) {
    throw new Error(`Unknown review state section "${section}"`);
  }
  const state = readState(key);
  state[section] = sanitize[section](value);

  const file = stateFile(key);
  if (SECTIONS.every((name) => state[name] === null)) {
    fs.rmSync(file, { force: true });
    return;
  }
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify({ key, updatedAt: Date.now(), ...state }, null, 2),
    'utf-8',
  );
}
