export function formatComments(comments, gitRoot) {
  let output = `## Code Review Comments\n\n`;
  output += `Repository: ${gitRoot}\n\n`;

  const grouped = {};
  for (const c of comments) {
    if (!grouped[c.file]) grouped[c.file] = [];
    grouped[c.file].push(c);
  }

  for (const [file, fileComments] of Object.entries(grouped)) {
    output += `### ${file}\n\n`;
    for (const c of fileComments.sort((a, b) => a.line - b.line)) {
      if (c.lineType === 'preview') {
        const quote = c.selectedText?.slice(0, 60) || '';
        output += `- **Preview** "${quote}": ${c.content}\n`;
      } else {
        output += `- **Line ${c.line}** (${c.lineType}): ${c.content}\n`;
      }
    }
    output += '\n';
  }

  output += `---\nPlease address these review comments and update the staged changes.\n`;
  return output;
}
