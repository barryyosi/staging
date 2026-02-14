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
  let html =
    ext === 'md' || ext === 'markdown'
      ? marked.parse(content, { gfm: true, breaks: false })
      : content;

  html = rewriteImageUrls(html, filePath);
  return DOMPurify.sanitize(html);
}

function rewriteImageUrls(html, baseFilePath) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const imgs = doc.querySelectorAll('img');

  if (imgs.length === 0) return html;

  const baseDir = baseFilePath.split('/').slice(0, -1).join('/');

  imgs.forEach((img) => {
    const src = img.getAttribute('src');
    if (!src || src.startsWith('http') || src.startsWith('data:') || src.startsWith('/')) {
      return;
    }

    // Resolve relative path
    const parts = baseDir ? baseDir.split('/') : [];
    const relParts = src.split('/');

    for (const part of relParts) {
      if (part === '.') continue;
      if (part === '..') parts.pop();
      else parts.push(part);
    }

    const resolvedPath = parts.join('/');
    img.setAttribute('src', `/api/raw-file?filePath=${encodeURIComponent(resolvedPath)}`);
  });

  return doc.body.innerHTML;
}
