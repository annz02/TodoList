// Lightweight report / chat Markdown renderer.
// Produces only whitelisted HTML tags (<strong>, <em>, <code>, <a>, headings,
// lists, <hr>). All raw text is HTML-escaped so untrusted model output cannot
// inject markup.

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Format inline markdown: backticks, **bold**, *italic*, [text](url). */
function inline(raw: string): string {
  if (!raw) return '';
  const seeds: string[] = [];

  // Guards trust-worthy generated markup against the later escaping pass.
  // We capture placeholders (\u0000) for each generated tag and reinsert them
  // AFTER escapeHtml so the raw user/model text cannot inject markup while our
  // own <strong>/<em>/<a>/<code> tags survive intact.
  const protect = (fragment: string) => {
    const idx = seeds.length;
    seeds[idx] = fragment;
    return `\u0000${idx}\u0000`;
  };

  // Pull out inline code first so its content isn't run through formatting.
  const withCode = raw.replace(/`([^`]+)`/g, (_m, code) => protect(`<code class="chat-inline-code">${escapeHtml(code)}</code>`));

  let out = withCode
    .replace(
      /\*\*([^*]+)\*\*/g,
      (_m, body) => protect(`<strong>${escapeHtml(body)}</strong>`),
    )
    .replace(
      /(^|[\s(>])\*([^*]+?)\*([\s.,;:!?<),]|$)/g,
      (_m, pre, body, post) => `${pre}${protect(`<em>${escapeHtml(body)}</em>`)}${post}`,
    )
    .replace(
      /\[([^\]]+)\]\((?:<)?(https?:\/\/[^)\s>]+)(?:>)?\)/g,
      (_m, label, url) => {
        const safe = escapeHtml(url.replace(/["'<>]/g, ''));
        return protect(`<a href="${safe}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`);
      },
    );

  out = escapeHtml(out);
  out = out.replace(/\u0000(\d+)\u0000/g, (_m, i) => seeds[Number(i)] || '');
  return out;
}

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

  // 3) Any leftover lone <DSML ...> opener: drop only the broken stub up to the
  //    first newline, so genuine following text is kept instead of swallowed.
  out = out.replace(/<[|｜]\s*DSML[^>]*?(?:\n|$)/gi, '');

  // 4) Clean up leftover stray end-tags.
  out = out.replace(/<\/[|｜]\s*DSML[^>]*>/gi, '');

  // NOTE: Do NOT call .trim() here, because doing so during streaming deletes
  // trailing newlines before the next chunk arrives.
  return out;
}

/**
 * Intelligently normalizes text that may have been squashed by the model or
 * missing explicit line breaks, ensuring section titles, numbered list items,
 * and bullet points are properly formatted with newlines.
 */
export function normalizeMarkdownText(raw: string): string {
  if (!raw) return '';
  let s = raw;

  // 1. Separate Chinese section headers (e.g. "整理：一、" -> "整理：\n\n一、")
  s = s.replace(/([。！？；：\n]|\s|^)([一二三四五六七八九十]+、)/g, '$1\n\n$2');

  // 2. Separate numbered list items glued to preceding characters (e.g. "待办应用1. Planify", "2026年9月2. WeekToDo")
  s = s.replace(/([^\d\n\s])(\d+[.、]\s+)/g, '$1\n\n$2');

  // 3. Separate bullet items glued after sentence endings (e.g. "不够完整。-除了" -> "不够完整。\n\n- 除了")
  s = s.replace(/([。！？；])\s*([-\*•])\s*/g, '$1\n\n$2 ');

  // 4. Separate summary/conclusion blocks (e.g. "不准确。小结：" -> "不准确。\n\n小结：")
  s = s.replace(/([。！？；\n]|\s|^)(小结[：:]|总结[：:]|提示[：:])/g, '$1\n\n$2');

  // 5. Collapse excessive blank lines to max 2
  s = s.replace(/\n{3,}/g, '\n\n');

  return s;
}

