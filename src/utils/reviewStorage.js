// Review state that survives closing the tab: comments, the general note and
// the files marked reviewed, kept in localStorage per project (the git root,
// or the document path in preview mode).
//
// Each entry remembers the diff fingerprint of its file at the time it was
// made (see parseRawDiffOutput in lib/git.js). On the next open, a reviewed
// mark only comes back when the file's diff is byte-for-byte the same, and a
// comment whose file changed comes back as stale: still listed, no longer
// sent to the agent.

const COMMENTS_PREFIX = 'staging-comments:';
const REVIEWED_PREFIX = 'staging-reviewed:';
// Reviewed marks accumulate one entry per file ever marked; keep the most
// recent ones only
const REVIEWED_LIMIT = 2000;

function getStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    // Access itself can throw (private mode, blocked site data)
    return null;
  }
}

function readJson(key) {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded or storage disabled: the review just stays in-memory
  }
}

function removeKey(key) {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    // Nothing to clean up
  }
}

// --- Comments ---

// Flags every comment whose file no longer carries the fingerprint it was
// written against. With no fingerprint map (preview mode) nothing can be
// verified, so nothing is flagged.
export function markStaleComments(commentsByFile, fingerprintByPath) {
  if (!fingerprintByPath) return commentsByFile;
  const next = {};
  for (const [file, comments] of Object.entries(commentsByFile)) {
    next[file] = comments.map((comment) => {
      const stale =
        !comment.fingerprint || comment.fingerprint !== fingerprintByPath[file];
      return stale === Boolean(comment.stale) ? comment : { ...comment, stale };
    });
  }
  return next;
}

export function loadComments(projectKey, fingerprintByPath) {
  const stored = projectKey ? readJson(COMMENTS_PREFIX + projectKey) : null;
  const commentsByFile =
    stored && typeof stored.commentsByFile === 'object'
      ? stored.commentsByFile
      : {};
  return {
    commentsByFile: markStaleComments(commentsByFile, fingerprintByPath),
    generalNote:
      typeof stored?.generalNote === 'string' ? stored.generalNote : null,
  };
}

export function saveComments(projectKey, { commentsByFile, generalNote }) {
  if (!projectKey) return;
  const key = COMMENTS_PREFIX + projectKey;
  if (Object.keys(commentsByFile).length === 0 && !generalNote) {
    removeKey(key);
    return;
  }
  writeJson(key, { commentsByFile, generalNote });
}

// --- Reviewed files ---

// { [path]: { fingerprint, at } }
export function loadReviewedMarks(projectKey) {
  const stored = projectKey ? readJson(REVIEWED_PREFIX + projectKey) : null;
  return stored && typeof stored === 'object' ? stored : {};
}

export function saveReviewedMarks(projectKey, marks) {
  if (!projectKey) return;
  const key = REVIEWED_PREFIX + projectKey;
  if (Object.keys(marks).length === 0) {
    removeKey(key);
    return;
  }
  writeJson(key, marks);
}

export function setReviewedMark(marks, filePath, fingerprint) {
  const next = { ...marks, [filePath]: { fingerprint, at: Date.now() } };
  const paths = Object.keys(next);
  if (paths.length <= REVIEWED_LIMIT) return next;
  paths.sort((a, b) => next[b].at - next[a].at);
  const trimmed = {};
  for (const path of paths.slice(0, REVIEWED_LIMIT)) trimmed[path] = next[path];
  return trimmed;
}

export function clearReviewedMark(marks, filePath) {
  if (!(filePath in marks)) return marks;
  const next = { ...marks };
  delete next[filePath];
  return next;
}

// The files that count as reviewed right now: marked, still in the diff, and
// unchanged since the mark
export function resolveReviewedFiles(marks, fingerprintByPath) {
  const reviewed = new Set();
  for (const [filePath, mark] of Object.entries(marks)) {
    const fingerprint = fingerprintByPath[filePath];
    if (fingerprint && mark?.fingerprint === fingerprint) {
      reviewed.add(filePath);
    }
  }
  return reviewed;
}
