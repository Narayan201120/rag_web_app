export type TextSegment = { type: 'text'; value: string };
export type CiteSegment = { type: 'cite'; n: number };
export type Segment = TextSegment | CiteSegment;

const CITE_RE = /\[(\d{1,2})\]/g;

/**
 * Split a chunk of plain text into text runs and [n] citation markers.
 * Markdown links like [text](url) are left alone: only bare numbers in
 * brackets count as citations.
 */
export function splitByCitations(text: string): Segment[] {
  const segments: Segment[] = [];
  let last = 0;
  CITE_RE.lastIndex = 0;
  for (let m = CITE_RE.exec(text); m !== null; m = CITE_RE.exec(text)) {
    if (m.index > last) {
      segments.push({ type: 'text', value: text.slice(last, m.index) });
    }
    segments.push({ type: 'cite', n: Number(m[1]) });
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    segments.push({ type: 'text', value: text.slice(last) });
  }
  return segments;
}

/** Deduplicate citation numbers, keeping first-seen order, bounded to the list. */
export function citedNumbers(text: string, maxIndex: number): number[] {
  const seen: number[] = [];
  for (const seg of splitByCitations(text)) {
    if (seg.type === 'cite' && seg.n >= 1 && seg.n <= maxIndex && !seen.includes(seg.n)) {
      seen.push(seg.n);
    }
  }
  return seen;
}
