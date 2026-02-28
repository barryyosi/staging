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

export function formatCommitMessageRequest(comments, gitRoot) {
  let out = `## Generate Commit Message\n\nRepository: ${gitRoot}\n\n`;

  if (comments?.length) {
    out += `### Inline Review Notes\n\n`;
    const grouped = {};
    for (const c of comments) {
      (grouped[c.file] ??= []).push(c);
    }
    for (const [file, fc] of Object.entries(grouped)) {
      out += `**${file}**\n`;
      for (const c of fc.sort((a, b) => a.line - b.line)) {
        out += `- Line ${c.line}: ${c.content}\n`;
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
