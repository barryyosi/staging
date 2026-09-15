// The text of a file as the review sees it: the staged copy in a repo, the
// document itself in preview mode
export async function fetchFileContent(filePath) {
  const res = await fetch(
    `/api/file-content?filePath=${encodeURIComponent(filePath)}`,
  );
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.content;
}

// Replaces that text. Resolves to whether anything changed; rejects with the
// server's message otherwise (a 409 means the working tree has unstaged
// changes the write would have dropped)
export async function writeFileContent(filePath, content) {
  const res = await fetch('/api/file-write', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePath, content }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Failed to save file');
  return Boolean(data.changed);
}
