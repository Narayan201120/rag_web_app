import { describe, expect, it } from 'vitest';
import { extOf, formatBytes, formatNumber, initials, isAllowedFile, shortName } from './format';

describe('formatBytes', () => {
  it('formats bytes, KB, and MB', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1_048_576)).toBe('1.0 MB');
  });

  it('falls back to a dash for invalid input', () => {
    expect(formatBytes(Number.NaN)).toBe('—');
    expect(formatBytes(-5)).toBe('—');
  });
});

describe('file helpers', () => {
  it('detects allowed extensions case-insensitively', () => {
    expect(isAllowedFile('Report.PDF')).toBe(true);
    expect(isAllowedFile('notes.md')).toBe(true);
    expect(isAllowedFile('virus.exe')).toBe(false);
    expect(isAllowedFile('noext')).toBe(false);
  });

  it('extracts extensions', () => {
    expect(extOf('a.b.txt')).toBe('.txt');
    expect(extOf('noext')).toBe('');
  });

  it('shortens long names while keeping the extension', () => {
    const short = shortName('a-very-long-document-name-indeed.pdf', 20);
    expect(short.length).toBeLessThanOrEqual(20);
    expect(short.endsWith('.pdf')).toBe(true);
  });
});

describe('initials', () => {
  it('takes the first letters of the first two words', () => {
    expect(initials('Ada Lovelace')).toBe('AL');
  });

  it('falls back to the first two characters', () => {
    expect(initials('narayan')).toBe('NA');
    expect(initials('a.b@example.com')).toBe('AB');
  });
});

describe('formatNumber', () => {
  it('adds thousands separators', () => {
    expect(formatNumber(1520)).toBe('1,520');
  });
});
