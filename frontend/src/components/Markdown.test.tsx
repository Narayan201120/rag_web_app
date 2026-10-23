import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Markdown } from './Markdown';

describe('Markdown citation chips', () => {
  it('renders [n] markers as clickable citation chips', async () => {
    const onCite = vi.fn();
    const { container } = render(
      <Markdown text={'Costs held flat [1], and revenue followed [2].'} onCite={onCite} />,
    );
    const chips = container.querySelectorAll<HTMLButtonElement>('button.cite-chip');
    expect(chips).toHaveLength(2);
    await userEvent.click(chips[1]!);
    expect(onCite).toHaveBeenCalledWith(2);
  });

  it('does not treat markdown links as citation chips', () => {
    const { container } = render(
      <Markdown text={'See [the paper](http://example.com) for detail.'} />,
    );
    expect(container.querySelectorAll('.cite-chip')).toHaveLength(0);
    expect(screen.getByRole('link', { name: 'the paper' })).toBeInTheDocument();
  });

  it('renders chips as inert spans when no onCite handler is given', () => {
    const { container } = render(<Markdown text={'Grounded claim [1].'} />);
    const chips = container.querySelectorAll<HTMLElement>('span.cite-chip');
    expect(chips).toHaveLength(1);
    expect(chips[0]).toHaveTextContent('1');
  });

  it('keeps markdown structure (headings, code) intact', () => {
    const { container } = render(
      <Markdown text={'## Pipeline\n\n`hybrid search` combines [1] signals.'} />,
    );
    expect(screen.getByRole('heading', { name: 'Pipeline' })).toBeInTheDocument();
    expect(container.querySelector('code')).toHaveTextContent('hybrid search');
    expect(container.querySelector('span.cite-chip')).not.toBeNull();
  });
});
