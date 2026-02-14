const EXPAND_STEP = 20;

/**
 * Compute hidden line gaps between chunks in a diff.
 * Returns array of gap objects for top/middle/bottom positions.
 */
function computeGaps(chunks, totalNewLines) {
  const gaps = [];
  if (!chunks || chunks.length === 0) return gaps;

  // Top gap: lines before the first chunk
  const first = chunks[0];
  if (first.newStart > 1) {
    gaps.push({
      position: 'top',
      newStart: 1,
      newEnd: first.newStart - 1,
      oldStart: 1,
      oldEnd: first.oldStart - 1,
      afterChunkIndex: -1,
      lines: first.newStart - 1,
    });
  }

  // Middle gaps: between consecutive chunks
  for (let i = 0; i < chunks.length - 1; i++) {
    const a = chunks[i];
    const b = chunks[i + 1];

    const gapNewStart = a.newStart + a.newLines;
    const gapNewEnd = b.newStart - 1;
    const gapOldStart = a.oldStart + a.oldLines;
    const gapOldEnd = b.oldStart - 1;
    const count = gapNewEnd - gapNewStart + 1;

    if (count > 0) {
      gaps.push({
        position: 'middle',
        newStart: gapNewStart,
        newEnd: gapNewEnd,
        oldStart: gapOldStart,
        oldEnd: gapOldEnd,
        afterChunkIndex: i,
        lines: count,
      });
    }
  }

  // Bottom gap: lines after the last chunk
  if (totalNewLines != null) {
    const last = chunks[chunks.length - 1];
    const lastNewEnd = last.newStart + last.newLines - 1;
    const lastOldEnd = last.oldStart + last.oldLines - 1;

    if (lastNewEnd < totalNewLines) {
      gaps.push({
        position: 'bottom',
        newStart: lastNewEnd + 1,
        newEnd: totalNewLines,
        oldStart: lastOldEnd + 1,
        oldEnd: lastOldEnd + (totalNewLines - lastNewEnd),
        afterChunkIndex: chunks.length - 1,
        lines: totalNewLines - lastNewEnd,
      });
    }
  }

  return gaps;
}

/**
 * Build context change objects from raw line strings.
 * oldStartLine and newStartLine are the 1-based line numbers
 * of the first line in the rawLines array.
 */
function buildContextChanges(rawLines, newStartLine, oldStartLine) {
  return rawLines.map((content, i) => ({
    type: 'context',
    ln1: oldStartLine + i,
    ln2: newStartLine + i,
    content,
  }));
}

export { computeGaps, buildContextChanges, EXPAND_STEP };
