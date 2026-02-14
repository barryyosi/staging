import { marked } from 'marked';
import DOMPurify from 'dompurify';

const PREVIEW_EXTS = new Set(['md', 'markdown', 'html', 'htm']);

export function isPreviewable(filePath) {
  if (!filePath) return false;
  const ext = filePath.split('.').pop()?.toLowerCase();
  return PREVIEW_EXTS.has(ext);
}

export function renderPreview(content, filePath) {
  const ext = filePath.split('.').pop()?.toLowerCase();
  const html =
    ext === 'md' || ext === 'markdown'
      ? marked.parse(content, { gfm: true, breaks: false })
      : content;
  return DOMPurify.sanitize(html);
}
