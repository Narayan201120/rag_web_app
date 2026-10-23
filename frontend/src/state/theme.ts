export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'documind-theme';

export function getTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'light' ? 'light' : 'dark';
}

export function setTheme(theme: Theme): void {
  localStorage.setItem(STORAGE_KEY, theme);
  document.documentElement.dataset.theme = theme;
}

/** Idempotent: index.html also sets this pre-paint to avoid a flash. */
export function initTheme(): void {
  document.documentElement.dataset.theme = getTheme();
}
