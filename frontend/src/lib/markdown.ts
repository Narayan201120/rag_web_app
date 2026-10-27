/**
 * Small markdown parser for answers. Covers what the chat model emits:
 * headings, paragraphs, lists, fenced code, blockquotes, GFM tables,
 * bold/italic/strike/inline code, links, and [n] citation markers.
 *
 * It returns plain data; Markdown.tsx turns that into React elements.
 * Nothing is injected as HTML, so untrusted answer text cannot run script.
 */

export type Inline =
  | { kind: 'text'; value: string }
  | { kind: 'code'; value: string }
  | { kind: 'strong'; children: Inline[] }
  | { kind: 'em'; children: Inline[] }
  | { kind: 'del'; children: Inline[] }
  | { kind: 'link'; href: string; children: Inline[] }
  | { kind: 'cite'; n: number };

export type Align = 'left' | 'center' | 'right';

export type Block =
  | { kind: 'p'; inline: Inline[] }
  | { kind: 'h'; level: 1 | 2 | 3 | 4 | 5 | 6; inline: Inline[] }
  | { kind: 'code'; lang: string; text: string }
  | { kind: 'ul'; items: Inline[][] }
  | { kind: 'ol'; start: number; items: Inline[][] }
  | { kind: 'quote'; blocks: Block[] }
  | { kind: 'hr' }
  | { kind: 'table'; align: Align[]; head: Inline[][]; rows: Inline[][][] };

const INLINE =
  /`([^`\n]+)`|\*\*([\s\S]+?)\*\*|(?<![\w])__([^_]+)__(?![\w])|~~([^~]+)~~|\*([^*\n]+)\*|(?<![\w])_([^_\n]+)_(?![\w])|\[([^\]\n]*)\]\(([^)\s]+)\)|\[(\d{1,2})\]/g;

const FENCE_OPEN = /^\s{0,3}```\s*([\w+-]*)\s*$/;
const FENCE_CLOSE = /^\s{0,3}```\s*$/;
const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const HR = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const QUOTE = /^\s*>\s?/;
const LIST_ITEM = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const TABLE_SEP = /^\s*\|?\s*:?-{1,}:?\s*(?:\|\s*:?-{1,}:?\s*)*\|?\s*$/;

/** Only these schemes become links. Anything else keeps its label as text. */
function safeHref(raw: string): string | null {
  const href = raw.trim();
  if (/^https?:\/\//i.test(href) || /^mailto:/i.test(href)) return href;
  if (href.startsWith('/') || href.startsWith('#')) return href;
  return null;
}

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  // A fresh regex per call: a shared /g instance would have its lastIndex
  // reset by the recursive calls below and re-match the same token forever.
  const pattern = new RegExp(INLINE.source, 'g');
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) out.push({ kind: 'text', value: text.slice(last, match.index) });
    const [, code, strong1, strong2, del, em1, em2, label, href, cite] = match;

    if (code !== undefined) {
      out.push({ kind: 'code', value: code });
    } else if (strong1 !== undefined || strong2 !== undefined) {
      out.push({ kind: 'strong', children: parseInline(strong1 ?? strong2 ?? '') });
    } else if (del !== undefined) {
      out.push({ kind: 'del', children: parseInline(del) });
    } else if (em1 !== undefined || em2 !== undefined) {
      out.push({ kind: 'em', children: parseInline(em1 ?? em2 ?? '') });
    } else if (label !== undefined && href !== undefined) {
      const safe = safeHref(href);
      out.push(
        safe
          ? { kind: 'link', href: safe, children: parseInline(label) }
          : { kind: 'text', value: label },
      );
    } else if (cite !== undefined) {
      out.push({ kind: 'cite', n: Number(cite) });
    }
    last = match.index + match[0].length;
  }

  if (last < text.length) out.push({ kind: 'text', value: text.slice(last) });
  return out;
}

function splitRow(line: string): string[] {
  let row = line.trim();
  if (row.startsWith('|')) row = row.slice(1);
  if (row.endsWith('|')) row = row.slice(0, -1);
  return row.split('|').map((cell) => cell.trim());
}

function aligns(line: string): Align[] {
  return splitRow(line).map((cell) => {
    const left = cell.startsWith(':');
    const right = cell.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    return 'left';
  });
}

function startsBlock(line: string): boolean {
  return (
    FENCE_OPEN.test(line) ||
    HEADING.test(line) ||
    HR.test(line) ||
    QUOTE.test(line) ||
    LIST_ITEM.test(line)
  );
}

export function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  return parseLines(lines);
}

function parseLines(lines: string[]): Block[] {
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    if (!line.trim()) {
      i += 1;
      continue;
    }

    const fence = FENCE_OPEN.exec(line);
    if (fence) {
      const lang = fence[1] ?? '';
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !FENCE_CLOSE.test(lines[i]!)) {
        body.push(lines[i]!);
        i += 1;
      }
      i += 1; // closing fence, or past the end
      blocks.push({ kind: 'code', lang, text: body.join('\n') });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      const level = Math.min(heading[1]!.length, 6) as 1 | 2 | 3 | 4 | 5 | 6;
      blocks.push({ kind: 'h', level, inline: parseInline(heading[2]!) });
      i += 1;
      continue;
    }

    if (HR.test(line)) {
      blocks.push({ kind: 'hr' });
      i += 1;
      continue;
    }

    if (QUOTE.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i]!)) {
        quoted.push(lines[i]!.replace(QUOTE, ''));
        i += 1;
      }
      blocks.push({ kind: 'quote', blocks: parseLines(quoted) });
      continue;
    }

    if (line.includes('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]!)) {
      const align = aligns(lines[i + 1]!);
      const head = splitRow(line).map(parseInline);
      const rows: Inline[][][] = [];
      i += 2;
      while (i < lines.length && lines[i]!.includes('|') && lines[i]!.trim()) {
        rows.push(splitRow(lines[i]!).map(parseInline));
        i += 1;
      }
      blocks.push({ kind: 'table', align, head, rows });
      continue;
    }

    const item = LIST_ITEM.exec(line);
    if (item) {
      const ordered = /\d/.test(item[2]!);
      const start = ordered ? Number.parseInt(item[2]!, 10) : 1;
      const items: Inline[][] = [];
      while (i < lines.length) {
        const current = LIST_ITEM.exec(lines[i]!);
        if (!current) break;
        const isOrdered = /\d/.test(current[2]!);
        if (isOrdered !== ordered) break;
        items.push(parseInline(current[3]!));
        i += 1;
        while (i < lines.length && !lines[i]!.trim()) {
          const peek = i + 1 < lines.length ? LIST_ITEM.exec(lines[i + 1]!) : null;
          if (!peek || /\d/.test(peek[2]!) !== ordered) break;
          i += 1;
        }
      }
      blocks.push(ordered ? { kind: 'ol', start, items } : { kind: 'ul', items });
      continue;
    }

    const paragraph: string[] = [line.trim()];
    i += 1;
    while (i < lines.length && lines[i]!.trim() && !startsBlock(lines[i]!)) {
      const next = lines[i]!;
      if (next.includes('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]!)) break;
      paragraph.push(next.trim());
      i += 1;
    }
    blocks.push({ kind: 'p', inline: parseInline(paragraph.join(' ')) });
  }

  return blocks;
}
