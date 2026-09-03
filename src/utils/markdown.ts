import { marked } from 'marked';

// Configure marked with GitHub Flavored Markdown (tables, tasklists, autolinks)
// and soft line breaks (breaks: true) so single newlines naturally create line breaks,
// exactly like professional AI chat platforms (ChatGPT, Claude, GitHub).
marked.setOptions({
  gfm: true,
  breaks: true,
});

export function cleanDSMLTags(text: string): string {
  if (!text) return '';
  let out = text;

  // 1) Whole envelope if the model wrapped its tool block.
  out = out.replace(/<\/?[|｜]?DSMLtool_calls[|｜]?>?[\s\S]*?<\/?[|｜]?DSMLtool_calls[|｜]?>/gi, '');

  // 2) Complete paired invoke/parameter blocks.
  const paired = /<[|｜]\s*DSML\s*[|｜]\s*invoke\b[\s\S]*?<\/[|｜]\s*DSML\s*[|｜]\s*invoke\s*>/gi;
  let prev: string;
  do {
    prev = out;
    out = out.replace(paired, '');
  } while (out !== prev);

  // 3) Any leftover lone <DSML ...> opener
  out = out.replace(/<[|｜]\s*DSML[^>]*?(?:\n|$)/gi, '');

  // 4) Clean up leftover stray end-tags.
  out = out.replace(/<\/[|｜]\s*DSML[^>]*>/gi, '');

  return out;
}

/**
 * Fixes common streaming markdown anomalies (unclosed code fences or dangling bold tags)
 * so live streaming doesn't render broken markup.
 */
function autoCloseMarkdown(text: string): string {
  let s = text;

  // Close unclosed code fences
  const codeBlockCount = (s.match(/```/g) || []).length;
  if (codeBlockCount % 2 !== 0) {
    s += '\n```';
  }

  // Close dangling bold `**` at end of text if unclosed
  const boldMatches = s.match(/\*\*/g) || [];
  if (boldMatches.length % 2 !== 0) {
    // If it's a heading-like bold e.g. "**可以访问!\n", close it before newline
    const lastIdx = s.lastIndexOf('**');
    const after = s.slice(lastIdx + 2);
    if (!after.includes('**')) {
      if (after.includes('\n')) {
        const nlIdx = s.indexOf('\n', lastIdx);
        s = s.slice(0, nlIdx) + '**' + s.slice(nlIdx);
      } else {
        s += '**';
      }
    }
  }

  return s;
}

/**
 * Production-grade Markdown renderer powered by `marked`.
 * Supports full GFM (tables, blockquotes, nested lists, headings, inline code, code blocks).
 */
export function renderMarkdown(rawMd: string): string {
  if (!rawMd) return '';
  const cleaned = cleanDSMLTags(rawMd);
  if (!cleaned.trim()) return '';

  const readyMd = autoCloseMarkdown(cleaned);

  try {
    const html = marked.parse(readyMd) as string;
    return html;
  } catch (e) {
    console.warn('marked parse error:', e);
    return cleaned;
  }
}
