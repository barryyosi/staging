import fuzzysort from 'fuzzysort';

/**
 * Fuzzy-filter an array of file summary objects by path.
 *
 * @param {Array} files - file summary objects ({ from, to, ... })
 * @param {string} query - user search string
 * @returns {Array<{ file: object, result: object }>} sorted by score (best first)
 */
export function fuzzyFilterFiles(files, query) {
  if (!query) return files.map((file) => ({ file, result: null }));

  const results = fuzzysort.go(query, files, {
    key: (file) => file.to || file.from || '',
    limit: 100,
    threshold: -1000,
  });

  return results.map((r) => ({ file: r.obj, result: r }));
}

/**
 * Check whether a single file path fuzzy-matches a query.
 *
 * @param {string} filePath
 * @param {string} query
 * @returns {object|null} fuzzysort result or null if no match
 */
export function fuzzyMatchPath(filePath, query) {
  if (!query) return null;
  const result = fuzzysort.single(query, filePath);
  return result && result.score > -1000 ? result : null;
}

/**
 * Convert a fuzzysort result into an array of { text, highlight } segments
 * for rendering matched characters with visual emphasis.
 *
 * @param {object} result - fuzzysort result (from .go() or .single())
 * @returns {Array<{ text: string, highlight: boolean }|null>}
 */
export function highlightMatch(result) {
  if (!result) return null;

  const target = result.target;
  const indexes = result.indexes;

  if (!indexes || indexes.length === 0) {
    return [{ text: target, highlight: false }];
  }

  const sorted = [...indexes].sort((a, b) => a - b);
  const segments = [];
  let lastIndex = 0;

  for (let i = 0; i < sorted.length; i++) {
    const idx = sorted[i];

    // Add non-highlighted segment before this match
    if (idx > lastIndex) {
      segments.push({ text: target.slice(lastIndex, idx), highlight: false });
    }

    // Coalesce consecutive highlighted characters
    let end = idx + 1;
    while (i + 1 < sorted.length && sorted[i + 1] === end) {
      i++;
      end++;
    }

    segments.push({ text: target.slice(idx, end), highlight: true });
    lastIndex = end;
  }

  // Add remaining non-highlighted text
  if (lastIndex < target.length) {
    segments.push({ text: target.slice(lastIndex), highlight: false });
  }

  return segments;
}
