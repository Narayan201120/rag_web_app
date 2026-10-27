import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/preact';
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

describe('Markdown blocks', () => {
  it('renders bold, italic and inline code', () => {
    const { container } = render(
      <Markdown text={'A **strong** claim, an _emphasised_ word, and `code()`.'} />,
    );
    expect(container.querySelector('strong')).toHaveTextContent('strong');
    expect(container.querySelector('em')).toHaveTextContent('emphasised');
    expect(container.querySelector('code')).toHaveTextContent('code()');
  });

  it('renders unordered and ordered lists', () => {
    const { container } = render(
      <Markdown text={'Intro\n\n- alpha\n- beta\n\n1. first\n2. second'} />,
    );
    const lists = container.querySelectorAll('ul, ol');
    expect(lists).toHaveLength(2);
    expect(container.querySelectorAll('ul li')).toHaveLength(2);
    expect(container.querySelectorAll('ol li')).toHaveLength(2);
    expect(container.querySelector('ol li')).toHaveTextContent('first');
  });

  it('renders fenced code blocks verbatim', () => {
    const { container } = render(
      <Markdown text={'```python\nprint("hi")\n\nx = 1\n```'} />,
    );
    const pre = container.querySelector('pre');
    expect(pre).not.toBeNull();
    expect(pre!.textContent).toBe('print("hi")\n\nx = 1');
  });

  it('renders gfm tables', () => {
    const { container } = render(
      <Markdown text={'| Name | Score |\n| --- | ---: |\n| ana | 12 |\n| bo | 7 |'} />,
    );
    expect(container.querySelectorAll('th')).toHaveLength(2);
    expect(container.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(container.querySelector('th')).toHaveTextContent('Name');
  });

  it('renders blockquotes', () => {
    const { container } = render(<Markdown text={'> quoted line'} />);
    expect(container.querySelector('blockquote')).toHaveTextContent('quoted line');
  });

  it('renders citation chips inside bold text', () => {
    const { container } = render(<Markdown text={'**Revenue rose [2].**'} />);
    expect(container.querySelector('strong')).toHaveTextContent('Revenue rose');
    expect(container.querySelectorAll('.cite-chip')).toHaveLength(1);
  });

  it('refuses javascript: links but keeps their label', () => {
    const { container } = render(<Markdown text={'[click me](javascript:alert(1))'} />);
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toContain('click me');
  });

  it('opens external links safely', () => {
    render(<Markdown text={'[paper](https://example.com/a)'} />);
    const link = screen.getByRole('link', { name: 'paper' });
    expect(link).toHaveAttribute('href', 'https://example.com/a');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAttribute('target', '_blank');
  });
});
