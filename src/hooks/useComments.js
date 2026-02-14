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
  const storeRef = useRef(new Map());
  const prevKeyRef = useRef(projectKey);

  useEffect(() => {
    const prevKey = prevKeyRef.current;
    if (prevKey === projectKey) return;
    prevKeyRef.current = projectKey;

    setCommentsByFile((current) => {
      if (prevKey) storeRef.current.set(prevKey, current);
      return storeRef.current.get(projectKey) || {};
    });
  }, [projectKey]);

  const allComments = useMemo(
    () => Object.values(commentsByFile).flat(),
    [commentsByFile],
  );

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
  }, []);

  return {
    commentsByFile,
    allComments,
    addComment,
    updateComment,
    deleteComment,
    deleteAllComments,
  };
}
