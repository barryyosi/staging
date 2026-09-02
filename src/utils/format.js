const oneLine = (s) => (s || '').replace(/\s+/g, ' ').trim();
const clip = (s, n) => (s.length > n ? s.slice(0, n) + '…' : s);

// A diff comment anchors on its last line (`line`/`lineType`); one dragged
// over several lines also carries `startLine`/`startLineType`.
export const isLineRange = (c) => c.startLine != null;

export function describeLines(c) {
  return isLineRange(c) ? `Lines ${c.startLine}-${c.line}` : `Line ${c.line}`;
}

// With the diff side, for the agent. A range from a deletion to an addition
// mixes old and new numbering, so each end names its own side.
function describeLinesWithType(c) {
  if (isLineRange(c) && c.startLineType !== c.lineType) {
    return `Lines ${c.startLine} (${c.startLineType}) to ${c.line} (${c.lineType})`;
  }
  return `${describeLines(c)} (${c.lineType})`;
}

export function formatComments(comments, gitRoot, generalNote, options = {}) {
  const isPreview = options.context === 'preview';
  let output = isPreview
    ? `## Document Review Comments\n\n`
    : `## Code Review Comments\n\n`;
  output += isPreview
    ? `Document: ${gitRoot}\n\n`
    : `Repository: ${gitRoot}\n\n`;

  if (generalNote) {
    output += `### General comments\n\n${generalNote}\n\n`;
  }

  const grouped = {};
  for (const c of comments) {
    if (!grouped[c.file]) grouped[c.file] = [];
    grouped[c.file].push(c);
  }

  for (const [file, fileComments] of Object.entries(grouped)) {
    output += `### ${file}\n\n`;
    for (const c of fileComments.sort((a, b) => a.line - b.line)) {
      if (c.lineType === 'file') {
        output += `- **File comment**: ${c.content}\n`;
      } else if (c.lineType === 'preview') {
        const loc = c.srcLine ? `**Line ${c.srcLine}**` : `**Preview**`;
        const anchor = c.anchorText
          ? ` ("${clip(oneLine(c.anchorText), 60)}")`
          : '';
        const quote = c.selectedText
          ? ` > "${clip(oneLine(c.selectedText), 60)}"`
          : '';
        output += `- ${loc}${anchor}${quote}: ${c.content}\n`;
      } else {
        output += `- **${describeLinesWithType(c)}**: ${c.content}\n`;
      }
    }
    output += '\n';
  }

  output += isPreview
    ? `---\nPlease address these review comments in the document.\n`
    : `---\nPlease address these review comments and update the staged changes.\n`;
  return output;
}

export function formatCommitMessageRequest(comments, gitRoot, generalNote) {
  let out = `## Generate Commit Message\n\nRepository: ${gitRoot}\n\n`;

  if (generalNote) {
    out += `### General comments\n\n${generalNote}\n\n`;
  }

  if (comments?.length) {
    out += `### Inline Review Notes\n\n`;
    const grouped = {};
    for (const c of comments) {
      (grouped[c.file] ??= []).push(c);
    }
    for (const [file, fc] of Object.entries(grouped)) {
      out += `**${file}**\n`;
      for (const c of fc.sort((a, b) => a.line - b.line)) {
        if (c.lineType === 'file') {
          out += `- File comment: ${c.content}\n`;
        } else if (c.lineType === 'preview') {
          // A rendered-document line, not a staged-diff line — label it so the
          // two can't be confused
          const quote = c.selectedText || c.anchorText;
          const where = c.srcLine ? `Document line ${c.srcLine}` : 'Document';
          out += `- ${where}${quote ? ` ("${clip(oneLine(quote), 60)}")` : ''}: ${c.content}\n`;
        } else {
          out += `- ${describeLines(c)}: ${c.content}\n`;
        }
      }
      out += '\n';
    }
  }

  out += `---\nPlease write a concise commit message for the staged changes in this repository. `;
  out += `Use conventional commit format if applicable: \`type(scope): subject\`. `;
  out += `Then ask the user if it's ok to run \`git commit -m "<generated message>"\` on their behalf, and if so, run it.`;
  out += `Otherwise, just return the generated message.\n\n`;
  return out;
}
