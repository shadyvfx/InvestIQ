// A deliberately small Markdown renderer for lesson text and tutor answers.
//
// Supported: paragraphs, "- " and "1. " lists, headings (# to ####; levels 1
// and 2 render as h3 because they sit inside a page section), **bold**,
// *italic*, `code`, and links to in-app routes written as [text](#/route).
// Everything is HTML-escaped first, so content (including a language model's
// output) can never inject markup or external links.

import { escapeHTML } from './dom.js';

function inline(text) {
  let out = escapeHTML(text);
  const codes = [];
  out = out.replace(/`([^`]+)`/g, (_, code) => {
    codes.push(code);
    return `\u0000${codes.length - 1}\u0000`;
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Single asterisks need text right inside them, so "2 * 3 * 4" stays as is.
  out = out.replace(/(^|[^*\w])\*(?=\S)([^*]*?\S)\*(?![*\w])/g, '$1<em>$2</em>');
  out = out.replace(/\[([^\]]+)\]\((#\/[^)\s]*)\)/g, '<a href="$2">$1</a>');
  out = out.replace(/\u0000(\d+)\u0000/g, (_, index) => `<code>${codes[Number(index)]}</code>`);
  return out;
}

export function markdownToHTML(source) {
  const lines = String(source ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let paragraph = [];
  let list = null;
  let codeBlock = null;

  const flushParagraph = () => {
    if (paragraph.length) {
      out.push(`<p>${inline(paragraph.join(' '))}</p>`);
      paragraph = [];
    }
  };

  const flushList = () => {
    if (list) {
      const items = list.items.map((item) => `<li>${inline(item)}</li>`).join('');
      out.push(`<${list.type}>${items}</${list.type}>`);
      list = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (codeBlock) {
      if (/^\s*```/.test(line)) {
        out.push(`<pre><code>${escapeHTML(codeBlock.join('\n'))}</code></pre>`);
        codeBlock = null;
      } else {
        codeBlock.push(rawLine);
      }
      continue;
    }

    if (/^\s*```/.test(line)) {
      flushParagraph();
      flushList();
      codeBlock = [];
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    let match = line.match(/^(#{1,4})\s+(.*)$/);
    if (match) {
      flushParagraph();
      flushList();
      const level = Math.max(3, match[1].length);
      out.push(`<h${level}>${inline(match[2])}</h${level}>`);
      continue;
    }

    match = line.match(/^\s*[-*]\s+(.*)$/);
    if (match) {
      flushParagraph();
      if (!list || list.type !== 'ul') {
        flushList();
        list = { type: 'ul', items: [] };
      }
      list.items.push(match[1]);
      continue;
    }

    match = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (match) {
      flushParagraph();
      if (!list || list.type !== 'ol') {
        flushList();
        list = { type: 'ol', items: [] };
      }
      list.items.push(match[1]);
      continue;
    }

    if (list && /^\s{2,}\S/.test(rawLine)) {
      list.items[list.items.length - 1] += ` ${line.trim()}`;
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }

  flushParagraph();
  flushList();
  if (codeBlock) out.push(`<pre><code>${escapeHTML(codeBlock.join('\n'))}</code></pre>`);
  return out.join('');
}
