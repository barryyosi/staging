import { marked } from 'marked';
import DOMPurify from 'dompurify';

// Keep in sync with PREVIEW_EXTS in bin/staging.js
const PREVIEW_EXTS = new Set(['md', 'markdown', 'html', 'htm']);

const MARKED_OPTIONS = { gfm: true, breaks: false };
const ANCHOR_TEXT_MAX = 120;

// Shared parser for the image-rewrite pass
const domParser = new DOMParser();

export function isPreviewable(filePath) {
  if (!filePath) return false;
  const ext = filePath.split('.').pop()?.toLowerCase();
  return PREVIEW_EXTS.has(ext);
}

function countNewlines(str) {
  return (str.match(/\n/g) || []).length;
}

// Sanitizes once and derives the block's plain text from the same DOM, so a
// block costs one parse rather than a separate pass for the anchor text.
function sanitizeBlock(html, filePath) {
  const fragment = DOMPurify.sanitize(rewriteImageUrls(html, filePath), {
    RETURN_DOM_FRAGMENT: true,
  });
  const holder = document.createElement('div');
  holder.appendChild(fragment);
  return {
    html: holder.innerHTML,
    anchorText: (holder.textContent || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, ANCHOR_TEXT_MAX),
  };
}

// Renders a previewable file into an ordered list of blocks:
//   { index, type, html, srcLine, anchorText }
// srcLine is the 1-based line in the markdown source (null for HTML files,
// and null past any point where the source scan loses sync), so comments can
// point the agent at the exact place to edit.
export function renderPreviewBlocks(content, filePath) {
  const ext = filePath.split('.').pop()?.toLowerCase();
  const isMarkdown = ext === 'md' || ext === 'markdown';
  return isMarkdown
    ? markdownBlocks(content, filePath)
    : htmlBlocks(content, filePath);
}

function markdownBlocks(content, filePath) {
  // Match marked's own line-ending normalization so token.raw can be
  // located in `source` verbatim
  const source = content.replace(/\r\n|\r/g, '\n');
  const tokens = marked.lexer(source, MARKED_OPTIONS);
  const blocks = [];

  // Track each token's position by scanning for its raw text from a moving
  // cursor instead of summing raw lengths — stays correct even if the lexer
  // omits a token (e.g. link-reference definitions) from the stream.
  let cursor = 0;
  let cursorLine = 1;
  // Once a token's raw text can't be located, the cursor no longer
  // corresponds to the source and every later number would be confidently
  // wrong. Report no line at all from that point rather than mislead the agent.
  let desynced = false;

  for (const token of tokens) {
    let srcLine = null;
    if (!desynced) {
      const found = token.raw ? source.indexOf(token.raw, cursor) : -1;
      if (found === -1) {
        desynced = true;
      } else {
        srcLine = cursorLine + countNewlines(source.slice(cursor, found));
        cursor = found + token.raw.length;
        cursorLine = srcLine + countNewlines(token.raw);
      }
    }

    // Never hand zero-output tokens to the parser
    if (token.type === 'space' || token.type === 'def') continue;

    const single = [token];
    // Reference links are resolved during lexing, but keep the links map
    // available in case the parser consults it
    single.links = tokens.links;
    const rendered = marked.parser(single, MARKED_OPTIONS);
    if (!rendered.trim()) continue;

    const { html, anchorText } = sanitizeBlock(rendered, filePath);
    if (!html.trim()) continue;

    blocks.push({
      index: blocks.length,
      type: token.type,
      html,
      srcLine,
      anchorText,
    });
  }

  return blocks;
}

function htmlBlocks(content, filePath) {
  const doc = domParser.parseFromString(content, 'text/html');
  const blocks = [];

  for (const node of doc.body.childNodes) {
    let raw;
    if (node.nodeType === Node.ELEMENT_NODE) {
      raw = node.outerHTML;
    } else if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
      // Build the wrapper as DOM so already-decoded text is re-escaped on
      // serialization — interpolating it into a string would parse it as
      // markup a second time and swallow anything after a literal "<".
      const p = document.createElement('p');
      p.textContent = node.textContent;
      raw = p.outerHTML;
    } else {
      continue;
    }

    const { html, anchorText } = sanitizeBlock(raw, filePath);
    if (!html.trim()) continue;

    blocks.push({
      index: blocks.length,
      type: 'html',
      html,
      srcLine: null,
      anchorText,
    });
  }

  return blocks;
}

function rewriteImageUrls(html, baseFilePath) {
  if (!/<img/i.test(html)) return html;

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
