// Markdown-lite for Hub pages and Newsroom posts (track C). Customer content is never HTML: this parser turns text into
// a tiny block tree (headings, paragraphs, bullet lists) of text and link spans, and the UI renders it with React text
// nodes only. Links are kept only for http(s) and mailto; anything else (javascript:, data:, relative paths) stays text.

export type Span = { t: "text"; text: string } | { t: "link"; text: string; href: string } | { t: "strong"; text: string };
export type Block = { t: "h"; level: 2 | 3; spans: Span[] } | { t: "p"; spans: Span[] } | { t: "ul"; items: Span[][] };

export function safeHref(raw: string): string | null {
  const href = raw.trim();
  if (/^https?:\/\/[^\s<>"']+$/i.test(href)) {
    try {
      const u = new URL(href);
      return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
    } catch {
      return null;
    }
  }
  if (/^mailto:[^\s<>"':]+@[^\s<>"']+$/i.test(href)) return href;
  return null;
}

const TOKEN = /\[([^\]\n]{1,200})\]\(([^)\s]{1,2000})\)|\*\*([^*\n]{1,500})\*\*|(https?:\/\/[^\s<>()"']+)/g;

export function parseSpans(line: string): Span[] {
  const out: Span[] = [];
  let last = 0;
  for (const m of line.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ t: "text", text: line.slice(last, at) });
    if (m[1] !== undefined) {
      const href = safeHref(m[2]);
      out.push(href ? { t: "link", text: m[1], href } : { t: "text", text: m[0] });
    } else if (m[3] !== undefined) {
      out.push({ t: "strong", text: m[3] });
    } else {
      const href = safeHref(m[4]);
      out.push(href ? { t: "link", text: m[4], href } : { t: "text", text: m[4] });
    }
    last = at + m[0].length;
  }
  if (last < line.length) out.push({ t: "text", text: line.slice(last) });
  return out;
}

export function parseMarkdownLite(src: string | null | undefined): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: Span[][] | null = null;
  const flush = () => {
    if (para.length) blocks.push({ t: "p", spans: parseSpans(para.join(" ")) });
    para = [];
    if (list) blocks.push({ t: "ul", items: list });
    list = null;
  };
  for (const raw of (src ?? "").replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) { flush(); continue; }
    const h = /^(#{1,3})\s+(.+)$/.exec(line);
    if (h) { flush(); blocks.push({ t: "h", level: h[1].length === 3 ? 3 : 2, spans: parseSpans(h[2]) }); continue; }
    const li = /^\s*[-*]\s+(.+)$/.exec(line);
    if (li) {
      if (para.length) { blocks.push({ t: "p", spans: parseSpans(para.join(" ")) }); para = []; }
      (list ??= []).push(parseSpans(li[1]));
      continue;
    }
    if (list) { blocks.push({ t: "ul", items: list }); list = null; }
    para.push(line.trim());
  }
  flush();
  return blocks;
}
