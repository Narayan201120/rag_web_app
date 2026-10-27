import { memo, useMemo } from 'react';
import type { ReactNode } from 'react';
import { parseBlocks } from '../lib/markdown';
import type { Block, Inline } from '../lib/markdown';

interface CiteChipProps {
  n: number;
  onCite?: (n: number) => void;
}

function CiteChip({ n, onCite }: CiteChipProps) {
  if (onCite) {
    return (
      <button
        type="button"
        className="cite-chip"
        title={`Show citation ${n}`}
        onClick={() => onCite(n)}
      >
        {n}
      </button>
    );
  }
  return (
    <span className="cite-chip" role="presentation">
      {n}
    </span>
  );
}

function renderInline(nodes: Inline[], onCite?: (n: number) => void): ReactNode[] {
  return nodes.map((node, index) => {
    switch (node.kind) {
      case 'text':
        return node.value;
      case 'code':
        return <code key={index}>{node.value}</code>;
      case 'strong':
        return <strong key={index}>{renderInline(node.children, onCite)}</strong>;
      case 'em':
        return <em key={index}>{renderInline(node.children, onCite)}</em>;
      case 'del':
        return <del key={index}>{renderInline(node.children, onCite)}</del>;
      case 'link': {
        const external = /^https?:\/\//i.test(node.href);
        return (
          <a
            key={index}
            href={node.href}
            {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          >
            {renderInline(node.children, onCite)}
          </a>
        );
      }
      case 'cite':
        return <CiteChip key={index} n={node.n} onCite={onCite} />;
    }
  });
}

function renderBlock(block: Block, index: number, onCite?: (n: number) => void): ReactNode {
  switch (block.kind) {
    case 'p':
      return <p key={index}>{renderInline(block.inline, onCite)}</p>;
    case 'h': {
      const Tag = `h${block.level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
      return <Tag key={index}>{renderInline(block.inline, onCite)}</Tag>;
    }
    case 'code':
      return (
        <pre key={index}>
          <code className={block.lang ? `language-${block.lang}` : undefined}>{block.text}</code>
        </pre>
      );
    case 'ul':
      return (
        <ul key={index}>
          {block.items.map((item, i) => (
            <li key={i}>{renderInline(item, onCite)}</li>
          ))}
        </ul>
      );
    case 'ol':
      return (
        <ol key={index} start={block.start === 1 ? undefined : block.start}>
          {block.items.map((item, i) => (
            <li key={i}>{renderInline(item, onCite)}</li>
          ))}
        </ol>
      );
    case 'quote':
      return <blockquote key={index}>{block.blocks.map((b, i) => renderBlock(b, i, onCite))}</blockquote>;
    case 'hr':
      return <hr key={index} />;
    case 'table':
      return (
        <div className="md-table-wrap" key={index}>
          <table>
            <thead>
              <tr>
                {block.head.map((cell, i) => (
                  <th key={i} style={{ textAlign: block.align[i] ?? 'left' }}>
                    {renderInline(cell, onCite)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c} style={{ textAlign: block.align[c] ?? 'left' }}>
                      {renderInline(cell, onCite)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

interface MarkdownProps {
  text: string;
  onCite?: (n: number) => void;
}

function MarkdownImpl({ text, onCite }: MarkdownProps) {
  const blocks = useMemo(() => parseBlocks(text), [text]);
  return <div className="md">{blocks.map((block, i) => renderBlock(block, i, onCite))}</div>;
}

/** Memoised: streaming answers re-render only the row whose text changed. */
export const Markdown = memo(MarkdownImpl);
