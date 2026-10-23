import { describe, expect, it } from 'vitest';
import { citedNumbers, splitByCitations } from './citations';

describe('splitByCitations', () => {
  it('splits text into runs and citation markers', () => {
    const segments = splitByCitations('Costs held flat [1], margin improved [12].');
    expect(segments).toEqual([
      { type: 'text', value: 'Costs held flat ' },
      { type: 'cite', n: 1 },
      { type: 'text', value: ', margin improved ' },
      { type: 'cite', n: 12 },
      { type: 'text', value: '.' },
    ]);
  });

  it('returns a single text segment when there are no markers', () => {
    expect(splitByCitations('no citations here')).toEqual([
      { type: 'text', value: 'no citations here' },
    ]);
  });

  it('does not treat markdown links as citations', () => {
    const segments = splitByCitations('see [the paper](http://example.com) for detail');
    expect(segments.every((seg) => seg.type === 'text')).toBe(true);
  });

  it('handles adjacent markers', () => {
    const segments = splitByCitations('[1][2]');
    expect(segments).toEqual([
      { type: 'cite', n: 1 },
      { type: 'cite', n: 2 },
    ]);
  });
});

describe('citedNumbers', () => {
  it('deduplicates and bounds to the citation list', () => {
    expect(citedNumbers('a [3] b [3] c [9] d [1]', 3)).toEqual([3, 1]);
  });
});
