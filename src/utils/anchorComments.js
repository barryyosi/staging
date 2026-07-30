// Resolves preview comments against the current render's blocks.
// Pure projection — never writes to the comment store, so live reload
// (PreviewApp re-renders every time the file changes) can't loop.

// Resolves one anchored item (a stored comment, or a pending comment form)
// to a block in the current render.
// Returns { blockIndex, isStale } or null when it no longer has a home.
export function resolveAnchor(anchor, blocks) {
  const anchorText = anchor.anchorText || '';

  // An empty anchorText (image-only block, hr) matches every other
  // empty-anchor block, so it is never a useful key — fall through to the
  // index check instead.
  if (anchorText) {
    const matches = blocks.filter((b) => b.anchorText === anchorText);
    if (matches.length > 0) {
      const best = matches.reduce((a, b) =>
        Math.abs(b.index - anchor.blockIndex) <
        Math.abs(a.index - anchor.blockIndex)
          ? b
          : a,
      );
      return { blockIndex: best.index, isStale: false };
    }
  }

  if (
    Number.isInteger(anchor.blockIndex) &&
    anchor.blockIndex >= 0 &&
    anchor.blockIndex < blocks.length
  ) {
    // The position still exists. It is only "stale" if what sits there now
    // differs from what was commented on — a block that legitimately has no
    // text (hr, image-only) still matches its original empty anchor.
    return {
      blockIndex: anchor.blockIndex,
      isStale: blocks[anchor.blockIndex].anchorText !== anchorText,
    };
  }

  return null;
}

// Returns { byBlock: Map<blockIndex, comments[]>, unanchored: comments[] }.
// Resolved comments are shallow copies carrying view-only fields
// `resolvedBlockIndex` and `isStale`.
export function anchorComments(comments, blocks) {
  const byBlock = new Map();
  const unanchored = [];

  for (const comment of comments) {
    const resolved = resolveAnchor(comment, blocks);
    if (!resolved) {
      unanchored.push(comment);
      continue;
    }
    const { blockIndex, isStale } = resolved;
    if (!byBlock.has(blockIndex)) byBlock.set(blockIndex, []);
    byBlock
      .get(blockIndex)
      .push({ ...comment, resolvedBlockIndex: blockIndex, isStale });
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

  // The text shifted. Prefer the occurrence closest to where it used to be —
  // taking the first match would re-point a comment at a different instance
  // of a repeated phrase.
  const target = Number.isInteger(textOffset) ? textOffset : 0;
  let best = -1;
  let bestDistance = Infinity;
  for (
    let i = blockText.indexOf(selectedText);
    i !== -1;
    i = blockText.indexOf(selectedText, i + 1)
  ) {
    const distance = Math.abs(i - target);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
}
