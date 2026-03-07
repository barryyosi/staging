import { useState, useCallback, useMemo, useRef, useEffect } from 'react';

let idCounter = 0;

function generateId() {
  return (
    Date.now().toString(36) +
    (idCounter++).toString(36) +
    Math.random().toString(36).slice(2, 6)
  );
}

export function useComments(projectKey) {
  const [commentsByFile, setCommentsByFile] = useState({});
  const [generalNote, setGeneralNoteRaw] = useState(null);
  const storeRef = useRef(new Map());
  const noteStoreRef = useRef(new Map());
  const prevKeyRef = useRef(projectKey);

  useEffect(() => {
    const prevKey = prevKeyRef.current;
    if (prevKey === projectKey) return;
    prevKeyRef.current = projectKey;

    setCommentsByFile((current) => {
      if (prevKey) storeRef.current.set(prevKey, current);
      return storeRef.current.get(projectKey) || {};
    });
    setGeneralNoteRaw((current) => {
      if (prevKey) noteStoreRef.current.set(prevKey, current);
      return noteStoreRef.current.get(projectKey) ?? null;
    });
  }, [projectKey]);

  const allComments = useMemo(
    () => Object.values(commentsByFile).flat(),
    [commentsByFile],
  );

  const setGeneralNote = useCallback((text) => {
    setGeneralNoteRaw(text && text.trim() ? text.trim() : null);
  }, []);

  const clearGeneralNote = useCallback(() => {
    setGeneralNoteRaw(null);
  }, []);

  const addComment = useCallback(
    (file, line, lineType, content, extra = {}) => {
      const comment = {
        id: generateId(),
        file,
        line: parseInt(line, 10),
        lineType,
        content: content.trim(),
        timestamp: Date.now(),
        ...extra,
      };
      setCommentsByFile((prev) => ({
        ...prev,
        [file]: [...(prev[file] || []), comment],
      }));
      return comment;
    },
    [],
  );

  const updateComment = useCallback((id, content) => {
    setCommentsByFile((prev) => {
      const next = {};
      for (const [file, fileComments] of Object.entries(prev)) {
        next[file] = fileComments.map((c) =>
          c.id === id
            ? { ...c, content: content.trim(), timestamp: Date.now() }
            : c,
        );
      }
      return next;
    });
  }, []);

  const deleteComment = useCallback((id) => {
    setCommentsByFile((prev) => {
      const next = {};
      for (const [file, fileComments] of Object.entries(prev)) {
        const filtered = fileComments.filter((c) => c.id !== id);
        if (filtered.length > 0) next[file] = filtered;
      }
      return next;
    });
  }, []);

  const deleteAllComments = useCallback(() => {
    setCommentsByFile({});
    setGeneralNoteRaw(null);
  }, []);

  return {
    commentsByFile,
    allComments,
    generalNote,
    setGeneralNote,
    clearGeneralNote,
    addComment,
    updateComment,
    deleteComment,
    deleteAllComments,
  };
}