/**
 * Renders both:
 *  - the structured daily-report text produced by the built-in generator
 *    (report titles in `**一、…**` form + indented bordered content blocks),
 *  - and ordinary chat markdown (fenced code, headings, bullet lists, `---`).
 */
export function renderMarkdown(rawMd: string): string {
  if (!rawMd) return '';
  const cleaned = cleanDSMLTags(rawMd);
  if (!cleaned.trim()) return '';

  // Apply layout normalization so squashed lists or glued headers are gracefully expanded
  const md = normalizeMarkdownText(cleaned);
  const lines = md.split('\n');
  let html = '';

  let inReport = false; // inside <div class="chat-report-content">
  let inCode = false;
  let codeLang = '';
  const codeBuf: string[] = [];

  const closeCode = () => {
    if (inCode) {
      if (codeBuf.length) {
        html += `<pre class="chat-code"><code class="lang-${codeLang || 'text'}">${escapeHtml(codeBuf.join('\n'))}</code></pre>`;
      }
      codeBuf.length = 0;
      codeLang = '';
      inCode = false;
    }
  };
  const closeReport = () => {
    if (inReport) {
      html += '</div>';
      inReport = false;
    }
  };
  const paragraph = (text: string) => {
    html += `<p class="chat-p">${inline(text)}</p>`;
  };

  for (const raw of lines) {
    const trimmed = raw.trim();

    // Fenced code
    const fence = trimmed.match(/^```(\w*)/);
    if (fence) {
      closeReport();
      if (inCode) closeCode();
      else { inCode = true; codeLang = fence[1] || ''; }
      continue;
    }
    if (inCode) { codeBuf.push(raw); continue; }

    if (!trimmed) continue;

    if (trimmed === '---' || trimmed === '***') {
      closeReport();
      html += '<hr class="chat-divider"/>';
      continue;
    }

    // Report section title (formatted as `**一、 …**` or `一、…` or `**📝 …**`) -> bordered block
    if (/^(?:\*\*)?(?:📝|[一二三四五六七八九十]+、)/.test(trimmed)) {
      closeReport();
      const title = trimmed.replace(/\*\*/g, '');
      html += `<div class="chat-report-title">${inline(title)}</div>`;
      html += '<div class="chat-report-content">';
      inReport = true;
      continue;
    }

    // Summary / note callout box (e.g. `小结：…` or `**小结：**…` or `总结：…`)
    if (/^(?:\*\*)?(?:小结|总结|提示)[：:]/.test(trimmed)) {
      closeReport();
      html += `<div class="chat-summary-box">${inline(trimmed)}</div>`;
      continue;
    }

    // ATX headings
    const h = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      closeReport();
      const lvl = Math.min(6, h[1].length);
      html += `<h${lvl} class="chat-h chat-h${lvl}">${inline(h[2])}</h${lvl}>`;
      continue;
    }

    // Bullet list items (top-level bullets / indented sub bullets)
    if (/^[-*•]\s+/.test(trimmed)) {
      const indent = raw.length - raw.replace(/^\s*/, '').length;
      const item = trimmed.replace(/^[-*•]\s+/, '');
      if (indent > 0) {
        html += `<div class="chat-subline">${inline(item)}</div>`;
      } else {
        closeReport();
        html += `<p class="chat-p chat-bullet"><span class="bullet-dot">•</span> ${inline(item)}</p>`;
      }
      continue;
    }

    // Ordered list top-level (e.g. "1. text")
    const oLine = trimmed.match(/^(\d+)[.、]\s+(.*)$/);
    if (oLine && !/^\d{4}[.、]/.test(trimmed)) {
      closeReport();
      html += `<p class="chat-p chat-num-item"><b class="num-badge">${oLine[1]}.</b> ${inline(oLine[2])}</p>`;
      continue;
    }

    // Indented continuation inside a report content block -> sub line
    if (inReport && (raw.startsWith('  ') || raw.startsWith('\t'))) {
      html += `<div class="chat-subline">${inline(trimmed)}</div>`;
      continue;
    }

    // Plain paragraph
    closeReport();
    paragraph(trimmed);
  }

  closeCode();
  closeReport();
  return html;
}
