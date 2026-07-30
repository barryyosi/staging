// Resolves preview comments against the current render's blocks.
// Pure projection — never writes to the comment store, so live reload
// (PreviewApp re-renders every time the file changes) can't loop.

// Returns { byBlock: Map<blockIndex, comments[]>, unanchored: comments[] }.
// Resolved comments are shallow copies carrying view-only fields
// `resolvedBlockIndex` and `isStale`.
export function anchorComments(comments, blocks) {
  const byBlock = new Map();
  const unanchored = [];

  const place = (comment, blockIndex, isStale) => {
    const resolved = { ...comment, resolvedBlockIndex: blockIndex, isStale };
    if (!byBlock.has(blockIndex)) byBlock.set(blockIndex, []);
    byBlock.get(blockIndex).push(resolved);
  };

  for (const comment of comments) {
    // Empty anchorText (image-only blocks, hr) would match every other
    // empty-anchor block — fall through to the index check instead
    const matches = comment.anchorText
      ? blocks.filter((b) => b.anchorText === comment.anchorText)
      : [];

    if (matches.length > 0) {
      const best = matches.reduce((a, b) =>
        Math.abs(b.index - comment.blockIndex) <
        Math.abs(a.index - comment.blockIndex)
          ? b
          : a,
      );
      place(comment, best.index, false);
    } else if (
      Number.isInteger(comment.blockIndex) &&
      comment.blockIndex >= 0 &&
      comment.blockIndex < blocks.length
    ) {
      // Position still exists but its content changed
      place(comment, comment.blockIndex, true);
    } else {
      unanchored.push(comment);
    }
  }

  return { byBlock, unanchored };
}

// Re-finds a comment's selected text inside a block's plain text.
// Returns a usable offset, or -1 when the quote is gone.
export function resolveTextOffset(blockText, comment) {
  const { selectedText, textOffset, textLength } = comment;
  if (!selectedText) return -1;
  if (
    Number.isInteger(textOffset) &&
    blockText.substr(textOffset, textLength) === selectedText
  ) {
    return textOffset;
  }
  return blockText.indexOf(selectedText);
}
