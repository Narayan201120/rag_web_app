import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTheme, initTheme, setTheme } from './theme';

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    clear: () => store.clear(),
  });
  delete document.documentElement.dataset.theme;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('theme', () => {
  it('defaults to dark when nothing is stored', () => {
    expect(getTheme()).toBe('dark');
    initTheme();
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('stores and applies the light theme', () => {
    setTheme('light');
    expect(localStorage.getItem('documind-theme')).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(getTheme()).toBe('light');
  });

  it('treats unknown stored values as dark', () => {
    localStorage.setItem('documind-theme', 'sepia');
    expect(getTheme()).toBe('dark');
  });
});
