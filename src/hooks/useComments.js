import { useCallback, useMemo, useRef, useEffect } from 'react';
import { useProjectStore } from './useProjectStore';
import {
  loadComments,
  saveComments,
  markStaleComments,
  markCommentsSent,
  unmarkCommentsSent,
  isPendingComment,
} from '../utils/reviewStorage';

let idCounter = 0;

function generateId() {
  return (
    Date.now().toString(36) +
    (idCounter++).toString(36) +
    Math.random().toString(36).slice(2, 6)
  );
}

// The stamp a handoff of `sentComments` and `sentNote` (the snapshot that
// was formatted) leaves behind: those are no longer pending. A comment or
// note edited while the send was in flight is not what the agent got, so
// it stays pending
function stampSent(prev, sentComments, sentNote, at) {
  const patch = {};
  const stamped = markCommentsSent(prev.commentsByFile, sentComments, at);
  if (stamped !== prev.commentsByFile) patch.commentsByFile = stamped;
  if (sentNote && prev.generalNote === sentNote && !prev.generalNoteSentAt) {
    patch.generalNoteSentAt = at;
  }
  return patch;
}

const EMPTY = {
  commentsByFile: {},
  generalNote: null,
  generalNoteSentAt: null,
};

// Comments live in the per-project review file so a review survives closing the
// tab. `diffSummary` ({ base, fingerprintByPath }, null while loading) comes
// from the diff summary: it stamps each new comment with its file's
// fingerprint, and each comment is judged `stale` against it once per
// project and compare base, when that base's summary lands. Between those
// points a comment stays live however the diff moves under it, so nothing
// silently drops out of a handoff mid-session. With no summary at all
// (preview mode) nothing is ever flagged.
export function useComments(projectKey, diffSummary = null) {
  const fingerprintsRef = useRef(diffSummary?.fingerprintByPath || null);
  useEffect(() => {
    fingerprintsRef.current = diffSummary?.fingerprintByPath || null;
  }, [diffSummary]);

  const [value, setValue] = useProjectStore(
    projectKey,
    loadComments,
    saveComments,
  );
  const loaded = value !== null;
  const { commentsByFile, generalNote, generalNoteSentAt } = value || EMPTY;
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  // Comments created this session are never judged stale (see
  // markStaleComments)
  const sessionStartRef = useRef(Date.now());
  // Which (project, base) the stored comments were last judged against
  const judgedRef = useRef(null);
  useEffect(() => {
    if (!loaded || !diffSummary) return;
    const judged = judgedRef.current;
    if (
      judged &&
      judged.key === projectKey &&
      judged.base === diffSummary.base
    ) {
      return;
    }
    judgedRef.current = { key: projectKey, base: diffSummary.base };
    setValue((prev) => {
      const commentsByFile = markStaleComments(
        prev.commentsByFile,
        diffSummary.fingerprintByPath,
        sessionStartRef.current,
      );
      // Same value back means nothing to store
      return commentsByFile === prev.commentsByFile
        ? prev
        : { ...prev, commentsByFile };
    });
  }, [loaded, diffSummary, projectKey, setValue]);

  // An updater returning an empty patch leaves the store (and its dirty
  // flag) untouched
  const update = useCallback(
    (updater) =>
      setValue((prev) => {
        const patch = updater(prev);
        return Object.keys(patch).length === 0 ? prev : { ...prev, ...patch };
      }),
    [setValue],
  );

  // Comments the agent still needs to hear about: not yet sent, on a file
  // that has not changed since. Sent and stale ones are kept for the
  // reviewer's reference only
  const pendingComments = useMemo(
    () => Object.values(commentsByFile).flat().filter(isPendingComment),
    [commentsByFile],
  );

  const previousCount = useMemo(
    () =>
      Object.values(commentsByFile)
        .flat()
        .filter((c) => !isPendingComment(c)).length,
    [commentsByFile],
  );

  // The note goes out once; editing it sends the new text again
  const generalNotePending = Boolean(generalNote) && !generalNoteSentAt;

  const setGeneralNote = useCallback(
    (text) => {
      const next = text && text.trim() ? text.trim() : null;
      update((prev) =>
        next === prev.generalNote
          ? {}
          : { generalNote: next, generalNoteSentAt: null },
      );
    },
    [update],
  );

  const clearGeneralNote = useCallback(() => {
    update(() => ({ generalNote: null, generalNoteSentAt: null }));
  }, [update]);

  // Called once the handoff went out. With `persistFirst`, the stamp is
  // written to the server before this resolves: a send whose medium shuts
  // the server down (cli) has no "after" in which the usual save could land.
  // Resolves to the stamp's `at`, for unmarkSent
  const markSent = useCallback(
    async (sentComments, sentNote, { persistFirst = false } = {}) => {
      const at = Date.now();
      const current = valueRef.current;
      if (persistFirst && current) {
        const patch = stampSent(current, sentComments, sentNote, at);
        if (Object.keys(patch).length > 0) {
          try {
            await saveComments(projectKey, { ...current, ...patch });
          } catch {
            // The store's own save will retry once state settles
          }
        }
      }
      update((prev) => stampSent(prev, sentComments, sentNote, at));
      return at;
    },
    [projectKey, update],
  );

  // A send claimed ahead of delivery that then failed: back to pending
  const unmarkSent = useCallback(
    (at) => {
      update((prev) => {
        const patch = {};
        const cleared = unmarkCommentsSent(prev.commentsByFile, at);
        if (cleared !== prev.commentsByFile) patch.commentsByFile = cleared;
        if (prev.generalNoteSentAt === at) patch.generalNoteSentAt = null;
        return patch;
      });
    },
    [update],
  );

  const addComment = useCallback(
    (file, line, lineType, content, extra = {}) => {
      const comment = {
        id: generateId(),
        file,
        line: parseInt(line, 10),
        lineType,
        content: content.trim(),
        // timestamp moves on edit; createdAt is what staleness judging reads
        timestamp: Date.now(),
        createdAt: Date.now(),
        fingerprint: fingerprintsRef.current?.[file] ?? null,
        ...extra,
      };
      update((prev) => ({
        commentsByFile: {
          ...prev.commentsByFile,
          [file]: [...(prev.commentsByFile[file] || []), comment],
        },
      }));
      return comment;
    },
    [update],
  );

  const updateComment = useCallback(
    (id, content) => {
      update((prev) => {
        const next = {};
        for (const [file, fileComments] of Object.entries(
          prev.commentsByFile,
        )) {
          // An edited comment goes out again with the next send
          next[file] = fileComments.map((c) =>
            c.id === id
              ? {
                  ...c,
                  content: content.trim(),
                  timestamp: Date.now(),
                  sentAt: null,
                }
              : c,
          );
        }
        return { commentsByFile: next };
      });
    },
    [update],
  );

  const removeWhere = useCallback(
    (predicate) => {
      update((prev) => {
        const next = {};
        for (const [file, fileComments] of Object.entries(
          prev.commentsByFile,
        )) {
          const kept = fileComments.filter((c) => !predicate(c));
          if (kept.length > 0) next[file] = kept;
        }
        return { commentsByFile: next };
      });
    },
    [update],
  );

  const deleteComment = useCallback(
    (id) => removeWhere((c) => c.id === id),
    [removeWhere],
  );

  const clearPreviousComments = useCallback(
    () => removeWhere((c) => !isPendingComment(c)),
    [removeWhere],
  );

  const deleteAllComments = useCallback(() => {
    update(() => ({
      commentsByFile: {},
      generalNote: null,
      generalNoteSentAt: null,
    }));
  }, [update]);

  return {
    commentsByFile,
    pendingComments,
    previousCount,
    generalNote,
    generalNotePending,
    setGeneralNote,
    clearGeneralNote,
    addComment,
    updateComment,
    deleteComment,
    markSent,
    unmarkSent,
    clearPreviousComments,
    deleteAllComments,
  };
}
