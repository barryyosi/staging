import { useCallback, useMemo, useRef, useEffect } from 'react';
import { useProjectStore } from './useProjectStore';
import {
  loadComments,
  saveComments,
  markStaleComments,
} from '../utils/reviewStorage';

let idCounter = 0;

function generateId() {
  return (
    Date.now().toString(36) +
    (idCounter++).toString(36) +
    Math.random().toString(36).slice(2, 6)
  );
}

const EMPTY = { commentsByFile: {}, generalNote: null };

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
  const { commentsByFile, generalNote } = value || EMPTY;

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

  const update = useCallback(
    (updater) => setValue((prev) => ({ ...prev, ...updater(prev) })),
    [setValue],
  );

  // Comments the agent still needs to hear about; stale ones are kept for
  // the reviewer's reference only
  const pendingComments = useMemo(
    () =>
      Object.values(commentsByFile)
        .flat()
        .filter((c) => !c.stale),
    [commentsByFile],
  );

  const staleCount = useMemo(
    () =>
      Object.values(commentsByFile)
        .flat()
        .filter((c) => c.stale).length,
    [commentsByFile],
  );

  const setGeneralNote = useCallback(
    (text) => {
      update(() => ({ generalNote: text && text.trim() ? text.trim() : null }));
    },
    [update],
  );

  const clearGeneralNote = useCallback(() => {
    update(() => ({ generalNote: null }));
  }, [update]);

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
          next[file] = fileComments.map((c) =>
            c.id === id
              ? { ...c, content: content.trim(), timestamp: Date.now() }
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

  const clearStaleComments = useCallback(
    () => removeWhere((c) => c.stale),
    [removeWhere],
  );

  const deleteAllComments = useCallback(() => {
    update(() => ({ commentsByFile: {}, generalNote: null }));
  }, [update]);

  return {
    commentsByFile,
    pendingComments,
    staleCount,
    generalNote,
    setGeneralNote,
    clearGeneralNote,
    addComment,
    updateComment,
    deleteComment,
    clearStaleComments,
    deleteAllComments,
  };
}
