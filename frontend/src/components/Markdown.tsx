import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import { remarkCitations } from './remarkCitations';

interface CiteChipProps {
  n?: number;
  node?: unknown;
  onCite?: (n: number) => void;
}

function CiteChip({ n = 0, onCite }: CiteChipProps) {
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

interface MarkdownProps {
  text: string;
  onCite?: (n: number) => void;
}

export function Markdown({ text, onCite }: MarkdownProps) {
  // 'citechip' is emitted by remarkCitations and is not a standard HTML tag,
  // so the key is not in the DOM-typed Components map.
  const components = {
    citechip: (props: CiteChipProps) => <CiteChip {...props} onCite={onCite} />,
  } as Components;

  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkCitations]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
