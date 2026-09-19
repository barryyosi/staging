// Review state that survives closing the tab and relaunching staging:
// comments, the general note and the files marked reviewed. The local server
// keeps it on disk per project (lib/review-state.js); the browser is not the
// store, because the server's default port is random and browser storage is
// scoped per origin.
//
// Each entry remembers the diff fingerprint of its file at the time it was
// made (see parseRawDiffOutput in lib/git.js). On the next open, a reviewed
// mark only comes back when the file's diff is byte-for-byte the same, and a
// comment whose file changed comes back as stale: still listed, no longer
// sent to the agent.

async function fetchState(projectKey) {
  const res = await fetch(
    `/api/review-state?key=${encodeURIComponent(projectKey)}`,
  );
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || 'Failed to load');
  return data;
}

async function putSection(projectKey, section, value) {
  const res = await fetch('/api/review-state', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: projectKey, section, value }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to save review state');
  }
}

// --- Comments ---

// Flags every comment whose file no longer carries the fingerprint it was
// written against, and clears the flag on those that match again (the same
// comment can be stale against the staged diff and live against the pull
// request's base). Comments created at or after `since` (this session) are
// about the diff on screen whatever base it is shown under, so they are
// never flagged and instead follow the file's current fingerprint. With no
// fingerprint map nothing can be verified, so the comments are returned
// untouched.
export function markStaleComments(commentsByFile, fingerprintByPath, since) {
  if (!fingerprintByPath) return commentsByFile;
  let changed = false;
  const next = {};
  for (const [file, comments] of Object.entries(commentsByFile)) {
    const judged = comments.map((comment) => {
      const current = fingerprintByPath[file];
      const createdAt = comment.createdAt ?? comment.timestamp;
      if (since != null && createdAt >= since) {
        const fingerprint = current || comment.fingerprint;
        return !comment.stale && comment.fingerprint === fingerprint
          ? comment
          : { ...comment, stale: false, fingerprint };
      }
      const stale = !comment.fingerprint || comment.fingerprint !== current;
      return stale === Boolean(comment.stale) ? comment : { ...comment, stale };
    });
    if (judged.some((comment, i) => comment !== comments[i])) {
      changed = true;
      next[file] = judged;
    } else {
      next[file] = comments;
    }
  }
  // Same input back when nothing moved, so callers can tell a no-op apart
  return changed ? next : commentsByFile;
}

// A comment's place in the review cycle. Only pending comments go to the
// agent: sent ones were delivered already and stay for reference until
// edited (which makes them pending again); stale ones sit on a file that
// changed since, so they were presumably addressed.
export function commentStatus(comment) {
  if (comment.stale) return 'stale';
  if (comment.sentAt) return 'sent';
  return 'pending';
}

export const isPendingComment = (comment) =>
  commentStatus(comment) === 'pending';

// Stamps the comments just delivered so the next send skips them
export function markCommentsSent(commentsByFile, ids, at = Date.now()) {
  const wanted = new Set(ids);
  let changed = false;
  const next = {};
  for (const [file, comments] of Object.entries(commentsByFile)) {
    const stamped = comments.map((comment) =>
      wanted.has(comment.id) && !comment.sentAt
        ? { ...comment, sentAt: at }
        : comment,
    );
    if (stamped.some((comment, i) => comment !== comments[i])) {
      changed = true;
      next[file] = stamped;
    } else {
      next[file] = comments;
    }
  }
  return changed ? next : commentsByFile;
}

const EMPTY_COMMENTS = {
  commentsByFile: {},
  generalNote: null,
  generalNoteSentAt: null,
};

// Returns the comments as stored, `stale` flags from the last session
// included; the caller re-judges them with markStaleComments once the
// current diff is known. A server that cannot answer means an empty review,
// never a broken one.
export async function loadComments(projectKey) {
  if (!projectKey) return EMPTY_COMMENTS;
  try {
    const { comments } = await fetchState(projectKey);
    return comments || EMPTY_COMMENTS;
  } catch {
    return EMPTY_COMMENTS;
  }
}

export function saveComments(projectKey, value) {
  if (!projectKey) return Promise.resolve();
  return putSection(projectKey, 'comments', value);
}

// --- Reviewed files ---

// Reviewed marks accumulate one entry per file ever marked; keep the most
// recent ones only
const REVIEWED_LIMIT = 2000;

// { [path]: { fingerprint, at } }
export async function loadReviewedMarks(projectKey) {
  if (!projectKey) return {};
  try {
    const { reviewed } = await fetchState(projectKey);
    return reviewed || {};
  } catch {
    return {};
  }
}

export function saveReviewedMarks(projectKey, marks) {
  if (!projectKey) return Promise.resolve();
  return putSection(projectKey, 'reviewed', marks);
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
