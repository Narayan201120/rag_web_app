/**
 * Remark plugin: turn bare [n] citation markers in text nodes into
 * `citechip` elements, which Markdown.tsx maps to interactive chips.
 * Markdown links like [text](url) are untouched — only bare numbers count.
 */

const CITE_RE = /\[(\d{1,2})\]/g;

interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
  data?: Record<string, unknown>;
}

function transform(node: MdNode): void {
  if (!node.children) return;
  const nextChildren: MdNode[] = [];

  for (const child of node.children) {
    if (child.type === 'text' && typeof child.value === 'string' && CITE_RE.test(child.value)) {
      CITE_RE.lastIndex = 0;
      let last = 0;
      for (let m = CITE_RE.exec(child.value); m !== null; m = CITE_RE.exec(child.value)) {
        if (m.index > last) {
          nextChildren.push({ type: 'text', value: child.value.slice(last, m.index) });
        }
        nextChildren.push({
          type: 'citechip',
          data: { hName: 'citechip', hProperties: { n: Number(m[1]) } },
        });
        last = m.index + m[0].length;
      }
      if (last < child.value.length) {
        nextChildren.push({ type: 'text', value: child.value.slice(last) });
      }
    } else {
      transform(child);
      nextChildren.push(child);
    }
  }

  node.children = nextChildren;
}

export function remarkCitations(): (tree: MdNode) => void {
  return (tree) => transform(tree);
}
